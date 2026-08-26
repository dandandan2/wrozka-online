# Edit Profile — Plan Brief

> Full plan: `context/changes/edit-profile/plan.md`

## What & Why

Roadmap S-02: users can edit a previously filled profile (FR-003). The
form already exists from S-01 and functionally acts as an edit form —
this plan closes the two gaps S-01 deliberately deferred: server-side
validation matching the client-side rules, and visible confirmation after
saving an edit.

## Starting Point

`/dashboard/profile` + `ProfileForm.tsx` + `/api/profile/update.ts`
(built in S-01) already read, pre-fill, and update the `profiles` row.
Client-side validation exists for `name`/`birth_date`; server-side only
`about_me`'s 500-char length is checked. On success, the route silently
redirects to `/dashboard` with no confirmation.

## Desired End State

An empty name or a future birth date is rejected server-side, not just
client-side. Saving valid changes redirects back to `/dashboard/profile`
with a visible "Zapisano zmiany" confirmation.

## Key Decisions Made

| Decision                       | Choice                                      | Why (1 sentence)                                                          | Source |
| ------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------- | ------ |
| Success feedback               | Banner on `/dashboard/profile` after redirect | Existing redirect-with-query-param pattern (`?error=`) extends naturally to `?success=1`. | Plan   |
| Server-side validation         | Add name/birth_date checks                    | Closes a real gap flagged as an observation in S-01's impl-review.        | Plan   |
| Cancel/dirty-state handling    | Not added                                     | S-01 explicitly deferred it; PRD/FR-003 doesn't require it.               | Plan   |
| Scope                          | Feedback + validation only                    | Confirmed as the full scope — nothing else needed for FR-003.             | Plan   |

## Scope

**In scope:**
- Server-side validation for `name` (non-empty) and `birth_date` (present, not future)
- Success confirmation banner after saving

**Out of scope:**
- Cancel/dirty-state handling or unsaved-changes warnings
- New entry points to the profile page (existing link is sufficient)
- Any change to `about_me`'s validation
- New database migration

## Architecture / Approach

Two small phases, both modifying only the three files S-01 already built
(`update.ts`, `profile.astro`, `ProfileForm.tsx`) — no new files, no new
routes, no new data model.

## Phases at a Glance

| Phase                              | What it delivers                          | Key risk                                    |
| ------------------------------------ | ------------------------------------------- | ---------------------------------------------- |
| 1. Server-side profile validation    | Empty name / future birth date rejected     | None significant — mirrors existing pattern    |
| 2. Save-success feedback             | Visible confirmation after a successful edit | None significant — small, additive UI change   |

**Prerequisites:** S-01 (archived/done).
**Estimated effort:** not estimated — see project convention.

## Open Risks & Assumptions

- None significant — this is a small, additive change to an existing,
  already-verified form.

## Success Criteria (Summary)

- Editing the profile with valid data shows a visible save confirmation.
- Attempting to save an empty name or a future birth date is rejected by
  the server, not just the client.
