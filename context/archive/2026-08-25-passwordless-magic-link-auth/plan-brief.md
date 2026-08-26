# Passwordless Magic-Link Auth — Plan Brief

> Full plan: `context/changes/passwordless-magic-link-auth/plan.md`

## What & Why

Roadmap Foundation F-02: replace password-based sign-up/sign-in with a
single passwordless flow (FR-001) — email in, then complete login via a
magic link or a typed 6-digit code from the same email. Password code
paths are removed entirely, not left dormant. This unlocks S-01 alongside
F-01, since every downstream slice assumes a logged-in user with no
password step.

## Starting Point

Auth today is fully password-based: `SignInForm`/`SignUpForm` collect
email+password, POST to `src/pages/api/auth/{signin,signup}.ts`, which call
Supabase's `signInWithPassword`/`signUp`. `middleware.ts` already protects
`/dashboard` and resolves `context.locals.user`, but has no guard for an
already-authenticated visitor hitting the auth page.

## Desired End State

One `/auth/signin` page asks only for an email. Submitting it emails the
user a link and a code. Clicking the link, or typing the code on the
"check your email" screen, both complete login and land on `/` with a
session. No password field exists anywhere in the app. A logged-in user
visiting `/auth/signin` bounces to `/dashboard`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Flow shape | Unify signup+signin into one email-entry flow | Passwordless auth has no meaningful signup/signin split — Supabase creates the account on first request | Plan |
| Delivery | Magic link + code fallback | Covers email clients/scanners that break links, at the cost of one extra form | Plan |
| Link failure handling | Redirect to sign-in with error banner | Reuses the existing ServerError pattern, no new page | Plan |
| Resend UX | Plain resend link, rely on Supabase's throttle | No client-side timer state needed for a solo MVP | Plan |
| Password code paths | Removed entirely | Must-have replacement (FR-001), greenfield app, no real users to migrate | Plan |
| Code-entry UI placement | Inline on the check-email screen | One screen, one context, no extra navigation | Plan |
| Auth guard | Redirect logged-in visitors from /auth/signin to /dashboard | Avoids a confusing re-login prompt, cheap middleware addition | Plan |
| confirm-email.astro fate | Repurposed as the check-email + code screen | Reuses an existing route instead of adding a new one | Plan |

## Scope

**In scope:**
- Unified `AuthForm` (email only) replacing `SignInForm`/`SignUpForm`
- `CodeVerifyForm` for the 6-digit code fallback
- Three new API routes: `request-link`, `verify-code`, `callback`
- Deletion of `signup.ts`, `signin.ts`, `SignInForm.tsx`, `SignUpForm.tsx`,
  `PasswordToggle.tsx`, `signup.astro`
- Middleware auth-guard redirect

**Out of scope:**
- `/dashboard`, `signout.ts` (method-agnostic, untouched)
- Client-side resend cooldown timer
- Dedicated error page for expired links
- Any data-model change (covered by F-01)

## Architecture / Approach

`signInWithOtp` (PKCE mode, via `emailRedirectTo`) sends both a link and a
code. The link hits a new `GET /api/auth/callback` that calls
`exchangeCodeForSession`; the code path hits a new `POST
/api/auth/verify-code` that calls `verifyOtp`. Both converge on a session
cookie set by the existing `@supabase/ssr` client — no changes needed to
`src/lib/supabase.ts`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend auth routes | 3 new API routes, 2 removed, middleware guard | Redirect-URL allow-list misconfiguration silently breaks the link path |
| 2. Frontend forms & pages | Unified form, code fallback, repurposed screens | Missed password-field remnant somewhere in old components |
| 3. Apply and verify | Supabase redirect URLs configured, both paths walked live | No automated proof — relies on manual walkthrough discipline |

**Prerequisites:** Access to the Supabase project dashboard (Auth → URL
Configuration) to register the callback redirect URL.
**Estimated effort:** ~1-2 sessions across 3 phases.

## Open Risks & Assumptions

- Assumes Supabase's default email template already includes both a link
  and a code (project default); if not, the template needs a manual tweak
  in the dashboard before Phase 3 can be verified.
- Assumes no real users exist yet to migrate off password auth (per F-01's
  confirmed baseline).

## Success Criteria (Summary)

- A user can go from entering an email to a logged-in session via either
  the link or the code, with no password anywhere in the flow.
- An expired/invalid link surfaces a clear error instead of a broken state.
- A logged-in user never sees the sign-in form again until they sign out.
