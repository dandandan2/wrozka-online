# Edit Profile — Server-Side Validation and Save Feedback Implementation Plan

## Overview

Close the gap between S-01's "fill profile" form and FR-003's "edit
profile" requirement. The existing `/dashboard/profile` page and
`/api/profile/update.ts` route already function as an edit form (same
page, same UPDATE, pre-filled with current values) — this plan adds the
two things S-01 deliberately deferred: server-side validation matching
the client-side rules, and a visible confirmation after saving.

## Current State Analysis

- `src/pages/dashboard/profile.astro` reads the user's `profiles` row and
  renders `ProfileForm` pre-filled with `name`/`birth_date`/`about_me`.
- `src/components/dashboard/ProfileForm.tsx` client-side validates `name`
  non-empty and `birth_date` present and not in the future, then POSTs to
  `/api/profile/update`.
- `src/pages/api/profile/update.ts` currently validates only `about_me`'s
  500-char length server-side. It happily persists a `null`/empty `name`
  or a future `birth_date` if the client validation is bypassed (direct
  POST). This was flagged as an observation (not a blocking finding) in
  S-01's impl-review.
- On success, `update.ts` redirects to `/dashboard` with no confirmation
  that anything changed — fine for the first-time "fill" flow (the ask
  form appearing IS the confirmation), but silent and confusing for a
  repeat edit of an already-complete profile.
- `src/pages/dashboard.astro` already links to `/dashboard/profile` via
  an "Edytuj profil" link — no new entry point needed.
- `ServerError` (`src/components/auth/ServerError.tsx`) is the existing
  pattern for a dismissable-by-absence inline banner (renders `null` when
  its message prop is falsy); there's no equivalent "success" variant yet.

## Desired End State

Submitting the profile form with an empty name, or a birth date in the
future, is rejected server-side (not just client-side) with a visible
error, matching the existing `about_me` length-guard pattern. Submitting
valid data redirects back to `/dashboard/profile` and shows a visible
"Zapisano zmiany" confirmation above the form.

Verification: submit the form with valid data and see the confirmation;
bypass client validation (e.g. a raw POST) with an empty name or a future
birth date and confirm the server rejects it with a visible error instead
of silently persisting it.

### Key Discoveries:

- No new files needed — this plan only modifies the three files already
  built in S-01.
- The `about_me` length-guard in `update.ts` is the existing pattern to
  mirror for the new `name`/`birth_date` checks (same file, same
  redirect-with-`?error=` style).

## What We're NOT Doing

- No cancel/dirty-state handling or leave-without-saving warning — S-01
  explicitly deferred this, and this plan keeps that deferral; PRD/FR-003
  doesn't require it.
- No new entry points to the profile page — the existing "Edytuj profil"
  link on `/dashboard` is sufficient.
- No changes to `about_me`'s validation — its 500-char guard already
  exists and is untouched.
- No new database migration — no schema change is needed.
- No automated test framework — matches F-01/F-02/S-01 precedent.

## Implementation Approach

Two small phases: server-side validation first (independently verifiable
and lower-risk), then the save-success feedback (which also changes the
success redirect target from `/dashboard` to `/dashboard/profile`).

## Phase 1: Server-side profile validation

### Overview

Mirror the client-side `name`/`birth_date` checks in `update.ts`, matching
the existing `about_me` length-guard pattern.

### Changes Required:

#### 1. Validate name and birth_date server-side

**File**: `src/pages/api/profile/update.ts`

**Intent**: Reject an empty name or a future birth date before writing to
the database, the same way the existing code already rejects an
over-length `about_me`.

**Contract**: after reading `name`/`birthDate`/`aboutMe` from form data and
before the `about_me`-length check, add: if `name` is missing or empty
after trimming, redirect to
`/dashboard/profile?error=<encoded "Imię jest wymagane.">`. If
`birth_date` is missing, or parses to a date later than now, redirect to
`/dashboard/profile?error=<encoded "Data urodzenia jest wymagana i nie może być w przyszłości.">`.
These checks land before the existing `about_me` check, in the same
early-return style.

### Success Criteria:

#### Automated Verification:

- Guards present: `grep -q "Imię jest wymagane" src/pages/api/profile/update.ts && grep -q "nie może być w przyszłości" src/pages/api/profile/update.ts`
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Submitting the form normally (valid name + past birth date) still saves
  successfully.
- A direct POST to `/api/profile/update` with an empty `name` is rejected
  with a visible error on `/dashboard/profile`, and the stored profile is
  unchanged.
- A direct POST with a future `birth_date` is rejected the same way.

---

## Phase 2: Save-success feedback

### Overview

Confirm to the user that their edit was saved.

### Changes Required:

#### 1. Redirect to the profile page on success, with a success flag

**File**: `src/pages/api/profile/update.ts`

**Intent**: Change the success path so the user lands back on the form
they just edited, with visible confirmation, instead of being silently
bounced to `/dashboard`.

**Contract**: on a successful `profiles` update, redirect to
`/dashboard/profile?success=1` instead of `/dashboard`.

#### 2. Render the success confirmation

**File**: `src/pages/dashboard/profile.astro`, `src/components/dashboard/ProfileForm.tsx`

**Intent**: Show a visible "saved" banner when the page was reached via
the success redirect.

**Contract**: `profile.astro` reads
`Astro.url.searchParams.get("success")` and passes it to `ProfileForm` as
a new `successMessage?: string | null` prop (e.g. `"Zapisano zmiany."`
when the param is present, `null` otherwise). `ProfileForm` renders this
above `ServerError`, using the same visual treatment as `ServerError` but
in a green/success palette instead of red (a small inline conditional
block is sufficient — no new shared component needed for a single call
site).

### Success Criteria:

#### Automated Verification:

- Success redirect target updated: `grep -q "dashboard/profile?success=1" src/pages/api/profile/update.ts`
- Success prop wired: `grep -q "successMessage" src/components/dashboard/ProfileForm.tsx && grep -q "successMessage" src/pages/dashboard/profile.astro`
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Saving valid profile data shows the "Zapisano zmiany" confirmation on
  `/dashboard/profile`.
- Navigating to `/dashboard/profile` directly (no `success` param) shows
  no confirmation banner.
- The confirmation doesn't appear alongside an error (mutually exclusive
  by construction, since they're different redirect targets/params).

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human
that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- None — no test framework installed, matching F-01/F-02/S-01 precedent.

### Integration Tests:

- None automated. Manual testing steps below substitute.

### Manual Testing Steps:

1. Visit `/dashboard/profile` with an existing complete profile; confirm
   current values are pre-filled.
2. Edit the name and save; confirm redirect to `/dashboard/profile` with
   the "Zapisano zmiany" banner, and the new value persisted.
3. Attempt to bypass client validation with a direct POST (e.g. via
   browser devtools or curl) sending an empty `name`; confirm the server
   rejects it with a visible error and the profile is unchanged.
4. Same for a future `birth_date`.
5. Confirm the existing `about_me` 500-char guard still works unchanged.

## Performance Considerations

None — no new queries, no new external calls.

## Migration Notes

None — no schema change.

## References

- Roadmap: `context/foundation/roadmap.md` (S-02)
- PRD: `context/foundation/prd.md` (FR-003)
- Prior implementation: `context/archive/2026-08-26-ask-fairy-personalized-answer/plan.md` (S-01, built the profile form this plan extends)
- S-01 impl-review observation this closes: `context/archive/2026-08-26-ask-fairy-personalized-answer/reviews/impl-review.md`
- Existing error-banner pattern: `src/components/auth/ServerError.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Server-side profile validation

#### Automated

- [x] 1.1 Guards present — 5d51cf5
- [x] 1.2 Type checking passes — 5d51cf5
- [x] 1.3 Linting passes — 5d51cf5

#### Manual

- [x] 1.4 Normal valid submission still saves successfully — 5d51cf5
- [x] 1.5 Empty name rejected server-side — 5d51cf5
- [x] 1.6 Future birth_date rejected server-side — 5d51cf5

### Phase 2: Save-success feedback

#### Automated

- [x] 2.1 Success redirect target updated
- [x] 2.2 Success prop wired
- [x] 2.3 Type checking passes
- [x] 2.4 Linting passes

#### Manual

- [ ] 2.5 Save shows confirmation banner
- [ ] 2.6 No banner on direct visit without success param
- [ ] 2.7 Confirmation and error are mutually exclusive
