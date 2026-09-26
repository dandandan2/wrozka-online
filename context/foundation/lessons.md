# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Post-epilogue fixes must update plan.md

- **Context**: Post-epilogue fix commits in any change — any `fix(<change-id>)`-style commit (or similar) that lands after that change's "close out plan (epilogue)" commit.
- **Problem**: plan.md stops being a reliable source of truth. Seen twice in one session (F-01: `profiles_set_updated_at` trigger added in commit `99326f4`; F-02: dead `/auth/signup` links removed in commit `3fa7464`) — plan.md doesn't reflect what actually shipped, which undermines future reviews and anyone reading the plan as documentation.
- **Rule**: Whenever a commit lands after a change's "close out plan (epilogue)" commit and touches files from that change, add a short addendum to plan.md (a new phase or a note under Migration Notes) in the same PR/commit as the fix — don't wait for the next impl-review to catch it.
- **Applies to**: implement, impl-review

## Assert the redirect target, not just that a redirect happened

- **Context**: Route handlers in `src/pages/api/` that answer with `context.redirect()` — every fairy, tarot, profile and auth endpoint in this project.
- **Problem**: A handler whose only output is a `Location` header can point at a page that no longer exists or no longer reads its query params, and the feature breaks silently — no exception, no failing test. Seen in PR #1 review F1: Phase 6 of `tarot-reading` moved the ask form to `/dashboard/fairy` while `ask.ts`/`like.ts` kept redirecting at `/dashboard`, swallowing every fairy answer and error message for a full release. Every test of those routes passed, because they asserted only that _a_ redirect occurred (`redirects[0]).toContain(...)` or nothing at all).
- **Rule**: In route-handler tests, assert the exact `Location` (`expect(response.headers.get("Location")).toBe(...)`) for every branch — auth, validation, not-found, provider failure, success. When a change moves or renames a page, grep the API routes for the old path in the same commit.
- **Applies to**: implement, impl-review, plan-review

## A value duplicated outside TypeScript needs a sync test

- **Context**: Any constant that exists both in `src/` and in a non-TypeScript artifact — a migration `CHECK` constraint, a SQL enum, a config file.
- **Problem**: Lint, typecheck and the test suite all pass while the copies drift; the mismatch surfaces in production on the first request that violates the constraint. Seen in PR #1 review F3: the 22 `MAJOR_ARCANA` keys are re-listed in `20260915120000_tarot_reading_card_key_check.sql` under only a "values must stay in sync" comment, so adding a 23rd card would have shipped green and failed on INSERT.
- **Rule**: Add a test that reads the other artifact and compares it with the TypeScript source of truth as a set — and make the test fail loudly if it cannot locate that artifact, so a rename turns into a failure rather than a vacuous pass. Pattern: `tests/unit/tarot-card-keys-match-migration.test.ts`.
- **Applies to**: implement, impl-review

## Verify a new test fails against the bug it describes

- **Context**: Any test written to close a coverage gap, especially one added after a review finding rather than alongside the code.
- **Problem**: A test whose assertions hold both before and after the defect adds runtime and false confidence. The three fairy/tarot coverage gaps found in PR #1 all had _some_ test over the same code path already.
- **Rule**: Before committing, mutate the production code to reintroduce the defect (or check out the pre-fix revision), confirm the new test fails, then restore. Record in the commit message how many assertions flipped — `25496bc` ("14 of those 19 assertions fail against the pre-fix handlers") is the reference shape.
- **Applies to**: implement, impl-review
