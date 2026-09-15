<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Tarot Reading Implementation Plan

- **Plan**: context/changes/tarot-reading/plan.md
- **Scope**: Full plan (Phases 1-8)
- **Date**: 2026-09-15
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

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

### F1 — History page fetches both tables unbounded, no pagination

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard/history.astro:44-64
- **Detail**: Both `fairy_responses` and `tarot_readings` are fetched in full per user (`.eq("user_id", ...)` with no `.limit()`) and merged/sorted in memory. This pattern already existed for `fairy_responses` before this feature, but this change doubles the unbounded per-user read by adding a second full-table fetch on the same page load. For an active long-term user this grows without bound — no pagination, no date window.
- **Fix**: Add `.limit()` (with pagination, or a date-window filter) to both queries in `history.astro`, mirroring how the "last 10 liked" query elsewhere in the codebase already limits its result set.
  - Strength: Caps the page's read cost regardless of how long a user has been active; low-risk, additive change.
  - Tradeoff: Needs a pagination UX decision (infinite scroll vs. page links vs. just a hard cap) that's out of scope for a quick fix — the plan didn't call for this, so it's genuinely new scope.
  - Confidence: MED — the problem is real and verified in code, but the right fix shape (hard cap vs. real pagination) needs a product call, not just an engineering one.
  - Blind spot: Haven't measured actual per-user row counts in production; this may not be an active problem yet, only a future one.
- **Decision**: FIXED — added `HISTORY_ROW_LIMIT = 100` and `.limit()` on both queries in `history.astro`.

### F2 — `tarot_readings.card_key` has no CHECK constraint

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260913120000_tarot_reading_foundation.sql
- **Detail**: `card_key` is a bare `text not null` with no constraint, unlike `orientation` which is constrained to `upright`/`reversed`. Today `card_key` only ever comes from the fixed 22-entry `MAJOR_ARCANA` list in `cards.ts`, so this isn't an active vulnerability (React escapes the value in `TarotResult.tsx`'s `<img src>` regardless) — it's a defense-in-depth gap, not a live bug.
- **Fix**: Add a `check (card_key in (<22 keys>))` constraint in a new migration, mirroring `orientation`'s existing pattern.
- **Decision**: FIXED — `supabase/migrations/20260915120000_tarot_reading_card_key_check.sql` added.

### F3 — `tarot.ts` imports shared OpenRouter constants from `fairy.ts`

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/ai/tarot.ts:2
- **Detail**: `tarot.ts` imports `MAX_TOKENS`, `OPENROUTER_MODEL`, `REQUEST_TIMEOUT_MS` from `./fairy` — functionally correct (confirmed a pure, behavior-preserving extraction of the shared profile helpers into `profile.ts`), but it makes the unrelated `fairy.ts` module the nominal "owner" of config that both features equally depend on.
- **Fix**: Extract those three constants into a small `src/lib/ai/openrouter-config.ts`, imported by both `fairy.ts` and `tarot.ts`.
  - Strength: Removes the asymmetric dependency; neither feature module owns shared config.
  - Tradeoff: One more small file for a 3-constant extraction — arguably not worth it at this scale.
  - Confidence: MED — clean fix, but genuinely optional; current code works correctly.
  - Blind spot: None significant.
- **Decision**: FIXED — extracted `src/lib/ai/openrouter-config.ts`; both `fairy.ts` and `tarot.ts` now import from it.

### F4 — No unit test for `draw.ts`'s AI-call-failure path specifically

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/unit/api-tarot-safety-check.test.ts
- **Detail**: `tests/unit/api-tarot-safety-check.test.ts` covers the safety-rejection and happy paths for `draw.ts`, but no test exercises the `generateTarotReading` throw/catch branch the way `tests/unit/api-ask-provider-failure.test.ts` does for the fairy flow's equivalent path. The plan's Phase 4 success criteria ("route-level tests pass") technically pass either way — this is a coverage gap, not a failing criterion.
- **Fix**: Add a test mirroring `tests/unit/api-ask-provider-failure.test.ts`'s scenarios (non-OK response, missing content, network failure/timeout) against `draw.ts`.
- **Decision**: FIXED — `tests/unit/api-tarot-provider-failure.test.ts` added (4 new tests).
