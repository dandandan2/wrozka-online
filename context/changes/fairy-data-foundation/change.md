---
change_id: fairy-data-foundation
title: Minimal data foundation - profile and fairy responses with RLS
status: impl_reviewed
created: 2026-08-25
updated: 2026-08-25
archived_at: null
---

## Notes

Roadmap Foundation F-01. Creates `profiles` and `fairy_responses` tables with
RLS, plus a trigger that auto-creates a `profiles` row on new auth signups.
No UI/API in this change - that lands in S-01 (`ask-fairy-personalized-answer`).
