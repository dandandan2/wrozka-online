<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Fairy-Loop Business-Rule Integrity Test Coverage

- **Plan**: context/changes/testing-fairy-loop-business-rules/plan.md
- **Scope**: Full plan (Phases 1-4)
- **Date**: 2026-08-27
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — `stubOpenRouterFetch` helper doesn't enforce its own cleanup contract

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/helpers/mock-openrouter-fetch.ts:9-10
- **Detail**: The helper's doc comment instructs callers to add `vi.unstubAllGlobals()` in an `afterEach` themselves, but nothing enforces it. The one current consumer (`api-ask-provider-failure.test.ts:17-19`) does this correctly, so there is no live leak today — but a future test file that imports `stubOpenRouterFetch` and forgets the `afterEach` could leak the stubbed `fetch` into subsequent files in the same Vitest worker.
- **Fix**: Have the helper register its own `afterEach(() => vi.unstubAllGlobals())` internally so cleanup isn't opt-in for future consumers.
- **Decision**: FIXED — moved `afterEach(() => vi.unstubAllGlobals())` into `mock-openrouter-fetch.ts` itself; removed the now-redundant `afterEach` from `tests/unit/api-ask-provider-failure.test.ts`.

### F2 — `networkFailure` scenario throws synchronously instead of returning a rejected promise

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/helpers/mock-openrouter-fetch.ts:24
- **Detail**: A real `fetch` never throws synchronously — it always returns a promise that later rejects. The mock's `networkFailure` case throws directly inside the `vi.fn()` callback. Traced through `src/lib/ai/fairy.ts:37` and `src/pages/api/fairy/ask.ts:56-67`: because the throwing call is directly `await`-ed inside an `async` function, JS converts the synchronous throw into a rejected promise before it reaches any caller, so today's test behavior is observationally identical to a real timeout rejection — this is not a live bug. It would only diverge under a future refactor that stores the `fetch(...)` promise before awaiting it (e.g. `const p = fetch(...); ...; await p;`), where a synchronous throw would fire outside any surrounding `try`/`await`.
- **Fix**: Swap `throw new DOMException(...)` for `return Promise.reject(new DOMException(...))` for defense-in-depth fidelity to real `fetch` semantics.
- **Decision**: FIXED — `mock-openrouter-fetch.ts:24` now returns `Promise.reject(...)` instead of throwing synchronously.

## Additional notes (no findings)

- Both review agents confirmed all 4 phases MATCH the plan's stated Intent/Contract exactly — no drift, no missing items, no unplanned scope.
- The two explicit plan instructions that could easily be swapped by mistake were verified correct: Phase 1's test does NOT mock `@/lib/ai/fairy` (drives the real `generateFairyAnswer` against a mocked `fetch`, per plan); Phase 2's test DOES mock `@/lib/ai/fairy`'s `generateFairyAnswer` as always-resolving (per plan).
- Pattern compliance: all three new test files and the new helper match sibling conventions (`vi.mock` + dynamic `await import`, `createMockQueryClient`/`createFakeContext`/`eqArgsFor` usage, file-naming scheme, hand-rolled no-framework mock style) with no substantive mismatches.
- Automated success criteria re-verified at review time: `npm test` (29/29 passing), `npm run lint` (0 errors, 3 pre-existing warnings unrelated to this change), `npm run astro check` (0 errors).
- All manual verification items across all 4 phases were confirmed by the user during implementation (see plan.md Progress section, all rows checked with commit SHAs).
