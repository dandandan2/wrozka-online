# Fairy-Loop Business-Rule Integrity Test Coverage Implementation Plan

## Overview

Add hermetic Vitest coverage for rollout Phase 2's three risks — delete/style-pool exclusion (#4), AI-provider failure/timeout handling (#5), and `about_me` server-side length enforcement (#7) — closing the test-coverage gap `context/changes/testing-fairy-loop-business-rules/research.md` found behind each risk, while introducing one new piece of test infrastructure: a `fetch`-boundary mock for OpenRouter.

## Current State Analysis

Research (`context/changes/testing-fairy-loop-business-rules/research.md`) confirmed all three risks are already mitigated in the code — the gap in every case is missing test coverage, not missing enforcement:

- **#4**: `src/pages/api/fairy/delete.ts:22` performs a hard `DELETE`; the "style pool" is a live `eq("liked", true)` query in `src/pages/api/fairy/ask.ts:46-53` with no caching layer, so a deleted row is already excluded on the next `ask()`. No test proves this end-to-end.
- **#5**: `src/pages/api/fairy/ask.ts:55-79` calls `generateFairyAnswer` (which has a 15s timeout, `src/lib/ai/fairy.ts:5,54`) before the `fairy_responses` insert, and only inserts on a validated, non-empty answer — so no partial/corrupt row is possible on AI failure. No test exercises this failure branch, nor the adjacent "insert fails after a successful AI call" branch (`ask.ts:75-79`).
- **#7**: `src/pages/api/profile/update.ts:4,32-36` enforces `ABOUT_ME_MAX_LENGTH = 500` server-side with a clean redirect on violation, backed by a DB `CHECK` constraint (`supabase/migrations/20260825120000_fairy_data_foundation.sql:9`). No test posts an oversized value directly to the API.

Existing hermetic test infrastructure from Phase 1 (`context/changes/testing-critical-path-security-auth/`) is directly reusable:
- `tests/helpers/mock-supabase-client.ts` — `createMockQueryClient`/`eqArgsFor` for the Supabase query-builder mock.
- `tests/helpers/fake-api-context.ts` — `createFakeContext` for building a fake `APIContext`.
- `tests/setup/astro-env-server.ts` — already exports `OPENROUTER_API_KEY` (dummy value); no new env plumbing needed.

The one gap: no `fetch`-boundary mock exists yet for OpenRouter. `context/foundation/test-plan.md` §4 (Stack) explicitly instructs mocking the external HTTP boundary, not internal `src/lib/` modules — the existing `vi.mock("@/lib/ai/fairy", ...)` pattern in `tests/unit/api-fairy-ownership.test.ts:6` (which always resolves) is the anti-pattern to avoid for this phase's Risk #5 test.

This environment has no Docker (`context/changes/testing-critical-path-security-auth/plan.md:23-57`), so every test in this phase remains hermetic, consistent with Phase 1.

### Key Discoveries:

- `src/pages/api/fairy/ask.ts:46-53` — the liked-answers query is the entire "style pool"; no separate table or cache exists.
- `src/lib/ai/fairy.ts:37-74` — `generateFairyAnswer`'s only external call is one `fetch(...)`; failure modes are non-OK status (line 57-61), missing content (line 63-71), and network/timeout rejection (line 54's `AbortSignal.timeout`, unguarded by a local `try/catch`).
- `src/pages/api/profile/update.ts:32-36` — the length check uses strict `>`, so exactly 500 chars is accepted; this is the boundary the new test must pin.
- `tests/unit/api-fairy-ownership.test.ts:6` mocks `generateFairyAnswer` as always-resolving — this phase's Risk #4 test can keep that mock (it never needs `generateFairyAnswer` to fail), but Risk #5's test must NOT reuse that file's `vi.mock("@/lib/ai/fairy", ...)` since it needs the real `generateFairyAnswer` running against a mocked `fetch`.

## Desired End State

Three new hermetic Vitest test files exist, each proving one risk's mitigation holds, plus one new reusable fetch-mock helper. `npm test` passes with the new files included. `context/foundation/test-plan.md` reflects Phase 2 as complete, with cookbook entries pointing future contributors at the new fetch-mocking pattern.

### Verification

Run `npm test` and confirm the three new test files pass alongside the existing suite; run `npm run lint` and `npm run astro check` (or this project's equivalent typecheck command) to confirm no regressions.

## What We're NOT Doing

- Not modifying `ask.ts`, `delete.ts`, `like.ts`, or `profile/update.ts` — research confirmed the business logic is already correct; this phase adds tests only.
- Not adding real-infra/Docker-backed integration tests — this environment has no Docker (per Phase 1's established constraint); all new tests stay hermetic.
- Not installing MSW — the fetch-mocking need is a single call-site, well served by `vi.stubGlobal("fetch", ...)`.
- Not testing a genuine 15-second timeout via real timers — the aborted/rejected-fetch simulation exercises the same catch path without the fragility of faking `AbortSignal` internals.
- Not scrubbing previously-generated answer text that stylistically mimicked a since-deleted liked answer — that's a distinct "prompt influence already baked into old output" concern, out of scope for Risk #4 as worded.
- Not re-litigating Risk #3 (AI-native safety review) or Risk cross-cutting CI wiring — those are Phase 3 and Phase 4 respectively.

## Implementation Approach

Follow Phase 1's established hermetic-test pattern exactly: mock `@/lib/supabase`'s `createClient` via `vi.mock`, build a fake `APIContext` via `createFakeContext`, call the exported route handler directly, and assert on recorded mock-client calls. For Risk #5, extend this pattern with a new `fetch`-boundary mock (`vi.stubGlobal("fetch", ...)`) instead of mocking `@/lib/ai/fairy` internally, per `test-plan.md`'s explicit stack guidance. One new test file per risk, matching the project's existing file-per-concern convention (`api-fairy-ownership.test.ts`, `api-profile-ownership.test.ts`).

## Phase 1: Risk #5 — AI-Provider Failure/Timeout Wiring Tests

### Overview

Build the new OpenRouter `fetch`-mock helper, then prove `ask.ts` never writes a `fairy_responses` row on AI failure (non-OK status, missing content, aborted/timeout fetch) or on a post-success insert failure, and that the user always receives the same clean, generic redirect in every case.

### Changes Required:

#### 1. OpenRouter fetch-mock helper

**File**: `tests/helpers/mock-openrouter-fetch.ts`

**Intent**: A reusable, hermetic stand-in for the global `fetch` call `generateFairyAnswer` makes, so tests can drive OpenRouter's HTTP boundary into success, non-OK-status, malformed-content, and network-failure states without touching `src/lib/ai/fairy.ts` internals.

**Contract**: Export a function (e.g. `stubOpenRouterFetch(scenario)`) that calls `vi.stubGlobal("fetch", vi.fn(...))` and returns a `Response`-like object or a rejected promise depending on the requested scenario. Scenarios needed: `ok` (200 with valid `choices[0].message.content`), `nonOk` (e.g. 500 status, `response.ok = false`), `missingContent` (200 but no `choices[0].message.content`), and `networkFailure` (rejects with a `DOMException("The operation was aborted.", "TimeoutError")`, matching what `AbortSignal.timeout` actually produces). Follow `mock-supabase-client.ts`'s hand-rolled style — no MSW dependency. Call `vi.unstubAllGlobals()` in an `afterEach` within the consuming test file (not the helper) to avoid leaking the stub across test files.

#### 2. Risk #5 test file

**File**: `tests/unit/api-ask-provider-failure.test.ts`

**Intent**: Prove the generate-then-insert ordering in `ask.ts` holds under every AI-provider failure mode, and that a DB-insert failure after a successful AI call is also handled cleanly — in all cases, no `fairy_responses` row is written on AI failure, and the user always receives the same generic redirect message, never a leaked provider error.

**Contract**: Mock `@/lib/supabase` (as existing tests do) but do NOT mock `@/lib/ai/fairy` — import the real `generateFairyAnswer` and drive it via the new `stubOpenRouterFetch` helper. Four cases, each invoking the real `POST` handler from `src/pages/api/fairy/ask.ts` via `createFakeContext`:
  1. `nonOk` fetch scenario → assert no `insert` call was recorded against the mock Supabase client, and the returned redirect matches the generic error message (`ask.ts:64-66`).
  2. `missingContent` fetch scenario → same assertions as case 1.
  3. `networkFailure` (aborted/timeout) fetch scenario → same assertions as case 1.
  4. `ok` fetch scenario, but the mock Supabase client's insert response carries a non-null `error` → assert the same generic redirect fires (`ask.ts:76-78`) and the handler does not throw.

  Use `mock-supabase-client.ts`'s `createMockQueryClient` to supply the profile-lookup and liked-answers-lookup responses (both required before `generateFairyAnswer` is reached) in cases 1-3, and additionally an insert-error response in case 4. Assert `consumedResponseCount()` matches the expected Supabase call count per case to catch any unaccounted-for extra/missing query.

### Success Criteria:

#### Automated Verification:

- New test file passes: `npx vitest run tests/unit/api-ask-provider-failure.test.ts`
- Full suite passes: `npm test`
- Type checking passes: `npm run astro check` (or project's typecheck command)
- Linting passes: `npm run lint`

#### Manual Verification:

- Read the four test cases and confirm each one would fail if `ask.ts`'s generate-then-insert ordering were reversed (i.e., the tests are not vacuously true)

---

## Phase 2: Risk #4 — Delete/Style-Pool Exclusion Wiring Test

### Overview

Prove that after a `fairy_responses` row is deleted, a subsequent `ask()` both queries with the `liked = true` filter and passes a `likedAnswers` array to `generateFairyAnswer` that excludes the deleted row's content — directly addressing `test-plan.md`'s anti-pattern warning ("asserting only that the DB row disappeared, not that the style pool excludes it").

### Changes Required:

#### 1. Risk #4 test file

**File**: `tests/unit/api-fairy-delete-style-pool.test.ts`

**Intent**: Independently construct a "would-have-been-included" liked answer, simulate that it has already been deleted (by never including it in the mocked liked-answers query response), and assert both that the query itself is correctly filtered and that the deleted content never reaches the AI call.

**Contract**: Mock `@/lib/supabase` and `@/lib/ai/fairy`'s `generateFairyAnswer` (as an always-resolving mock, following `api-fairy-ownership.test.ts:6` — this test doesn't need `generateFairyAnswer` to actually run, only to inspect its call arguments). Queue the mock Supabase client's liked-answers response to a fixed set of answers that deliberately excludes a sentinel string (e.g. `"DELETED_ANSWER_SENTINEL"`) representing the just-deleted row's content. Invoke `ask.ts`'s `POST` handler via `createFakeContext`, then assert:
  1. `eqArgsFor(calls, "liked")` includes `true` for the liked-answers query (proves the query is filtered correctly, per `ask.ts:50`).
  2. The mocked `generateFairyAnswer`'s recorded call arguments (its `likedAnswers` parameter, third argument) do not contain `"DELETED_ANSWER_SENTINEL"` and do contain the other fixture answers — proving the exclusion reaches the AI-prompt boundary, not just the query shape.

  This test does not need to call `delete.ts` directly — the sentinel-exclusion technique proves the same thing "if this were still liked/undeleted, it would appear; it doesn't" without requiring a live two-call sequence, consistent with this project's hermetic, oracle-based test design (`context/changes/testing-critical-path-security-auth/plan.md:202-211`).

### Success Criteria:

#### Automated Verification:

- New test file passes: `npx vitest run tests/unit/api-fairy-delete-style-pool.test.ts`
- Full suite passes: `npm test`
- Type checking passes: `npm run astro check` (or project's typecheck command)
- Linting passes: `npm run lint`

#### Manual Verification:

- Read the test and confirm it would fail if `ask.ts:50`'s `.eq("liked", true)` filter were removed or if the sentinel were accidentally included in the fixture

---

## Phase 3: Risk #7 — `about_me` Length Boundary Test

### Overview

Prove the server-side `about_me` length check in `profile/update.ts` behaves correctly at its boundary: exactly 500 characters is accepted, 501 is rejected with a clean redirect and no write to `profiles`.

### Changes Required:

#### 1. Risk #7 test file

**File**: `tests/unit/api-profile-about-me-length.test.ts`

**Intent**: Directly POST an oversized `about_me` value to the update handler (bypassing any client-side `maxLength`) and confirm server-side rejection; pair it with the boundary-accepted case to catch an off-by-one regression in the `>` comparison.

**Contract**: Mock `@/lib/supabase` (as `api-profile-ownership.test.ts` does). Two cases, each invoking `profile/update.ts`'s `POST` handler via `createFakeContext` with valid `name`/`birth_date` and an `about_me` string of controlled length:
  1. `about_me` of exactly 500 characters → assert the mock Supabase client's `update` was called (i.e., validation passed) and no redirect carrying the length-error message occurred.
  2. `about_me` of 501 characters → assert `update` was never called, and the returned redirect URL contains the length-error message text (`` "O sobie" może mieć maksymalnie 500 znaków. `` per `update.ts:34`).

### Success Criteria:

#### Automated Verification:

- New test file passes: `npx vitest run tests/unit/api-profile-about-me-length.test.ts`
- Full suite passes: `npm test`
- Type checking passes: `npm run astro check` (or project's typecheck command)
- Linting passes: `npm run lint`

#### Manual Verification:

- Read the test and confirm the boundary case (500) would fail if the code's `>` were changed to `>=`, and the over-limit case (501) would fail if the length check were removed entirely

---

## Phase 4: Cookbook Update & Wrap-Up

### Overview

Close the loop on `test-plan.md`, mirroring Phase 1's own wrap-up: sync rollout status, document the new fetch-mocking pattern for future phases, and correct the risk descriptions now that research has shown all three were already mitigated in code rather than genuinely broken.

### Changes Required:

#### 1. Cookbook pattern for AI-provider failure tests

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the "TBD — see §3 Phase 2 for AI-failure-handling patterns" note in §6.1 with a short paragraph describing the `vi.stubGlobal("fetch", ...)` pattern and a pointer to `tests/helpers/mock-openrouter-fetch.ts` and `tests/unit/api-ask-provider-failure.test.ts` as the canonical example.

**Contract**: Short paragraph plus file pointers, no inline code reproduction — matching the style of the existing §6.1 entries for auth/session logic.

#### 2. Risk description correction

**File**: `context/foundation/test-plan.md`

**Intent**: Update the §2 Risk Map descriptions for #4, #5, #7 (or add a note alongside them) to reflect that this rollout phase's research found each risk already mitigated in code — the phase closed a test-coverage gap, not a functional bug — so future readers of the risk map don't mistake "risk covered" for "bug was found and fixed."

**Contract**: A short annotation per risk row (or a shared footnote) citing `context/changes/testing-fairy-loop-business-rules/research.md` as the source of the correction, consistent with `test-plan.md` §1 principle #3 ("if the plan and research disagree about where the failure lives, research is the ground truth").

#### 3. Rollout status sync

**File**: `context/foundation/test-plan.md`

**Intent**: Move the Phase 2 row in §3 from `not started` to `complete` and fill in its `Change folder` column.

**Contract**: Table row edit only — set `Change folder` to `context/changes/testing-fairy-loop-business-rules/`.

#### 4. Change record sync

**File**: `context/changes/testing-fairy-loop-business-rules/change.md`

**Intent**: Reflect that the change has completed implementation.

**Contract**: Set `status: implemented` and `updated: <date of completion>`.

### Success Criteria:

#### Automated Verification:

- Full suite passes: `npm test`
- Linting passes: `npm run lint`
- Type/Astro checking passes: `npm run astro check` (or project's typecheck command)

#### Manual Verification:

- A reader unfamiliar with this phase can follow §6.1 of `test-plan.md`, find `tests/helpers/mock-openrouter-fetch.ts` and the Risk #5 test file without additional context, and understands from the risk-description correction why Phase 2 didn't fix any code

---

## Testing Strategy

### Unit Tests:

- All four phases above ARE the test-writing work; no separate "tests for the tests" layer applies.

### Integration Tests:

- None beyond the hermetic route-handler tests above — this environment has no Docker, so real-Supabase/real-OpenRouter integration tests are out of scope, consistent with Phase 1.

### Manual Testing Steps:

1. Run `npm test` and confirm all three new test files plus the existing suite pass.
2. Temporarily revert `ask.ts`'s generate-then-insert ordering (swap insert before the AI call) locally and confirm the Phase 1 test file fails — proves the test isn't vacuous. Revert the temporary change afterward.
3. Temporarily change `profile/update.ts`'s `>` to `>=` locally and confirm the Phase 3 boundary case fails. Revert afterward.

## Performance Considerations

None — all new tests are hermetic unit tests with no real network or database calls; the fetch mock ensures no test suite run makes a live OpenRouter request.

## Migration Notes

Not applicable — no schema or data changes in this phase.

## References

- Research: `context/changes/testing-fairy-loop-business-rules/research.md`
- Phase 1 precedent (hermetic mocking, wrap-up pattern): `context/changes/testing-critical-path-security-auth/plan.md`
- Governing risk map and stack guidance: `context/foundation/test-plan.md` §2, §4

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Risk #5 — AI-Provider Failure/Timeout Wiring Tests

#### Automated

- [x] 1.1 New test file passes: `npx vitest run tests/unit/api-ask-provider-failure.test.ts` — 8911804
- [x] 1.2 Full suite passes: `npm test` — 8911804
- [x] 1.3 Type checking passes: `npm run astro check` — 8911804
- [x] 1.4 Linting passes: `npm run lint` — 8911804

#### Manual

- [x] 1.5 Confirm the four test cases are not vacuously true (would fail if ordering were reversed) — 8911804

### Phase 2: Risk #4 — Delete/Style-Pool Exclusion Wiring Test

#### Automated

- [x] 2.1 New test file passes: `npx vitest run tests/unit/api-fairy-delete-style-pool.test.ts` — c7e2e8b
- [x] 2.2 Full suite passes: `npm test` — c7e2e8b
- [x] 2.3 Type checking passes: `npm run astro check` — c7e2e8b
- [x] 2.4 Linting passes: `npm run lint` — c7e2e8b

#### Manual

- [x] 2.5 Confirm the test would fail if the `liked` filter or sentinel-exclusion were broken — c7e2e8b

### Phase 3: Risk #7 — `about_me` Length Boundary Test

#### Automated

- [x] 3.1 New test file passes: `npx vitest run tests/unit/api-profile-about-me-length.test.ts` — b1a5827
- [x] 3.2 Full suite passes: `npm test` — b1a5827
- [x] 3.3 Type checking passes: `npm run astro check` — b1a5827
- [x] 3.4 Linting passes: `npm run lint` — b1a5827

#### Manual

- [x] 3.5 Confirm the boundary case would fail on an off-by-one regression — b1a5827

### Phase 4: Cookbook Update & Wrap-Up

#### Automated

- [x] 4.1 Full suite passes: `npm test`
- [x] 4.2 Linting passes: `npm run lint`
- [x] 4.3 Type/Astro checking passes: `npm run astro check`

#### Manual

- [x] 4.4 A reader unfamiliar with this phase can follow §6.1 and the risk-description correction without additional context
