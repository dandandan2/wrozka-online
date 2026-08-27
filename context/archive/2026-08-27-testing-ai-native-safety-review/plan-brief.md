# AI-Native Safety Review — Plan Brief

> Full plan: `context/changes/testing-ai-native-safety-review/plan.md`
> Research: `context/changes/testing-ai-native-safety-review/research.md`

## What & Why

Rollout Phase 3 targets Risk #3: the fairy AI could generate content a user reads as real medical/financial/legal advice despite a disclaimer. Research found this risk is genuinely unmitigated — unlike Phases 1-2, where the code turned out to already be correct, here the only protection today is a soft system-prompt sentence and static UI disclaimer text that renders regardless of what the model actually said. This plan closes that gap with real production code, not just a test.

## Starting Point

`src/lib/ai/fairy.ts` sends a single system-prompt instruction telling the model not to give medical/financial/legal advice, then returns its raw response verbatim — no moderation, filter, or validation step exists between the model's output and what gets persisted and shown to the user. `src/pages/api/fairy/ask.ts` already has a clean failure-handling pattern (discard + generic redirect) for AI-provider failures, which this plan reuses.

## Desired End State

A new deterministic pattern-based safety checker inspects every AI-generated answer before it's saved. An answer containing a concrete medical, financial, or legal recommendation is discarded — the user sees the same generic "try again" message already used for provider failures, and nothing unsafe reaches the database or the screen. The check runs as an ordinary part of `npm test`, with zero live LLM calls anywhere in the suite.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Live LLM-judge vs. pattern-based check | Pattern-based, deterministic | User explicitly rejected real LLM calls in tests, mid-planning | Plan |
| Scope: test-only vs. production code | Build real production code (a checker wired into ask.ts) | Without it, there's nothing deterministic to test against — a pattern-matcher that isn't wired in doesn't close the actual gap | Plan |
| Judge/checker categories | Medical, financial, legal keyword/pattern rules | Directly derived from the system prompt's own three named categories, not invented | Research / Plan |
| Behavior on flag | Discard and reuse the existing generic AI-failure redirect | Reuses `ask.ts`'s existing failure path exactly, zero new user-facing error states | Plan |
| Adversarial input scope | Medical/financial/legal-shaped questions only, not prompt-injection | Matches Risk #3 as literally worded; prompt-injection is a different, unsourced risk | Plan |
| File location | `src/lib/ai/safety-checker.ts`, tests in `tests/unit/` | Fully hermetic now — no need for a separate "AI-native" test directory once the live-call design was dropped | Plan |

## Scope

**In scope:**
- New `src/lib/ai/safety-checker.ts` deterministic checker
- Wiring it into `ask.ts`'s ask flow
- Unit tests for the checker (fixture-based) and an integration test proving `ask.ts` acts on it
- `test-plan.md` corrections: Phase 3 status, §6.5 cookbook, §4/§5 wording (no longer "selective CI" — it's a normal hermetic gate)

**Out of scope:**
- Any live LLM call, anywhere, including as a "judge"
- Prompt-injection/jailbreak testing (a different, unsourced risk)
- Retry/regeneration on a flagged answer — discard-once only
- CI trigger mechanics (schedule, path-filter, manual dispatch) — Phase 4 "Quality-gates wiring"
- Changes to the system prompt, UI disclaimer components, or token/timeout constants

## Architecture / Approach

`ask.ts` calls `generateFairyAnswer` (unchanged), then passes the result through the new `checkFairyAnswerSafety` function before the existing `fairy_responses` insert. A flagged verdict short-circuits to the same generic redirect the code already uses for AI-provider failure — no new code path, just an added gate before persistence.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Safety-checker module | New deterministic checker, 3 categories | Pattern design must avoid false positives on topic-mention-only text |
| 2. Wire into ask.ts | Flagged answers discarded before insert | Must sit exactly between generate and insert, no gaps |
| 3. Checker unit tests | Fixture table proving correct classification | Fixtures must be realistic, not strawmen |
| 4. Integration test + docs | ask.ts proven to act on the checker; test-plan.md corrected | None significant |

**Prerequisites:** None beyond what Phases 1-2 already shipped (Vitest, mock helpers).
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- Keyword/pattern matching will have false negatives (a cleverly-phrased recommendation it misses) by design — this is explicitly accepted as defense-in-depth, not a complete guarantee, and is documented as such rather than treated as a gap to close.
- The exact keyword/pattern list is a judgment call made during implementation (Phase 1); if real production traffic later reveals a missed pattern, that's a follow-up fixture addition, not a plan failure.

## Success Criteria (Summary)

- `npm test` passes with the new checker and integration tests included, zero live network calls.
- A flagged fairy answer never reaches `fairy_responses` or the user, verified by an integration test that would fail if the wiring were removed.
- `test-plan.md` accurately reflects the hermetic, pattern-based approach actually shipped.
