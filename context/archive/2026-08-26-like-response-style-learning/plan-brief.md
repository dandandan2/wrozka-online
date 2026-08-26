# Feed Liked Answers Back Into Generation — Plan Brief

> Full plan: `context/changes/like-response-style-learning/plan.md`

## What & Why

Roadmap S-03 / FR-007: the up to 10 most recently liked fairy answers
feed back into future generations as a loose style reference — the
mechanism that lets the product's core hypothesis (a fairy that feels
"increasingly attuned" to the user) actually be tested. FR-006 (the like
button) already shipped in S-01; this is purely the read-side wiring.

## Starting Point

`generateFairyAnswer` builds a two-part prompt (persona + profile +
question) with no notion of prior likes. `like.ts` already toggles
`fairy_responses.liked`, correctly scoped to the owning user. The
`(user_id, liked, created_at desc)` index from F-01 is purpose-built for
exactly the query this plan needs.

## Desired End State

Every generation call includes up to the user's 10 most recently liked
answers as a "style reference" section in the prompt, when any exist. A
user with zero likes sees no behavior change. Un-liking a response drops
it from the pool used by the next generation, automatically.

## Key Decisions Made

| Decision                       | Choice                                    | Why (1 sentence)                                                          | Source |
| ------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- | ------ |
| Style-reference content         | Answer text only (no question)             | The style being learned lives in the answer's tone, not the question.       | Plan   |
| Influence strength               | Loose inspiration, not strict mimicry      | Avoids templated/repetitive answers if several liked answers share a tone.  | Plan   |
| Length cap per liked answer      | None — reuses the existing generation cap  | Each liked answer is already bounded by `max_tokens: 400`; no extra logic. | Plan   |
| Un-like handling                 | Real-time re-query, no extra logic         | The pool is fetched fresh on every ask; toggling `liked` naturally excludes it. | Plan   |
| Pool-fetch failure               | Graceful degradation to no style section   | Matches PRD's own "no likes doesn't block generation" stance.               | Plan   |

## Scope

**In scope:**
- Extending `generateFairyAnswer` with an optional liked-answers parameter
- Querying up to 10 recently liked `fairy_responses` in `ask.ts`
- Graceful degradation on fetch failure or zero likes

**Out of scope:**
- Any change to the like button or `/api/fairy/like.ts` (already done)
- Truncating/capping individual liked-answer length
- Including the question alongside each liked answer
- A UI indicator that style-learning is active
- Revisiting the "is 10 the right number" open question
- New database migration

## Architecture / Approach

Two phases: extend the prompt-building function first (pure, no DB
dependency, independently verifiable), then wire one additional indexed
query into the existing ask flow. No new files, no new routes.

## Phases at a Glance

| Phase                                              | What it delivers                          | Key risk                                  |
| ----------------------------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| 1. Extend generateFairyAnswer                         | Optional style-reference prompt section      | None significant — additive, backward-compatible |
| 2. Fetch and pass the liked-answers pool               | Live style-learning loop in the ask flow     | None significant — reuses an existing index    |

**Prerequisites:** S-01 (archived/done).
**Estimated effort:** not estimated — see project convention.

## Open Risks & Assumptions

- Whether 10 is the right pool size stays an open, non-blocking question
  per the PRD — to be evaluated post-launch on real usage.
- "Loose inspiration" is a prompt-engineering judgment call, not something
  verifiable automatically — manual testing (Phase 2) is the only check.

## Success Criteria (Summary)

- A user with no likes sees identical generation behavior to before this
  change.
- A user with a consistent pattern of liked answers sees new answers
  echo that tone without repeating the liked answers verbatim.
- Un-liking an answer removes its influence from the next generation.
