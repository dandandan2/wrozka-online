# Session History — View, Delete, Like/Unlike Implementation Plan

## Overview

Implement roadmap S-04, the milestone's final slice: a `/dashboard/history`
page listing the user's full `fairy_responses` history, with per-entry
delete (FR-009) and like/unlike (FR-010). FR-008 (seeing the history) is
the page itself.

## Current State Analysis

- `fairy_responses` (id, user_id, question, answer, liked, created_at) has
  no soft-delete column — deletion is a hard `DELETE`, per F-01's design.
  This means FR-009's "delete also removes it from the style pool" is
  automatic: S-03's pool query (`.eq("liked", true)`) can't return a row
  that no longer exists.
- `src/pages/api/fairy/like.ts` toggles `liked`, correctly scoped to
  `.eq("user_id", user.id)`, and always redirects to
  `/dashboard?response=<id>`. There's no way today to invoke it from
  anywhere else and land back there.
- `src/components/dashboard/AnswerCard.tsx` is built for the single
  "latest answer" view on `/dashboard` (includes the full disclaimer
  banner) — too heavy to reuse as-is for a multi-item list.
- `src/pages/dashboard.astro` has a nav row with "Edytuj profil" and
  "Sign out" links — the natural place for a third "Historia" link.
- No delete route exists yet anywhere in `src/pages/api/fairy/`.
- Existing client-side-validated forms (`AuthForm.tsx`, `ProfileForm.tsx`)
  establish the pattern: a React island wraps a plain
  `<form method="POST">`, with an `onSubmit` handler that can
  `e.preventDefault()` to block submission — this is the mechanism this
  plan reuses for the delete confirmation.

## Desired End State

`/dashboard/history` shows every one of the user's fairy_responses, most
recent first, each with its question, answer, a like/unlike toggle, and a
delete button that asks for confirmation before submitting. Deleting an
entry removes it permanently (and, as a side effect, from S-03's style
pool). Liking/unliking from this page keeps the user on the history page.
A user with no history sees a short message and a link back to the ask
flow. A "Historia" link is reachable from `/dashboard`.

Verification: ask and like a few questions, visit the history page,
toggle a like from there, delete an entry, confirm it's gone and no
longer influences future style-pool generation.

### Key Discoveries:

- No new migration needed — the existing schema and the
  `(user_id, liked, created_at desc)` index already support this slice;
  a plain `.eq("user_id", ...).order("created_at", { ascending: false })`
  query (no `liked` filter) serves the full-history list.
- FR-009's "removes it from the style pool" requirement needs no explicit
  code — it's a consequence of S-03's pool query plus a hard delete.

## What We're NOT Doing

- No pagination — the full history renders in one query/page, matching
  the PRD's small/low target scale.
- No soft-delete / undo — deletion is permanent, matching F-01's schema
  design (no `deleted_at` column exists).
- No repeated disclaimer per history item — one banner at the top of the
  page is sufficient; PRD requires the disclaimer to be visible, not
  duplicated per item.
- No special-case handling for deleting the entry currently shown as
  `/dashboard`'s "latest response" — the next visit to `/dashboard`
  simply won't find that row, which is already the natural behavior of
  the existing query there.
- No changes to `AnswerCard.tsx` or the `/dashboard` ask flow itself.
- No new database migration.
- No automated test framework — matches prior slices' precedent.

## Implementation Approach

Two phases: backend first (new delete route + `like.ts`'s redirect
extension, both independently testable via direct requests), then the
history page and its UI wiring.

## Critical Implementation Details

**`redirect_to` must be an allow-list, not a free-form redirect target.**
`like.ts` gains an optional `redirect_to` form field so it can be invoked
from both `/dashboard` (existing behavior) and `/dashboard/history` (new).
To avoid turning this into an open-redirect vector, the handler must
validate `redirect_to` against a small fixed allow-list
(`/dashboard`, `/dashboard/history`) and fall back to the existing
`/dashboard?response=<id>` behavior for anything else — never redirect to
a raw, unvalidated value from form input.

## Phase 1: Backend — delete route and like redirect extension

### Overview

Add the delete endpoint and extend the existing like endpoint to support
being invoked from the history page.

### Changes Required:

#### 1. Delete route

**File**: `src/pages/api/fairy/delete.ts` (new)

**Intent**: Permanently remove a `fairy_responses` row the user owns.

**Contract**: `POST` handler. If no `context.locals.user`, redirect to
`/auth/signin`. Reads `id` from form data; if missing, redirect to
`/dashboard/history`. Calls
`.from("fairy_responses").delete().eq("id", id).eq("user_id", user.id)`.
On a Supabase error, redirect to
`/dashboard/history?error=<generic message>`. On success, redirect to
`/dashboard/history`.

#### 2. Extend the like route with an allow-listed redirect target

**File**: `src/pages/api/fairy/like.ts`

**Intent**: Let the history page reuse this route while staying on the
history page after toggling, without introducing an open-redirect
vector.

**Contract**: reads an additional `redirect_to` field from form data. If
its value is exactly `/dashboard/history`, use that as the base redirect
target on both the success and error paths (replacing today's hardcoded
`/dashboard`); for any other value (including absent), keep today's
existing behavior (`/dashboard?response=<id>` / `/dashboard?response=<id>&error=...`)
unchanged. On the `/dashboard/history` path, success redirects to
`/dashboard/history` and error redirects to
`/dashboard/history?error=<message>` (no `response=<id>` param needed
there, since the history page doesn't use it).

### Success Criteria:

#### Automated Verification:

- Delete route exists and scopes to the user: `test -f src/pages/api/fairy/delete.ts && grep -q '.eq("user_id", user.id)' src/pages/api/fairy/delete.ts`
- Delete route touches the right table: `grep -q 'from("fairy_responses")' src/pages/api/fairy/delete.ts`
- Like route reads redirect_to: `grep -q "redirect_to" src/pages/api/fairy/like.ts`
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Code reviewed: `redirect_to` handling only accepts the exact
  `/dashboard/history` value and never echoes an arbitrary form value
  into a redirect.

---

## Phase 2: Frontend — history page and navigation

### Overview

Build the history list UI and wire it into the dashboard's navigation.

### Changes Required:

#### 1. Compact history item component

**File**: `src/components/dashboard/HistoryItem.tsx` (new)

**Intent**: Render one history entry compactly (no repeated disclaimer),
with like/unlike and a confirm-before-delete action.

**Contract**: props `{ id: string; question: string; answer: string; liked: boolean; createdAt: string }`.
Renders question, answer, and creation date. A
`<form method="POST" action="/api/fairy/like">` with hidden `id` and
`redirect_to="/dashboard/history"` fields plus a like-toggle button
(same visual treatment as `AnswerCard`'s like button). A second
`<form method="POST" action="/api/fairy/delete">` with a hidden `id`
field and a submit button; the form's `onSubmit` calls
`window.confirm(...)` and calls `e.preventDefault()` if the user cancels
(mirrors the validate-then-`preventDefault` pattern already used in
`AuthForm.tsx`/`ProfileForm.tsx`).

#### 2. History page

**File**: `src/pages/dashboard/history.astro` (new)

**Intent**: List the user's full history, most recent first.

**Contract**: reads `context.locals.user`; queries `fairy_responses` via
`.select("id, question, answer, liked, created_at").eq("user_id", user.id).order("created_at", { ascending: false })`.
Renders the "to rozrywka, nie porada" disclaimer once at the top (reusing
the same copy as `AnswerCard`). Renders `Astro.url.searchParams.get("error")`
via `ServerError` if present. If the query returns zero rows, renders a
"Nie masz jeszcze żadnej historii" message with a link to `/dashboard`.
Otherwise maps each row to a `HistoryItem`. Wrapped in the existing
`Layout`, with a "Back to dashboard" link matching the pattern on
`/dashboard/profile`.

#### 3. Navigation link

**File**: `src/pages/dashboard.astro`

**Intent**: Make the history page reachable from the dashboard.

**Contract**: add a third link, `<a href="/dashboard/history">Historia</a>`,
into the existing nav row alongside "Edytuj profil" and the sign-out
form.

### Success Criteria:

#### Automated Verification:

- Files exist: `test -f src/components/dashboard/HistoryItem.tsx && test -f src/pages/dashboard/history.astro`
- History page queries the right table: `grep -q 'from("fairy_responses")' src/pages/dashboard/history.astro`
- Nav link present: `grep -q "/dashboard/history" src/pages/dashboard.astro`
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- A user with no history sees the empty-state message and a working link
  back to `/dashboard`.
- A user with history sees all entries, most recent first, each showing
  question/answer/like-state/date.
- Liking/unliking an entry from the history page keeps the user on
  `/dashboard/history` and reflects the new state.
- Clicking delete shows a confirmation prompt; cancelling leaves the
  entry untouched; confirming removes it from the list permanently.
- Deleting a liked entry removes it as a style-pool influence on the next
  generated answer (per S-03's existing pool query).
- The "Historia" link on `/dashboard` navigates to the history page.

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

1. As a user with no fairy_responses yet, visit `/dashboard/history`;
   confirm the empty-state message and link back to `/dashboard`.
2. Ask 2-3 questions from `/dashboard`, liking one of them.
3. Visit `/dashboard/history`; confirm all entries appear, most recent
   first, with correct liked state.
4. Toggle like on an unliked entry from the history page; confirm it
   updates and the page stays on `/dashboard/history`.
5. Click delete on an entry; confirm the browser confirmation prompt
   appears; cancel it and confirm the entry is still present.
6. Delete the same entry again, confirming this time; confirm it's
   removed from the list.
7. If the deleted entry was liked, ask a new question and confirm the
   deleted entry no longer influences the generated answer's tone (per
   S-03).
8. Confirm `/dashboard`'s nav row now includes a working "Historia" link.

## Performance Considerations

One additional query per history-page visit
(`.eq("user_id", ...).order("created_at desc")`, no `LIMIT`) — acceptable
given the PRD's small/low target scale and F-01's existing index. No
N+1 risk (one query for the whole list, not per-item).

## Migration Notes

None — reuses the existing `fairy_responses` schema unchanged.

## References

- Roadmap: `context/foundation/roadmap.md` (S-04, final slice of M-1)
- PRD: `context/foundation/prd.md` (FR-008, FR-009, FR-010)
- Prior implementation: `context/archive/2026-08-26-ask-fairy-personalized-answer/plan.md`
  (S-01, built `like.ts`, `AnswerCard.tsx`, the auth-guard + ownership-scoping pattern)
- Style pool this plan's deletes affect: `context/archive/2026-08-26-like-response-style-learning/plan.md` (S-03)
- Confirm-before-submit pattern precedent: `src/components/auth/AuthForm.tsx`, `src/components/dashboard/ProfileForm.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — delete route and like redirect extension

#### Automated

- [x] 1.1 Delete route exists and scopes to the user — c307595
- [x] 1.2 Delete route touches the right table — c307595
- [x] 1.3 Like route reads redirect_to — c307595
- [x] 1.4 Type checking passes — c307595
- [x] 1.5 Linting passes — c307595

#### Manual

- [x] 1.6 redirect_to allow-list reviewed — c307595

### Phase 2: Frontend — history page and navigation

#### Automated

- [x] 2.1 Files exist
- [x] 2.2 History page queries the right table
- [x] 2.3 Nav link present
- [x] 2.4 Type checking passes
- [x] 2.5 Linting passes

#### Manual

- [ ] 2.6 Empty state shows message and working link
- [ ] 2.7 History lists all entries, most recent first, correct liked state
- [ ] 2.8 Like/unlike from history stays on history page
- [ ] 2.9 Delete confirmation cancel/confirm both work correctly
- [ ] 2.10 Deleted liked entry no longer influences style pool
- [ ] 2.11 Historia nav link works
