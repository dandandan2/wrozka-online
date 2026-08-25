# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Post-epilogue fixes must update plan.md

- **Context**: Post-epilogue fix commits in any change — any `fix(<change-id>)`-style commit (or similar) that lands after that change's "close out plan (epilogue)" commit.
- **Problem**: plan.md stops being a reliable source of truth. Seen twice in one session (F-01: `profiles_set_updated_at` trigger added in commit `99326f4`; F-02: dead `/auth/signup` links removed in commit `3fa7464`) — plan.md doesn't reflect what actually shipped, which undermines future reviews and anyone reading the plan as documentation.
- **Rule**: Whenever a commit lands after a change's "close out plan (epilogue)" commit and touches files from that change, add a short addendum to plan.md (a new phase or a note under Migration Notes) in the same PR/commit as the fix — don't wait for the next impl-review to catch it.
- **Applies to**: implement, impl-review
