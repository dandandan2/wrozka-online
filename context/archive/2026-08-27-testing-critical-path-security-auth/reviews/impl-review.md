<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Critical-Path Security & Auth Testing Implementation Plan

- **Plan**: context/changes/testing-critical-path-security-auth/plan.md
- **Scope**: Full plan (Phases 1-5)
- **Date**: 2026-08-27
- **Verdict**: NEEDS ATTENTION (pre-triage) → APPROVED (post-triage: 3 fixed, 2 skipped as low-impact)
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

### F1 — Mock query-builder doesn't assert full response-queue consumption

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/helpers/mock-supabase-client.ts:29-37
- **Detail**: `nextResponse()` consumes queued responses one at a time until only one remains, then repeats it forever. This means: (a) if a handler makes *fewer* awaited Supabase calls than a test configured, the extra queued responses go silently unused with no way to detect it from `calls` alone; (b) if a handler makes *more* calls than configured (e.g. a future regression adds an extra, unauthorized `.from()` call), it silently receives a plausible-looking response instead of the test failing. None of the ownership tests (`api-fairy-ownership.test.ts`, `api-profile-ownership.test.ts`) currently assert `calls.length` or the exact sequence of `.from(table)` calls, so a regression that adds an unexpected query would not be caught by this suite.
- **Fix**: Add an assertion helper (e.g. `expectQueueDrained()` or an explicit `calls.length`/`from`-sequence check) used in at least the ownership tests, so both under- and over-consumption of the mock's response queue are caught rather than silently masked.
- **Decision**: FIXED — added `consumedResponseCount()` to `createMockQueryClient`, wired into all 4 ownership tests (`api-fairy-ownership.test.ts`, `api-profile-ownership.test.ts`). Verified live: introduced an extra unfiltered `.select().limit(1)` call into `delete.ts`, confirmed `expect(consumedResponseCount()).toBe(1)` failed (got 2), then reverted.

### F2 — `supabase-key-role.test.ts` verifies its own dummy fixture, not real config, without saying so

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/unit/supabase-key-role.test.ts:15-23
- **Detail**: In the default (no `.env.test`) case, this test decodes and asserts on the dummy JWT baked into `tests/setup/astro-env-server.ts` (`role: "anon"`), which is self-fulfilling — it proves the fixture decodes to `anon`, not that a real deployed `SUPABASE_KEY` is an anon key. It only gains real signal once a real key is supplied via `.env.test`. `tests/unit/auth-rate-limit.test.ts` documents an equivalent limitation inline (lines 10-14); this test doesn't.
- **Fix**: Add a one-line comment noting this test verifies whatever key the current environment supplies (dummy by default) and is only meaningful against a real key once `.env.test` is populated — matching the pattern already used in `auth-rate-limit.test.ts`.
- **Decision**: FIXED — added a clarifying comment block above the `describe`.

### F3 — `tests/helpers/fake-api-context.ts` was not named in the plan's file list

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: tests/helpers/fake-api-context.ts
- **Detail**: The plan's Phase 2/3 "Changes Required" sections describe building a fake `APIContext` inline as part of the handler wiring tests but don't name this file explicitly as a planned artifact. It's a small, clearly necessary shared helper referenced by nearly every Phase 2-4 test file and already documented in test-plan.md's §6.1 cookbook entry — benign scope growth, not an unplanned feature.
- **Fix**: No action needed — retroactively note it in plan.md's Phase 2 Change 2 file list for future readers, or leave as-is since it's already surfaced in this review.
- **Decision**: FIXED — added `tests/helpers/fake-api-context.ts` to plan.md's Phase 2 Change 2 file list.

### F4 — `eqArgsFor` doesn't scope assertions by table

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/helpers/mock-supabase-client.ts:69-71
- **Detail**: `eqArgsFor` filters `.eq(column, value)` calls across the entire flat `calls` array regardless of which `.from(table)` builder produced them. Current tests avoid collision by using distinct fixture values per resource (`SESSION_USER_ID` vs. `OTHER_RESOURCE_ID`), but the helper itself has no per-table scoping, which could mask a cross-table filter mix-up if a future test reused overlapping values.
- **Fix**: Not urgent given current fixture design; worth a follow-up if `eqArgsFor` is reused across handlers touching multiple tables with the same column name.
- **Decision**: SKIPPED — mitigated by current fixture design; not worth fixing now.

### F5 — Smoke test's fake `AstroCookies` only implements `set`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/setup.smoke.test.ts:13
- **Detail**: `createClient(new Headers(), { set: () => undefined } as never)` papers over the rest of `AstroCookies`'s interface with `as never`. Fine for this narrow smoke test's purpose; would hide a runtime error at compile time only if `createServerClient` ever synchronously touched another `AstroCookies` method.
- **Fix**: No action needed — low risk, isolated to one line in a smoke test.
- **Decision**: SKIPPED — low risk, isolated.
