# Feed Liked Answers Back Into Generation Implementation Plan

## Overview

Implement roadmap S-03 / FR-007: up to the 10 most recently liked
`fairy_responses` answers are fed back into `generateFairyAnswer` as a
loose style reference, so answers gradually feel more attuned to the
user's preferred tone. FR-006 (the like button itself) already shipped in
S-01 — this plan only wires the read side.

## Current State Analysis

- `src/lib/ai/fairy.ts`'s `generateFairyAnswer(profile, question)` builds
  a two-message prompt (system persona + user profile/question) and has
  no notion of prior liked answers.
- `src/pages/api/fairy/ask.ts` already queries `profiles` before calling
  `generateFairyAnswer`; it has no query against `fairy_responses` today.
- `fairy_responses` has an existing index
  `(user_id, liked, created_at desc)` from F-01, purpose-built for
  exactly this "last N liked, most recent first" query.
- `src/pages/api/fairy/like.ts` (S-01, hardened in S-01's impl-review)
  toggles `liked` scoped to `.eq("user_id", user.id)` — un-liking a
  response is already a real-time state change with no extra work needed
  for it to drop out of a live query.
- PRD's US-01 acceptance criteria already states: "Brak wcześniejszych
  polubień nie blokuje wygenerowania odpowiedzi" — zero/few likes is an
  expected, non-error state.

## Desired End State

Every call to `generateFairyAnswer` includes up to the user's 10 most
recently liked answers (most recent first) as a "style reference" prompt
section, when any exist. The model is instructed to loosely echo their
tone, not copy them. A user with no liked answers yet gets generation
exactly as before (no style section). A failure to fetch the liked pool
degrades gracefully to no-style-section generation rather than blocking
the ask flow.

Verification: like several answers with a distinctive tone, ask a new
question, and observe the new answer echoing that tone; confirm
generation still works normally for a user with zero likes.

### Key Discoveries:

- No new migration needed — the `(user_id, liked, created_at desc)`
  index already exists and fits this query exactly:
  `.eq("user_id", ...).eq("liked", true).order("created_at", { ascending: false }).limit(10)`.
- No UI change needed — the like button and its persistence are already
  built; this plan is prompt-construction plus one additional read query
  in the existing ask flow.

## What We're NOT Doing

- No changes to the like button or `/api/fairy/like.ts` — FR-006 is
  already complete.
- No truncation/length-capping of included liked answers — each is
  already bounded by the existing `max_tokens: 400` generation cap.
- No inclusion of the *question* that prompted each liked answer — only
  the answer text is used as the style reference.
- No UI indicator showing "style learning is active" — not required by
  FR-007 or US-01.
- No revisiting the "is 10 the right number" question — PRD already
  parks this as a post-launch tuning question, not blocking MVP.
- No new database migration.
- No automated test framework — matches prior slices' precedent.

## Implementation Approach

Two phases: extend the AI module's prompt-building first (independently
verifiable via a code review, no DB dependency), then wire the new query
into `ask.ts`.

## Phase 1: Extend generateFairyAnswer with a style-reference parameter

### Overview

Add an optional liked-answers list to the prompt, with a "loose
inspiration" instruction.

### Changes Required:

#### 1. Accept and render liked answers in the prompt

**File**: `src/lib/ai/fairy.ts`

**Intent**: Let callers pass the user's recently liked answers so the
model can loosely echo their tone, without changing behavior for callers
that pass none.

**Contract**: `generateFairyAnswer`'s signature gains a third parameter,
`likedAnswers: string[] = []`. When non-empty, the user message gains an
additional section (after the profile, before the question) listing the
liked answers, prefixed by an instruction such as "Poniższe to
przykłady odpowiedzi, które użytkownik wcześniej polubił — potraktuj je
jako luźną inspirację dla tonu Twojej odpowiedzi, nie kopiuj ich
dosłownie i nie powtarzaj tych samych fraz." When `likedAnswers` is
empty, the prompt is byte-for-byte identical to today's (no new section
rendered) — preserving existing behavior for the zero-likes case.

### Success Criteria:

#### Automated Verification:

- New parameter present: `grep -q "likedAnswers" src/lib/ai/fairy.ts`
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Code reviewed: the "loose inspiration, don't copy" instruction is
  present and the empty-array case renders no extra prompt section.

---

## Phase 2: Fetch and pass the liked-answers pool in the ask flow

### Overview

Query up to 10 recently liked answers and pass them into generation.

### Changes Required:

#### 1. Fetch the liked-answers pool

**File**: `src/pages/api/fairy/ask.ts`

**Intent**: Supply `generateFairyAnswer` with the user's current style
reference pool.

**Contract**: after the existing profile-completeness check and before
calling `generateFairyAnswer`, query
`fairy_responses` via
`.select("answer").eq("user_id", user.id).eq("liked", true).order("created_at", { ascending: false }).limit(10)`.
On a query error, or no rows, treat the pool as `[]` (graceful
degradation — never blocks or errors the ask flow). Pass the resulting
`answer` strings as the new third argument to `generateFairyAnswer`.

### Success Criteria:

#### Automated Verification:

- Query present: `grep -q '.eq("liked", true)' src/pages/api/fairy/ask.ts`
- Liked answers passed through: `grep -q "likedAnswers" src/pages/api/fairy/ask.ts`
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- A user with zero liked answers gets a normal generated answer (no
  regression from before this change).
- Liking 2-3 answers with a distinctive, consistent tone (e.g. very
  short and blunt, or very flowery and verbose), then asking a new
  question, produces an answer that echoes that tone without repeating
  the liked answers verbatim.
- Un-liking a previously liked answer and asking again shows it no
  longer influences the next generation.

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human
that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- None — no test framework installed, matching prior slices' precedent.

### Integration Tests:

- None automated. Manual testing steps below substitute.

### Manual Testing Steps:

1. As a user with zero liked answers, ask a question; confirm the answer
   generates normally.
2. Ask 2-3 more questions and like the answers, aiming for a consistent,
   distinctive tone across them.
3. Ask a new question; confirm the new answer's tone loosely echoes the
   liked ones without repeating their exact phrasing.
4. Un-like one of the liked answers; ask again; confirm the pool used for
   that generation no longer includes it (observable via tone shift if
   the un-liked answer was distinctive, or just via the query itself if
   inspecting logs/DB).
5. Confirm liking/un-liking still works exactly as in S-01 (this plan
   doesn't touch `like.ts`).

## Performance Considerations

One additional indexed `SELECT` per ask request
(`(user_id, liked, created_at desc)`, `LIMIT 10`) — cheap, single-row-set
lookup, no N+1 risk. Prompt size grows by at most 10 answer texts (each
already bounded by the existing 400-token generation cap), well within
typical model context windows.

## Migration Notes

None — reuses the existing `fairy_responses` schema and index from F-01
unchanged.

## References

- Roadmap: `context/foundation/roadmap.md` (S-03)
- PRD: `context/foundation/prd.md` (FR-006 — already done in S-01; FR-007
  — this plan; Business Logic section describing the "up to 10, most
  recent first" rule)
- Prior implementation: `context/archive/2026-08-26-ask-fairy-personalized-answer/plan.md`
  (S-01, built `generateFairyAnswer`, `ask.ts`, `like.ts`, and the
  `(user_id, liked, created_at desc)` index this plan reuses)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Extend generateFairyAnswer with a style-reference parameter

#### Automated

- [x] 1.1 New parameter present
- [x] 1.2 Type checking passes
- [x] 1.3 Linting passes

#### Manual

- [ ] 1.4 Prompt instruction and empty-array behavior reviewed

### Phase 2: Fetch and pass the liked-answers pool in the ask flow

#### Automated

- [ ] 2.1 Query present
- [ ] 2.2 Liked answers passed through
- [ ] 2.3 Type checking passes
- [ ] 2.4 Linting passes

#### Manual

- [ ] 2.5 Zero-likes user gets normal generation
- [ ] 2.6 Liked-tone echo observed in new generation
- [ ] 2.7 Un-liking removes influence from next generation
