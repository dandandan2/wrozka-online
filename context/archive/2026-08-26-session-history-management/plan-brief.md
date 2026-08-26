# Session History — View, Delete, Like/Unlike — Plan Brief

> Full plan: `context/changes/session-history-management/plan.md`

## What & Why

Roadmap S-04, the final slice of milestone M-1: users can see their full
fairy-response history, delete an entry, and like/unlike from that list
(FR-008/009/010). Deleting also removes an entry's influence on S-03's
style-learning pool — automatically, since that pool only reads rows that
still exist.

## Starting Point

`fairy_responses` already holds everything needed (question, answer,
liked, created_at). `like.ts` toggles likes but only knows how to
redirect back to `/dashboard`. No delete route or history page exists
yet. `AnswerCard.tsx` is built for a single "latest answer" view, too
heavy to reuse per-item in a list.

## Desired End State

`/dashboard/history` lists every past question/answer, most recent
first, each with a like toggle and a confirm-then-delete button. A user
with no history sees a message pointing back to the ask flow. A
"Historia" link on `/dashboard` reaches the page.

## Key Decisions Made

| Decision                        | Choice                                       | Why (1 sentence)                                                          | Source |
| --------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| Delete confirmation               | Client-side `window.confirm()` before submit    | Deletion is permanent (hard delete, also affects style pool) — needs a guard against accidental clicks. | Plan   |
| Like-from-history mechanism       | Extend `like.ts` with an allow-listed `redirect_to` | One route handles both call sites; allow-list (not free-form) avoids an open redirect. | Plan   |
| List size                         | Full history, no pagination                     | Matches PRD's small/low target scale — a solo hobby app's history won't reach a size where this matters soon. | Plan   |
| Empty state                       | Message + link back to `/dashboard`             | Guides a new user back into the ask flow, consistent with `/dashboard`'s own "complete your profile" pattern. | Plan   |
| Nav placement                     | Same row as "Edytuj profil" / sign-out           | Reuses the existing nav pattern — no new UI element to design.            | Plan   |
| Disclaimer repetition              | Once at the top of the page, not per item        | PRD requires the disclaimer be visible, not duplicated 20 times on a long list. | Plan   |
| Deleted "latest response" edge case | No special handling                             | `/dashboard`'s existing query naturally returns nothing for a deleted row on the next visit. | Plan   |

## Scope

**In scope:**
- `/dashboard/history` page listing all entries, most recent first
- Delete route + confirm-before-delete UI
- Like/unlike from the history list, staying on the history page
- "Historia" nav link on `/dashboard`

**Out of scope:**
- Pagination
- Soft-delete / undo
- Repeated per-item disclaimer
- Any change to `AnswerCard.tsx` or the `/dashboard` ask flow
- New database migration

## Architecture / Approach

Two phases: backend first (new delete route, `like.ts` extended with an
allow-listed redirect target — both independently testable via direct
requests), then the history page, its compact `HistoryItem` component,
and the nav link. No new tables, no new indexes — reuses F-01's schema
and index as-is.

## Phases at a Glance

| Phase                                              | What it delivers                                | Key risk                                                       |
| ----------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| 1. Backend — delete route + like redirect extension    | New delete endpoint, history-aware like redirect    | Open-redirect risk if `redirect_to` isn't allow-listed — mitigated by design |
| 2. Frontend — history page and navigation              | Full S-04 user flow end to end                      | None significant — additive UI on top of already-verified data       |

**Prerequisites:** S-01 and S-03 (both archived/done).
**Estimated effort:** not estimated — see project convention.

## Open Risks & Assumptions

- None significant — this is the last slice of a milestone whose
  underlying data model (F-01) and generation logic (S-01, S-03) are
  already implemented and reviewed.

## Success Criteria (Summary)

- A user can see, like/unlike, and delete every past fairy response.
- Deleting an entry is permanent and confirmed before it happens.
- A deleted, previously liked entry stops influencing future generated
  answers.
