# Passwordless Magic-Link Auth Implementation Plan

## Overview

Replace password-based sign-up/sign-in with a single passwordless flow
(FR-001): a user enters their email once, then completes login either by
clicking a magic link or typing a 6-digit code from the same email.
Password code paths (`signInWithPassword`, `signUp`, password fields) are
removed entirely — not kept dormant. This is roadmap Foundation **F-02**,
parallel with F-01, both prerequisites for S-01.

## Current State Analysis

- Auth is fully password-based: `SignInForm`/`SignUpForm` collect
  email+password and POST to `src/pages/api/auth/{signin,signup}.ts`, which
  call `signInWithPassword`/`signUp`.
- `PasswordToggle.tsx` is used only by those two forms (`grep` confirms no
  other references) — safe to delete alongside them.
- `src/lib/supabase.ts` already wires a `@supabase/ssr` server client whose
  cookie handlers work for any Supabase Auth method, including OTP — no
  changes needed there.
- `src/middleware.ts` protects `/dashboard` via a `PROTECTED_ROUTES` array
  and sets `context.locals.user`; it has no logic today for redirecting an
  already-authenticated visitor away from the auth page.
- `src/pages/auth/confirm-email.astro` currently branches on
  `import.meta.env.DEV` to show either "registration successful" (dev,
  where Supabase auto-confirms signups) or "check your email" (prod). That
  branching is specific to password-signup email confirmation, which no
  longer exists after this change.
- No test framework is installed (same as F-01) — verification here is
  static grep-based checks plus manual walkthroughs against the real
  Supabase project.

## Desired End State

A single `/auth/signin` page collects only an email address. Submitting it
calls Supabase's `signInWithOtp`, which emails the user both a magic link
and a 6-digit code. The user completes login by either clicking the link
(handled by a new `/api/auth/callback` route via PKCE code exchange) or
entering the code on the repurposed `/auth/confirm-email` screen (handled
by a new `/api/auth/verify-code` route via `verifyOtp`). No password field
exists anywhere in the auth UI or API routes. An already-authenticated user
visiting `/auth/signin` is redirected to `/dashboard`.

Verification: walk both completion paths (link click, code entry) end to
end against the real hosted Supabase project and confirm a session cookie
is set and `/dashboard` shows the logged-in user.

### Key Discoveries:

- Supabase's default email-OTP flow with `emailRedirectTo` set uses PKCE:
  the emailed link redirects to `emailRedirectTo` with a `?code=` param,
  exchanged via `exchangeCodeForSession(code)` — not the older
  `token_hash`/`verifyOtp`-from-URL pattern.
- Because F-01's `handle_new_user` trigger fires on any `auth.users` insert
  (`supabase/migrations/20260825120000_fairy_data_foundation.sql`), a
  first-time magic-link sign-in (`shouldCreateUser: true`) automatically
  gets a `profiles` row with no extra work here.
- The existing password sign-in redirects to `/` after success
  (`src/pages/api/auth/signin.ts:16`) — this plan keeps that target for a
  *completed* login, while the *already-logged-in guard* redirects to
  `/dashboard` per the approved design decision (these are two different
  moments: post-login landing vs. bounce-away-from-auth-page).

## What We're NOT Doing

- No changes to `/dashboard` or `src/pages/api/auth/signout.ts` — signout
  is method-agnostic.
- No rate-limit/cooldown UI beyond what Supabase's own OTP throttle
  produces as an error message.
- No dedicated error page for expired/invalid links — errors surface as a
  banner on `/auth/signin` via the existing `ServerError` pattern.
- No data-model changes (auth.users / profiles already covered by F-01).
- No preservation of `/auth/signup` as a route or redirect — it's deleted.

## Implementation Approach

Three new API routes replace the two password routes: one to request the
link+code, one to verify a typed code, one to complete the link-click via
PKCE exchange. One new form component (email-only) replaces both existing
forms; a second new form component handles the code fallback, hosted on the
repurposed confirm-email screen. `middleware.ts` gains one guard clause.

## Critical Implementation Details

**Supabase Auth redirect URL allow-list**: `exchangeCodeForSession` fails
if the `emailRedirectTo` origin isn't in the Supabase project's Auth →
URL Configuration → Redirect URLs allow-list. This is an external
dashboard setting, invisible from the codebase, and its absence produces a
generic exchange error that looks identical to an expired link — Phase 3
must configure this before the link-click path can be verified at all.

## Phase 1: Backend auth routes

### Overview

Add the three OTP-based API routes, remove the two password routes, add
the auth-guard redirect to middleware.

### Changes Required:

#### 1. Request link + code

**File**: `src/pages/api/auth/request-link.ts` (new; replaces `signup.ts`
and `signin.ts`)

**Intent**: Single entry point for both first-time and returning users —
Supabase creates the account on first request, signs in on subsequent
ones. No server-side branching between "new" and "existing" user.

**Contract**: `POST` handler reading `email` from form data. Calls
`supabase.auth.signInWithOtp({ email, options: { emailRedirectTo:
`${new URL(context.request.url).origin}/api/auth/callback`,
shouldCreateUser: true } })`. On Supabase error, redirect to
`/auth/signin?error=<message>`. On success, redirect to
`/auth/confirm-email?email=<encoded email>`.

#### 2. Verify typed code

**File**: `src/pages/api/auth/verify-code.ts` (new)

**Intent**: Complete login via the 6-digit code fallback without requiring
the link click.

**Contract**: `POST` handler reading `email` and `code` from form data.
Calls `supabase.auth.verifyOtp({ email, token: code, type: "email" })`. On
error, redirect to `/auth/confirm-email?email=<encoded email>&error=<message>`.
On success, redirect to `/`.

#### 3. Complete link click

**File**: `src/pages/api/auth/callback.ts` (new)

**Intent**: Complete login via the clicked magic link.

**Contract**: `GET` handler (the emailed link is a plain navigation, not a
form submission). Reads `code` from `context.url.searchParams`. If absent,
or if `supabase.auth.exchangeCodeForSession(code)` errors, redirect to
`/auth/signin?error=<message>`. On success, redirect to `/`.

#### 4. Remove password routes

**File**: delete `src/pages/api/auth/signup.ts`, delete
`src/pages/api/auth/signin.ts`.

**Intent**: No password code path remains anywhere in the API surface.

#### 5. Auth-guard redirect

**File**: `src/middleware.ts`

**Intent**: An already-authenticated visitor to the sign-in page is bounced
to `/dashboard` instead of seeing a login form.

**Contract**: after `context.locals.user` is resolved and before the
existing `PROTECTED_ROUTES` check, add: if
`context.url.pathname === "/auth/signin"` and `context.locals.user` is
truthy, `return context.redirect("/dashboard")`.

### Success Criteria:

#### Automated Verification:

- New routes exist and call the right Supabase methods: `grep -q "signInWithOtp" src/pages/api/auth/request-link.ts && grep -q "verifyOtp" src/pages/api/auth/verify-code.ts && grep -q "exchangeCodeForSession" src/pages/api/auth/callback.ts`
- Old password routes removed: `test ! -f src/pages/api/auth/signup.ts && test ! -f src/pages/api/auth/signin.ts`
- Middleware guard present: `grep -q "/auth/signin" src/middleware.ts && grep -q "/dashboard" src/middleware.ts`
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Code reviewed for correctness (redirect targets, error propagation)
  before moving to frontend work.

---

## Phase 2: Frontend forms & pages

### Overview

Replace the password forms with the unified email form and the code
fallback, and update the two auth pages accordingly.

### Changes Required:

#### 1. Unified email form

**File**: `src/components/auth/AuthForm.tsx` (new; replaces `SignInForm.tsx`
and `SignUpForm.tsx`)

**Intent**: Single email-only form, POSTing to the new request-link route.

**Contract**: reuses `FormField`, `ServerError`, `SubmitButton` exactly as
the deleted forms did; same client-side email regex validation; no
password field; `props: { serverError?: string | null }`; `<form
method="POST" action="/api/auth/request-link">`.

#### 2. Code entry fallback

**File**: `src/components/auth/CodeVerifyForm.tsx` (new)

**Intent**: Lets the user complete login by typing the code instead of
clicking the link, without leaving the check-email screen.

**Contract**: `props: { email: string; serverError?: string | null }`.
`<form method="POST" action="/api/auth/verify-code">` containing a hidden
`email` input (value from props) plus a `code` `FormField` (`maxLength={6}`,
`inputMode="numeric"`); reuses `ServerError`/`SubmitButton`.

#### 3. Unified sign-in page

**File**: `src/pages/auth/signin.astro`

**Intent**: Becomes the single auth entry point.

**Contract**: renders `AuthForm` instead of `SignInForm`; removes the
"Don't have an account? Sign up" link (no separate signup page exists
anymore); keeps the existing `Layout` + `error` query-param plumbing.

#### 4. Check-email + code screen

**File**: `src/pages/auth/confirm-email.astro`

**Intent**: Repurposed from "post-signup confirmation" to "we sent you a
link and a code" — the landing screen after requesting a link, now also
hosting the code-entry fallback.

**Contract**: drop the `import.meta.env.DEV` branching (no longer
applicable — there's no separate signup step to have "auto-confirmed" in
dev). Reads `email` and `error` from `Astro.url.searchParams`. Renders
static "check your email" copy, `CodeVerifyForm` (passing `email` and
`error`), and a "Resend" link/form that re-POSTs to `/api/auth/request-link`
with the same `email` prefilled as a hidden field.

#### 5. Remove password-era files

**File**: delete `src/pages/auth/signup.astro`, delete
`src/components/auth/SignInForm.tsx`, delete
`src/components/auth/SignUpForm.tsx`, delete
`src/components/auth/PasswordToggle.tsx`.

**Intent**: No password UI remains; `PasswordToggle` has no other
consumers (confirmed via `grep`).

### Success Criteria:

#### Automated Verification:

- New components exist: `test -f src/components/auth/AuthForm.tsx && test -f src/components/auth/CodeVerifyForm.tsx`
- Old password-era files removed: `test ! -f src/pages/auth/signup.astro && test ! -f src/components/auth/SignInForm.tsx && test ! -f src/components/auth/SignUpForm.tsx && test ! -f src/components/auth/PasswordToggle.tsx`
- No password field remnants: `! grep -rq "type=\"password\"" src/components/auth/ src/pages/auth/`
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Pages render correctly in the browser: `/auth/signin` shows the email-only
  form, `/auth/confirm-email?email=...` shows the check-email copy plus the
  code form.

---

## Phase 3: Apply and verify against the real project

### Overview

Configure the Supabase project's redirect allow-list and walk both
completion paths end to end.

### Changes Required:

#### 1. Supabase Auth configuration

**File**: n/a (dashboard configuration, no repo file changes)

**Intent**: Register this app's callback origin so `exchangeCodeForSession`
succeeds instead of failing on an unrecognized redirect target.

**Contract**: in the Supabase dashboard, Authentication → URL Configuration
→ Redirect URLs, add `<app-origin>/api/auth/callback` (and the local dev
origin, e.g. `http://localhost:4321/api/auth/callback`, if testing via
`npm run dev` against the hosted project).

### Success Criteria:

#### Automated Verification:

- N/A — Supabase dashboard configuration and live email delivery can't be
  checked from the repo.

#### Manual Verification:

- Requesting a link/code from `/auth/signin` lands on
  `/auth/confirm-email?email=...` and a real email arrives with both a
  link and a code.
- Clicking the link completes login and lands on `/` with a valid session
  (verified via `/dashboard` showing the user's email).
- Entering the code instead completes login the same way.
- An expired or already-used link redirects to `/auth/signin` with a
  visible error banner.
- Requesting a second link/code within Supabase's throttle window surfaces
  an error via the "Resend" action rather than silently doing nothing.
- Visiting `/auth/signin` while already logged in redirects to
  `/dashboard`.

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human
that the manual testing (both completion paths, error handling, resend,
auth guard) was successful.

---

## Testing Strategy

### Unit Tests:

- None — no test framework installed (matches F-01).

### Integration Tests:

- None automated. Phase 3's manual walkthrough substitutes.

### Manual Testing Steps:

1. Configure the Supabase redirect allow-list (Phase 3).
2. From `/auth/signin`, submit an email; confirm redirect to
   `/auth/confirm-email?email=...` and that an email arrives.
3. Click the emailed link; confirm landing on `/` logged in.
4. Repeat step 2, this time typing the emailed code into the
   `CodeVerifyForm`; confirm landing on `/` logged in.
5. Manually hit `/api/auth/callback` with a stale/invalid `code` param;
   confirm redirect to `/auth/signin` with an error banner.
6. While logged in, visit `/auth/signin`; confirm redirect to `/dashboard`.

## Performance Considerations

None beyond what Supabase's own OTP endpoints already handle — no new
database queries or heavy computation introduced.

## Migration Notes

Greenfield UI change — no existing password-authenticated users to
migrate (per F-01's baseline, the app has no real users yet). Deleting the
password routes is a breaking change to any bookmarked `/auth/signup`
link, which is accepted per the approved design decision to remove password
code paths entirely rather than keep them dormant.

## References

- Roadmap: `context/foundation/roadmap.md` (Foundation F-02)
- PRD: `context/foundation/prd.md` (FR-001)
- Data foundation this depends on for the auto-provisioning trigger:
  `context/changes/fairy-data-foundation/plan.md`
- Existing Supabase client: `src/lib/supabase.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend auth routes

#### Automated

- [x] 1.1 New routes exist and call the right Supabase methods
- [x] 1.2 Old password routes removed
- [x] 1.3 Middleware guard present
- [x] 1.4 Type checking passes
- [x] 1.5 Linting passes

#### Manual

- [x] 1.6 Code reviewed for correctness

### Phase 2: Frontend forms & pages

#### Automated

- [ ] 2.1 New components exist
- [ ] 2.2 Old password-era files removed
- [ ] 2.3 No password field remnants
- [ ] 2.4 Type checking passes
- [ ] 2.5 Linting passes

#### Manual

- [ ] 2.6 Pages render correctly in the browser

### Phase 3: Apply and verify against the real project

#### Manual

- [ ] 3.1 Link/code request lands on confirm-email screen and email arrives
- [ ] 3.2 Clicking the link completes login
- [ ] 3.3 Entering the code completes login
- [ ] 3.4 Expired/invalid link shows an error banner
- [ ] 3.5 Throttled resend surfaces an error
- [ ] 3.6 Already-logged-in visit to /auth/signin redirects to /dashboard
