# AI-Native Safety Review Implementation Plan

## Overview

Rollout Phase 3 of `context/foundation/test-plan.md` targets Risk #3: the fairy AI generates content a user could read as real medical/financial/legal advice despite the disclaimer. Research (`context/changes/testing-ai-native-safety-review/research.md`) confirmed this risk is genuinely unmitigated at runtime — the only protection today is a soft sentence in the system prompt and static, unconditional UI disclaimer text that renders regardless of the model's actual output. This plan closes that gap with a new deterministic, pattern-based safety checker (production code) wired into the ask flow, tested hermetically with fixtures — no live LLM call is made anywhere in the test suite.

## Current State Analysis

- `src/lib/ai/fairy.ts:13-17` — the system prompt's only safety instruction, a soft directive the model may or may not reliably obey.
- `src/lib/ai/fairy.ts:32-74` (`generateFairyAnswer`) — returns the model's raw content verbatim; no content-safety check exists.
- `src/pages/api/fairy/ask.ts:57-73` — inserts the AI answer into `fairy_responses` straight after a successful `generateFairyAnswer` call, with no moderation step in between.
- `src/components/dashboard/AnswerCard.tsx:23-26` and `src/pages/dashboard/history.astro:47-51` — static disclaimer text, unconditional on response content, so it cannot "catch" anything.
- No existing test in `tests/` touches content safety; everything AI-related is either hermetic provider-failure testing (`tests/unit/api-ask-provider-failure.test.ts`) or ownership/plumbing testing.
- `context/foundation/test-plan.md` §7 imposes a hard constraint carried into this plan's design: no test may assert on the fairy's literal, creative generated text — only structure/safety may be judged.

### Key Discoveries:

- `ask.ts:57-67` already has a clean, reusable failure pattern: on any AI-related failure, discard the answer (no insert) and redirect with the generic message `"Wróżka nie mogła odpowiedzieć. Spróbuj ponownie."` This plan reuses that exact pattern for a safety-check failure rather than inventing a new user-facing error state.
- `tests/unit/api-ask-provider-failure.test.ts:6` already establishes the pattern for mocking `generateFairyAnswer` directly (via `vi.mock("@/lib/ai/fairy", ...)`) to drive `ask.ts` through a specific answer value — this plan's integration test reuses that same mocking approach to feed a canned unsafe string through the real handler.
- The system prompt (`fairy.ts:13-17`) already names the three categories to guard: medical, financial, legal. The checker's category boundaries come directly from this existing instruction, not an invented taxonomy.
- This environment has a real `OPENROUTER_API_KEY` in `.dev.vars` and a `.env.test` override mechanism (`tests/setup/astro-env-server.ts`), but per explicit user decision, this plan makes no use of either — the checker and its tests are 100% deterministic and hermetic, matching every other test in this repository.

## Desired End State

A new `src/lib/ai/safety-checker.ts` module flags fairy answers containing concrete medical/financial/legal recommendations. `ask.ts` runs every successful AI answer through this checker before inserting it; a flagged answer is discarded exactly like an AI-provider failure (no DB write, same generic redirect). Unit tests prove the checker correctly flags representative unsafe examples per category and does not flag benign fairy-style answers that merely mention health/money/legal topics without a concrete recommendation. An integration test proves `ask.ts` actually acts on a flagged answer. `test-plan.md` reflects Phase 3 as complete, with its Quality Gates row corrected to reflect a normal hermetic unit-test gate rather than a "selective" live-call CI trigger.

### Verification

Run `npm test` and confirm the new checker and integration tests pass alongside the existing suite; run `npm run lint` and `npm run astro check` to confirm no regressions.

## What We're NOT Doing

- Not making any live LLM call anywhere in the test suite or in the checker itself — this is a deterministic, pattern-based check only, per explicit decision in this planning session.
- Not attempting semantic/NLU-level understanding of the fairy's answer — the checker is a keyword/pattern matcher and will have both false negatives (a cleverly-phrased recommendation it misses) and, in principle, false positives (though fixtures are chosen to minimize these). It is defense-in-depth alongside the existing system prompt and UI disclaimer, not a complete solution — this limitation is deliberate and documented, not a gap to close later in this phase.
- Not adding a retry/regeneration path when a response is flagged — a flagged answer is discarded once, matching the existing AI-provider-failure UX exactly. No new user-facing error state, no second OpenRouter call.
- Not changing the system prompt, the UI disclaimer components, or `MAX_TOKENS`/timeout constants — this phase only adds a new post-generation check.
- Not wiring CI trigger mechanics (schedule, PR-path-filter, manual dispatch) — that is explicitly Phase 4 "Quality-gates wiring" per `test-plan.md` §3. This phase's tests run as part of the existing `npm test` hermetic suite from day one, so there is no special CI wiring left for Phase 4 to do for *this* risk specifically, but the general CI-gate config work stays in Phase 4's scope.
- Not building a moderation system that flags the *user's question* — only the AI's generated *answer* is checked, matching Risk #3 as worded ("wróżka generuje treść..." — the fairy's output is the risk, not the input).

## Implementation Approach

Add one new deterministic module (`src/lib/ai/safety-checker.ts`) exporting a function that classifies a fairy answer string as safe or unsafe against three keyword/pattern categories derived directly from the system prompt's own instruction (medical, financial, legal). Wire it into `ask.ts` immediately after `generateFairyAnswer` succeeds and before the `fairy_responses` insert, reusing the existing generic-error redirect pattern on a flagged verdict. Test the checker in isolation with a fixture table (unsafe-per-category + benign-non-flagged), then test `ask.ts`'s integration with it the same way `api-ask-provider-failure.test.ts` already tests `ask.ts`'s AI-failure handling — by mocking `generateFairyAnswer`'s return value directly.

## Phase 1: Safety-Checker Module

### Overview

Add the new deterministic pattern-based safety-checker module.

### Changes Required:

#### 1. Safety-checker module

**File**: `src/lib/ai/safety-checker.ts`

**Intent**: Classify a fairy answer string as safe or unsafe by detecting concrete medical, financial, or legal recommendations — the same three categories the system prompt (`fairy.ts:13-17`) already instructs the model to avoid. This is a defense-in-depth check on the model's actual output, not a replacement for the prompt instruction.

**Contract**: Export a function with a signature along the lines of `checkFairyAnswerSafety(answer: string): { safe: boolean; category?: "medical" | "financial" | "legal" }` (exact naming at implementer's discretion, but the module must export something importable from `ask.ts` that returns a safe/unsafe verdict plus which category triggered it, for diagnostic logging). Detection must be pattern/keyword-based over the Polish-language answer text, covering:
  - **Medical**: dosage-instruction language (units like "mg"/"ml"/"tabletek" combined with imperative dosing verbs, e.g. "weź", "zażyj", "przyjmij") and instructions to start/stop/change medication (e.g. "odstaw", "zwiększ dawkę", "przestań brać").
  - **Financial**: concrete buy/sell/invest instructions naming an instrument or action (e.g. "kup akcje", "sprzedaj", "zainwestuj w", "zaciągnij kredyt").
  - **Legal**: concrete legal-action instructions (e.g. "podpisz umowę", "zerwij umowę", "złóż pozew") or citation of specific legal provisions (e.g. "art.", "§").

  A match on any category's patterns is unsafe. Merely mentioning a topic word (e.g. "zdrowie", "pieniądze", "umowa") without an accompanying concrete-action pattern must NOT be flagged — the checker targets actionable recommendations, not topic proximity, since the fairy's whole premise involves talking about life, money, and relationships in a magical register.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Read the module and confirm its three category patterns trace directly back to the system prompt's own three named categories (medical/financial/legal), not an invented taxonomy

---

## Phase 2: Wire the Checker into ask.ts

### Overview

Run every successful AI answer through the new checker before it is persisted, discarding a flagged answer exactly like an AI-provider failure.

### Changes Required:

#### 1. ask.ts safety-check integration

**File**: `src/pages/api/fairy/ask.ts`

**Intent**: After `generateFairyAnswer` returns successfully (`ask.ts:57-61`) and before the `fairy_responses` insert (`ask.ts:69-73`), run the new checker on the returned `answer`. On an unsafe verdict, skip the insert entirely and return the same generic redirect already used for AI-provider failure (`ask.ts:64-66`'s message) — a flagged answer must never reach the database or the user.

**Contract**: Import `checkFairyAnswerSafety` (or whatever the Phase 1 module exports) from `@/lib/ai/safety-checker`, call it on `answer` right after the existing try/catch around `generateFairyAnswer`, and branch to the existing generic-redirect return before reaching the insert call when the verdict is unsafe. Log the flagged category server-side (`console.error` or similar, matching the existing logging style at `ask.ts:63`) for future diagnosis — never expose the category or the flagged content in the user-facing redirect.

### Success Criteria:

#### Automated Verification:

- Full suite passes: `npm test`
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Read the modified handler and confirm a flagged answer cannot reach the `insert` call under any code path

---

## Phase 3: Safety-Checker Unit Tests

### Overview

Prove the checker correctly classifies representative unsafe examples per category and does not flag benign fairy-style answers, guarding against both false negatives and false positives.

### Changes Required:

#### 1. Checker unit test file

**File**: `tests/unit/safety-checker.test.ts`

**Intent**: Directly test `checkFairyAnswerSafety` (no mocking needed — this is a pure function over a string) against a fixture table covering all three unsafe categories and a set of benign answers that must pass.

**Contract**: A fixture-driven test with at least: one unsafe example per category (medical/financial/legal) asserting `safe: false` and the matching `category`, and at least three benign examples that must assert `safe: true` — including at least one benign answer that mentions a topic word (health, money, or a legal term) in a non-actionable, in-character way, to prove the checker doesn't false-positive on topic proximity alone (per the Phase 1 Contract's explicit anti-false-positive requirement).

### Success Criteria:

#### Automated Verification:

- New test file passes: `npx vitest run tests/unit/safety-checker.test.ts`
- Full suite passes: `npm test`
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Read the fixture table and confirm each unsafe example is a realistic concrete recommendation (not a strawman) and each benign example is a realistic in-character fairy answer

---

## Phase 4: ask.ts Integration Test + Docs Wrap-Up

### Overview

Prove `ask.ts` actually acts on a flagged answer end-to-end, then close the loop on `test-plan.md`.

### Changes Required:

#### 1. ask.ts safety-check integration test

**File**: `tests/unit/api-ask-safety-check.test.ts`

**Intent**: Mock `generateFairyAnswer` (via `vi.mock("@/lib/ai/fairy", ...)`, the same approach `tests/unit/api-ask-provider-failure.test.ts:6` uses) to resolve with a canned unsafe string drawn from Phase 3's fixture table, invoke `ask.ts`'s real `POST` handler via `createFakeContext`, and assert no `insert` call was recorded against the mock Supabase client and the redirect matches the same generic error message used for AI-provider failure.

**Contract**: Follow `api-ask-provider-failure.test.ts`'s structure exactly (mock `@/lib/supabase`, mock `@/lib/ai/fairy`'s `generateFairyAnswer` to resolve with the flagged string, supply profile + liked-answers responses via `createMockQueryClient`, assert `calls.some((call) => call.method === "insert")` is `false` and the redirect contains the generic error message). Also include one case with a benign, unflagged `generateFairyAnswer` return value asserting the insert DOES happen — proving the integration doesn't over-block.

#### 2. Cookbook and risk-description updates

**File**: `context/foundation/test-plan.md`

**Intent**: Fill in the §6.5 "Adding an AI-native safety check" placeholder with the pattern actually shipped (deterministic pattern-based checker, not an LLM-judge), and correct §4's "(optional) AI-native" row and §5's "AI-native safety review ... CI on PR (selective)" gate description — since the shipped approach is fully hermetic and runs as part of the normal `npm test` gate, not a selective live-call CI trigger. Note in a short annotation (matching Phase 2's precedent of correcting risk-description assumptions post-research) that this phase deliberately chose a pattern-based check over an LLM-judge to keep the suite fully hermetic, with the known trade-off that keyword matching can miss cleverly-phrased recommendations (false negatives) — this is defense-in-depth alongside the system prompt, not a complete guarantee.

**Contract**: §6.5 gains a short paragraph plus pointers to `src/lib/ai/safety-checker.ts` and `tests/unit/safety-checker.test.ts`/`tests/unit/api-ask-safety-check.test.ts`, matching the style of other filled-in §6 sub-sections. §4's AI-native row and §5's gate row are edited to describe the actual hermetic approach. §3 Phase 3 row moves to `complete` with the change folder filled in.

#### 3. Change record sync

**File**: `context/changes/testing-ai-native-safety-review/change.md`

**Intent**: Reflect that the change has completed implementation.

**Contract**: Set `status: implemented` and `updated: <date of completion>`.

### Success Criteria:

#### Automated Verification:

- New test file passes: `npx vitest run tests/unit/api-ask-safety-check.test.ts`
- Full suite passes: `npm test`
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- A reader unfamiliar with this phase can follow §6.5 of `test-plan.md` and find the checker module and both test files without additional context, and understands from the corrected §4/§5 wording why no live LLM call or special CI trigger is involved

---

## Testing Strategy

### Unit Tests:

- Phase 3 tests the checker in isolation (pure function, fixture table).
- Phase 4 tests `ask.ts`'s integration with the checker (mocked `generateFairyAnswer`, real handler).

### Integration Tests:

- None beyond the hermetic route-handler test in Phase 4 — no live external calls anywhere in this phase, per explicit decision.

### Manual Testing Steps:

1. Run `npm test` and confirm the new checker and integration tests pass alongside the existing suite.
2. Temporarily comment out the Phase 2 safety-check call in `ask.ts` locally and confirm the Phase 4 integration test's "flagged answer is discarded" case fails — proves the test isn't vacuous. Revert afterward.
3. Manually read through the Phase 3 fixture table and try to think of one plausible unsafe fairy answer not covered by any category — if found, add it as a new fixture case before considering this phase done.

## Performance Considerations

None — the checker is a synchronous, in-process pattern match over a short string (capped at `MAX_TOKENS = 400`); negligible added latency to the existing request path.

## Migration Notes

Not applicable — no schema or data changes in this phase.

## References

- Research: `context/changes/testing-ai-native-safety-review/research.md`
- Reused failure-handling pattern: `src/pages/api/fairy/ask.ts:57-67`
- Reused test-mocking pattern: `tests/unit/api-ask-provider-failure.test.ts`
- Governing risk map and constraints: `context/foundation/test-plan.md` §2 (Risk #3), §7

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Safety-Checker Module

#### Automated

- [x] 1.1 Type checking passes: `npm run astro check` — a36e784
- [x] 1.2 Linting passes: `npm run lint` — a36e784

#### Manual

- [x] 1.3 Confirm the three category patterns trace directly back to the system prompt's own three named categories — a36e784

### Phase 2: Wire the Checker into ask.ts

#### Automated

- [x] 2.1 Full suite passes: `npm test` — 66a1e9e
- [x] 2.2 Type checking passes: `npm run astro check` — 66a1e9e
- [x] 2.3 Linting passes: `npm run lint` — 66a1e9e

#### Manual

- [x] 2.4 Confirm a flagged answer cannot reach the insert call under any code path — 66a1e9e

### Phase 3: Safety-Checker Unit Tests

#### Automated

- [x] 3.1 New test file passes: `npx vitest run tests/unit/safety-checker.test.ts` — aa2cbf0
- [x] 3.2 Full suite passes: `npm test` — aa2cbf0
- [x] 3.3 Type checking passes: `npm run astro check` — aa2cbf0
- [x] 3.4 Linting passes: `npm run lint` — aa2cbf0

#### Manual

- [x] 3.5 Confirm each unsafe fixture is a realistic concrete recommendation and each benign fixture is a realistic in-character fairy answer — aa2cbf0

### Phase 4: ask.ts Integration Test + Docs Wrap-Up

#### Automated

- [x] 4.1 New test file passes: `npx vitest run tests/unit/api-ask-safety-check.test.ts`
- [x] 4.2 Full suite passes: `npm test`
- [x] 4.3 Type checking passes: `npm run astro check`
- [x] 4.4 Linting passes: `npm run lint`

#### Manual

- [x] 4.5 A reader unfamiliar with this phase can follow §6.5 and the corrected §4/§5 wording without additional context
