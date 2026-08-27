---
change_id: testing-fairy-loop-business-rules
title: Fairy-loop business-rule integrity test coverage (rollout Phase 2)
status: archived
created: 2026-08-27
updated: 2026-08-27
archived_at: 2026-08-27T20:04:45Z
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Fairy-loop business-rule integrity".
Risks covered: #4 (delete nie usuwa wpisu z puli wzorców stylu), #5 (AI-provider failure/timeout zostawia niespójny wpis lub niejasny błąd), #7 (brak serwerowego limitu długości pola "o sobie").
Test types planned: integration + unit.
Risk response intent:
- #4: prove that after deleting a fairy_responses entry, a subsequent ask() no longer includes that answer in the liked-answers style-pattern context; ground the query that builds the liked-answers list and the delete handler's interaction with it.
- #5: prove that on AI-provider failure/timeout, the user sees a clean error and no partial or corrupt fairy_responses row is written; ground the generate-then-insert ordering in ask.ts and whether any partial-write window exists.
- #7: prove an oversized "about_me" submitted directly via API (bypassing the UI) is rejected or truncated server-side; ground the actual server-side validation (or absence) on profile update — note research for Phase 1 already found profile/update.ts enforces ABOUT_ME_MAX_LENGTH=500 server-side, so this may already be covered and needs confirming rather than assuming a gap.
