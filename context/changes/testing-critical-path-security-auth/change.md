---
change_id: testing-critical-path-security-auth
title: Critical-path security & auth test coverage (rollout Phase 1)
status: impl_reviewed
created: 2026-08-27
updated: 2026-08-27
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Critical-path security & auth".
Risks covered: #1 (cross-user data leak via profile/history), #2 (magic-link/kod auth flow correctness), #6 (magic-link resource-abuse/throttling).
Test types planned: unit + integration (bootstraps Vitest — no test runner exists yet).
Risk response intent:
- #1: prove User A's request never returns/mutates User B's profile or fairy_responses rows; ground which queries rely on RLS vs. explicit user_id filters.
- #2: prove a valid link/code issues a session for the right user and expired/reused/foreign codes are rejected; ground the token/code lifecycle and callback route.
- #6: prove repeated link/code requests to the same email are throttled or rejected past a threshold; ground whether any rate-limit exists today.
