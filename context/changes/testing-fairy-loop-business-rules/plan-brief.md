# Fairy-Loop Business-Rule Integrity — Plan Brief

> Full plan: `context/changes/testing-fairy-loop-business-rules/plan.md`
> Research: `context/changes/testing-fairy-loop-business-rules/research.md`

## What & Why

Rollout Phase 2 of `context/foundation/test-plan.md` targets three business-rule risks: deleted history entries lingering in the AI style pool (#4), AI-provider failure corrupting a `fairy_responses` row (#5), and an unenforced server-side length limit on the "about me" profile field (#7). Research already ran and found all three risks **already mitigated in code** — this plan closes the resulting test-coverage gap so the mitigations can't silently regress.

## Starting Point

Phase 1 (`context/changes/testing-critical-path-security-auth/`) shipped a hermetic Vitest setup (no Docker available, so Supabase is mocked via `tests/helpers/mock-supabase-client.ts` and `fake-api-context.ts`) covering auth and ownership. It deliberately deferred delete/style-pool, AI-failure, and about_me-length testing to this phase. No test currently exercises any of the three flows this plan targets, and no `fetch`-boundary mock for OpenRouter exists yet.

## Desired End State

Three new hermetic test files prove: (1) a deleted answer never reaches the AI-prompt payload, (2) `ask.ts` never writes a corrupt/partial row and always shows a clean error on any AI-provider failure, and (3) an oversized `about_me` posted directly to the API is rejected at exactly the 500-character boundary. `test-plan.md` reflects Phase 2 as complete with corrected risk descriptions and a new cookbook entry for fetch-mocking.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Test file organization | One new file per risk | Matches the existing file-per-concern convention (`api-fairy-ownership.test.ts`, etc.) | Plan |
| OpenRouter mocking | `vi.stubGlobal("fetch", ...)`, no MSW | Single call-site; matches the project's lightweight hand-rolled mock style; avoids a new dependency | Plan |
| Timeout simulation | Simulate an aborted/rejected fetch, not real fake timers | Deterministic and fast; proves the same catch path without fragile `AbortSignal` timer interaction | Plan |
| Risk #4 assertion depth | Assert both the DB query filter AND `generateFairyAnswer`'s call args | Matches test-plan.md's explicit anti-pattern warning — proves exclusion reaches the AI prompt, not just the query shape | Research / Plan |
| Risk #7 boundary coverage | Test both 500 (accepted) and 501 (rejected) | Off-by-one is a classic bug class; boundary case is nearly free to add | Plan |
| Risk #5 scope | Include the adjacent "insert fails after successful AI call" branch | Same file/mocks already being built; it's the other half of "DB stays consistent on failure" | Plan |

## Scope

**In scope:**
- New `tests/helpers/mock-openrouter-fetch.ts` helper
- Three new hermetic test files (Risks #4, #5, #7)
- `test-plan.md` rollout-status sync, cookbook entry, and risk-description correction

**Out of scope:**
- Any change to `ask.ts`, `delete.ts`, `like.ts`, or `profile/update.ts` business logic — it's already correct
- Real-infra/Docker-backed integration tests
- MSW installation
- Real 15-second timeout simulation via fake timers
- Risk #3 (AI-native safety) and cross-cutting CI wiring — Phases 3 and 4 of the rollout

## Architecture / Approach

Every new test follows Phase 1's pattern: mock `@/lib/supabase`'s `createClient`, build a fake `APIContext` via `createFakeContext`, invoke the real exported route handler, and assert on recorded mock-client calls. Risk #5 extends this with one new primitive — a `fetch`-boundary stub — because `test-plan.md` explicitly forbids mocking `src/lib/ai/fairy.ts` internally for this risk.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Risk #5 tests | New fetch-mock helper + 4 test cases (non-OK, missing content, timeout, post-success insert failure) | The new stub must correctly simulate `AbortSignal.timeout`'s rejection shape |
| 2. Risk #4 test | Sentinel-based proof that a deleted answer never reaches `generateFairyAnswer`'s args | Relies on inspecting mock call args, not a live delete→ask sequence — needs careful sentinel construction |
| 3. Risk #7 test | Boundary test at exactly 500 and 501 chars | Low risk — straightforward extension of existing ownership-test pattern |
| 4. Docs wrap-up | `test-plan.md` status, cookbook, and risk-description correction | Low risk — documentation only |

**Prerequisites:** None beyond what Phase 1 already shipped (Vitest, mock helpers, `OPENROUTER_API_KEY` test stub).
**Estimated effort:** ~1 session across 4 phases (three are ~1 test file each, the fourth is documentation).

## Open Risks & Assumptions

- Assumes `AbortSignal.timeout`'s actual rejection shape (a `DOMException` named `"TimeoutError"`) is stable enough to hand-simulate without a real timer — if Node's exact rejection shape changes, only the fetch-mock helper needs updating, not the test assertions.
- Assumes the project's typecheck command is `npm run astro check` (confirmed via `package.json`'s `"astro": "astro"` passthrough script, matching Phase 1's own success criteria).

## Success Criteria (Summary)

- `npm test` passes with all three new test files included, alongside the full existing suite.
- Each new test would demonstrably fail if its corresponding safeguard were removed or regressed (verified manually per phase).
- `test-plan.md` accurately reflects Phase 2 as complete, with risk descriptions corrected to distinguish "mitigated, now tested" from "was broken, now fixed."
