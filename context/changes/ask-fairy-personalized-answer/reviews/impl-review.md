<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Profile + Question + Personalized Fairy Answer Implementation Plan

- **Plan**: context/changes/ask-fairy-personalized-answer/plan.md
- **Scope**: Phase 1-4 of 4 (full plan, all complete)
- **Date**: 2026-08-26
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — fairy_responses reads/writes rely solely on RLS, no app-level ownership filter

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/fairy/like.ts:22-30, src/pages/dashboard.astro:32-35
- **Detail**: Both the like-toggle route and the dashboard's `?response=<id>` lookup
  query `fairy_responses` by `id` alone, with no `.eq("user_id", user.id)`
  filter. RLS (`fairy_responses_select_own`/`_update_own`, scoped to
  `auth.uid() = user_id`) does correctly block cross-user access today —
  this isn't an exploitable IDOR right now — but there's zero
  defense-in-depth: a future RLS policy regression (disabled policy,
  migration mistake) would silently turn this into cross-user reads/writes
  with no app-level backstop.
- **Fix**: Add `.eq("user_id", user.id)` to both the select in
  `dashboard.astro` and the select+update in `like.ts`.
- **Decision**: FIXED — added `.eq("user_id", user.id)` to both queries

### F2 — No timeout on the OpenRouter fetch call

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/ai/fairy.ts:26-43
- **Detail**: The `fetch` to OpenRouter has no `AbortSignal`/timeout. A slow
  or hung upstream response leaves the user's browser waiting on the
  full-page-navigation spinner indefinitely (until Cloudflare's own
  platform-level request limit kicks in, if any), with no graceful
  "took too long" error path.
- **Fix**: Pass `signal: AbortSignal.timeout(15000)` (or similar) to the
  `fetch` call and let the resulting `AbortError` flow into the existing
  generic-error redirect in `ask.ts`.
- **Decision**: FIXED — added `signal: AbortSignal.timeout(15_000)`

### F3 — like.ts silently discards Supabase errors

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/fairy/like.ts:22-30
- **Detail**: Neither the `select("liked")` nor the `update({ liked: ... })`
  call checks its `error` field. If either fails, the route still redirects
  to `/dashboard?response=<id>` as if the toggle succeeded, silently
  misleading the user about whether their like was recorded.
- **Fix**: Check the `error` from both calls and redirect with a
  `?error=` message (matching the pattern in `ask.ts`/`profile/update.ts`)
  when either fails.
- **Decision**: FIXED — both select and update errors now redirect with
  `?error=`

### F4 — Error messages hardcoded inline instead of routed through a shared mapper

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/fairy/ask.ts, src/pages/api/profile/update.ts
- **Detail**: `ask.ts` and `profile/update.ts` redirect with fixed inline
  strings (e.g. "Wróżka nie mogła odpowiedzieć. Spróbuj ponownie.") rather
  than going through a shared mapper like `src/lib/auth-errors.ts`'s
  `toAuthErrorMessage`. Functionally equivalent today (no raw error text
  leaks either way), but it's a second, unstructured way of doing the same
  thing the codebase already has a convention for — will drift further if
  more error cases are added later.
- **Fix**: Not urgent enough to require immediate consolidation into a
  shared helper; flagged for awareness rather than a required change now.
- **Decision**: SKIPPED

## Observations (not tracked as findings)

- `src/pages/api/profile/update.ts` doesn't server-side-validate that
  `name`/`birth_date` are present or that `birth_date` isn't in the future
  — client-side validation covers the normal path, but a direct POST could
  persist an empty name or a future date. Not a security issue (RLS still
  scopes to the owner), and the dashboard's completeness gate correctly
  treats an empty string as incomplete either way, so this doesn't break
  the gating invariant — just noted for awareness, matching `ask.ts`'s
  stricter server-side re-validation of `question`.

## Verification results

- Plan drift sub-agent: 0 drift across all 12 planned file-level items —
  every module/route matches its Phase 1-4 contract exactly. No
  "What We're NOT Doing" boundary was violated (no streaming, no rate
  limiting beyond length caps, no moderation call, no use of prior likes in
  generation, no new migration).
- All automated checks pass: file-existence/grep checks for all 4 phases,
  `npm run astro check` (0 errors), `npm run lint` (0 errors).
- All Progress manual checkboxes (Phase 1-4) are checked and correspond to
  real commits (51bbf92, 0332a76, 45bc8fc, db644d7).
- Auth guards present and correct on all three new API routes
  (`profile/update.ts`, `fairy/ask.ts`, `fairy/like.ts`).
- No XSS/injection risk found — all user content rendered via React JSX
  (auto-escaped) or interpolated into the AI text payload only.
- No N+1 queries, no destructive operations beyond intended updates.
