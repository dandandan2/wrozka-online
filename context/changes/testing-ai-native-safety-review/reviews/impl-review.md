<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI-Native Safety Review

- **Plan**: context/changes/testing-ai-native-safety-review/plan.md
- **Scope**: Full plan (Phases 1-4)
- **Date**: 2026-08-27
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Non-standard mocking pattern in the ask.ts integration test

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/unit/api-ask-safety-check.test.ts:18-21, 38-41
- **Detail**: Both `api-fairy-ownership.test.ts` and `api-ask-provider-failure.test.ts` use a single top-level `vi.mock("@/lib/ai/fairy", ...)` plus one top-level dynamic import, varying behavior per test via `mockResolvedValueOnce`-style overrides or a fixed mock. This file instead calls `vi.resetModules()` + `vi.doMock(...)` + a fresh dynamic `import(...)` inside *each* `it()` block. The stated reason (a different `generateFairyAnswer` return value per test) is already achievable with the established single top-level `vi.mock` + per-test `vi.mocked(generateFairyAnswer).mockResolvedValueOnce(...)` pattern — the same technique the sibling files already use for per-test Supabase response variation via `createMockQueryClient([...])` arrays.
- **Fix**: Rewrite to a single top-level `vi.mock("@/lib/ai/fairy", () => ({ generateFairyAnswer: vi.fn() }))` and one top-level dynamic import, then set each test's return value with `vi.mocked(generateFairyAnswer).mockResolvedValueOnce(UNSAFE_ANSWER)` / `.mockResolvedValueOnce(BENIGN_ANSWER)` instead of `vi.resetModules()`/`vi.doMock()`/re-import.
- **Decision**: FIXED — rewritten to the standard top-level `vi.mock` + `mockResolvedValueOnce` pattern, matching `api-fairy-ownership.test.ts`/`api-ask-provider-failure.test.ts`. Both tests and the full suite (43/43) still pass.

## Additional notes (no findings)

- **Pivot verified**: no `OPENROUTER_API_KEY` import and no `fetch(` call anywhere in `safety-checker.ts` or either new test file — the checker is a pure synchronous function, and both test files mock `generateFairyAnswer` entirely rather than exercising the real network path. The "no live LLM call anywhere" decision from planning was followed exactly.
- **Regex safety**: all patterns use bounded gaps (`{0,30}`/`{0,20}`) between anchored word groups, no nested quantifiers or unbounded constructs — no ReDoS risk.
- **No data leakage**: the flagged category is only logged server-side via `console.error`; the user-facing redirect always uses the generic `FAIRY_FAILURE_MESSAGE`, never the flagged content or category.
- **Bypass check**: `checkFairyAnswerSafety` runs before the insert, the unsafe branch returns early (non-inverted condition), and no code path lets a flagged answer reach `fairy_responses`.
- **DRY check**: `FAIRY_FAILURE_MESSAGE` is used consistently across all three failure sites in `ask.ts` (AI-provider error, safety flag, insert error); no leftover duplicate string literal.
- Both review agents confirmed all 4 phases MATCH the plan's stated Intent/Contract exactly, including a reasonable beyond-the-letter detail (Unicode-aware word boundaries for Polish diacritics) that serves the plan's intent.
- Automated success criteria re-verified at review time: `npm test` (43/43 passing, 14 files), `npm run lint` (0 errors, 4 pre-existing-style warnings unrelated to this change), `npm run astro check` (0 errors).
- All manual verification items across all 4 phases were confirmed by the user during implementation (see plan.md Progress section, all rows checked with commit SHAs).
