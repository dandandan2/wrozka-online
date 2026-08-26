<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Passwordless Magic-Link Auth Implementation Plan

- **Plan**: context/changes/passwordless-magic-link-auth/plan.md
- **Scope**: Phase 1-3 of 3 (full plan, all complete)
- **Date**: 2026-08-25
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Raw Supabase error messages surfaced directly to the user

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/request-link.ts:21, src/pages/api/auth/verify-code.ts:18, src/pages/api/auth/callback.ts (error branch)
- **Detail**: All three routes forward `error.message` from `supabase.auth.*`
  calls straight into the redirect query string, which is then rendered as
  the visible error banner. This isn't sanitized or mapped — whatever
  wording/detail Supabase's SDK returns is shown verbatim to the end user.
  Low risk here (no password/account-existence flow to leak since
  `shouldCreateUser: true` unifies signup/signin), but it's still
  provider-internal text reaching the UI unfiltered.
- **Fix**: Map known error cases to short, generic user-facing strings (e.g.
  "That link has expired or was already used", "Invalid code — try again")
  and fall back to a generic "Something went wrong" for anything
  unrecognized, instead of forwarding `error.message` directly.
- **Decision**: FIXED — added `src/lib/auth-errors.ts` (`toAuthErrorMessage`)
  and used it in request-link.ts, verify-code.ts, callback.ts

### F2 — Form fields cast without an explicit presence check before the Supabase call

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/request-link.ts:6, src/pages/api/auth/verify-code.ts:6-7
- **Detail**: `form.get("email") as string` (and `"code"`) is an unchecked
  type assertion. If the field is missing, `form.get` returns `null`, which
  gets cast to `string` anyway and flows into `encodeURIComponent`/the
  Supabase call with no explicit guard — it happens not to crash today, but
  there's no intentional validation step, just an accidental non-crash.
- **Fix**: Add `if (!email) return context.redirect(...)` (and the same for
  `code` in verify-code.ts) before calling Supabase, so a missing field
  produces a deliberate, readable error path instead of relying on
  incidental behavior.
- **Decision**: FIXED — added explicit type/presence guards in
  request-link.ts and verify-code.ts before the Supabase call

### F3 — Post-epilogue fix (dead /auth/signup links) not reflected in plan.md

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/Topbar.astro, src/components/Welcome.astro
- **Detail**: Commit `3fa7464` ("remove dead /auth/signup links") landed
  after the plan's epilogue close-out (`4f1269f`). It's a correct,
  well-justified fix — `Topbar.astro` and `Welcome.astro` still linked to
  the now-deleted `/auth/signup`, which the plan's own Phase 2 deletion
  should have caught (both files were reachable from the signed-out
  homepage) — but `plan.md`'s Changes Required / Progress never mention
  these two files, so the plan doesn't match the final diff. Same pattern
  as F-01's post-epilogue fix.
- **Fix**: Add a short addendum to plan.md under Phase 2 noting that
  Topbar.astro and Welcome.astro also needed their `/auth/signup`
  references removed, with the commit reference.
- **Decision**: FIXED — addendum added to plan.md under "Migration Notes"

## Notes (observations, not tracked as findings)

- **No app-level throttle on the 6-digit code** (`verify-code.ts`): a code
  has only 1e6 combinations and nothing here adds IP/email-based rate
  limiting beyond whatever Supabase enforces server-side. This was an
  explicit, named decision in the plan's "What We're NOT Doing" ("No
  rate-limit/cooldown UI beyond what Supabase's own OTP throttle
  produces"), so it's not new drift — flagging only so it's visible if the
  security posture is reconsidered later.
- `verify-code.ts`'s error redirect doesn't preserve the typed `code`, so
  `CodeVerifyForm` re-mounts empty after a failed attempt (minor UX, user
  must retype). Not blocking.
- None of the three new routes wrap their `supabase.auth.*` call in
  try/catch; supabase-js returns `{error}` rather than throwing in normal
  cases, but a lower-level network fault would surface as an unhandled 500
  instead of a friendly redirect. Low likelihood, not blocking.
- CSRF: none of the auth POST routes (new or pre-existing, e.g.
  `signout.ts`) have an origin/CSRF check. Not a regression introduced by
  this change — consistent with the existing pattern — but worth a
  standalone follow-up if the app's threat model calls for it.

## Verification results

- All automated checks pass: routes call the right Supabase methods, old
  password routes removed, middleware guard present, `npm run astro check`
  (0 errors, 0 warnings, 4 pre-existing hints), `npm run lint` (0
  errors/warnings, only pre-existing parser notices).
- Plan drift sub-agent: 0 drift across all 10 planned file-level items —
  every route/component/page matches its contract exactly (redirect
  targets, error propagation, Supabase methods, field names/props, file
  deletions).
- All Progress manual checkboxes (Phase 1-3) are checked and correspond to
  real commits (259e328, f47b92d, 2c66a05).
