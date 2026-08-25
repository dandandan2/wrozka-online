# Fairy Data Foundation Implementation Plan

## Overview

Create the minimal data foundation for Wróżbita Online: a `profiles` table
(one row per Supabase auth user, auto-created via trigger) and a
`fairy_responses` table (question/answer/liked), both protected by Row Level
Security so a user can only ever see or modify their own rows. This is
roadmap Foundation **F-01** — no UI, no API routes, no auth changes (those
are F-02 and S-01).

## Current State Analysis

- `supabase/` contains only `config.toml` — zero migrations exist, this is a
  clean slate.
- `src/lib/supabase.ts` already wires a server-side Supabase client via
  `@supabase/ssr`; auth currently uses Supabase's built-in `auth.users` with
  password sign-in (`src/pages/api/auth/{signup,signin,signout}.ts`) — no
  app-level user table exists to extend.
- No Supabase CLI or local Docker stack is installed in this environment
  (`supabase --version` not found). Migrations will be authored as plain SQL
  files under `supabase/migrations/` and applied to the real hosted Supabase
  project via the CLI or dashboard SQL editor, not via a local `supabase
  start` stack.
- `context/foundation/prd.md` requires: profile fields (name, birth date,
  "o sobie"/about-me with an enforced length limit), a like mechanism on
  fairy responses feeding a "last 10 liked" style pool (FR-006, FR-007), and
  that deleting a history entry also removes it from that style pool
  (FR-009) — satisfied for free by a hard delete.

## Desired End State

Two tables exist in the Supabase project's `public` schema — `profiles` and
`fairy_responses` — both with RLS enabled and policies restricting all
access to `auth.uid()`. A trigger on `auth.users` guarantees every signed-up
user has exactly one `profiles` row from the moment their account is
created, so downstream slices (S-01+) can always `UPDATE` and never need to
handle a missing-profile case.

Verification: query the tables as two different authenticated users (or via
the Supabase dashboard's "RLS policies" test) and confirm neither can read
or write the other's rows.

### Key Discoveries:

- No existing `profiles`/user-data table to migrate or reconcile —
  greenfield schema.
- `src/lib/supabase.ts:5-8` returns `null` when env vars are unset; this
  foundation doesn't touch that file, so no code changes are needed in this
  change.

## What We're NOT Doing

- No UI or API routes for reading/writing profile or fairy-response data
  (that's S-01, S-02, S-04).
- No auth flow changes (magic-link login is F-02, a separate change).
- No AI/LLM integration or response-generation logic (S-01).
- No local Supabase CLI/Docker setup or automated RLS test scripts — out of
  scope for a 2-table foundation on a solo, after-hours timeline.
- No `deleted_at`/soft-delete columns — deletion is a hard `DELETE`.
- No like-history table or `liked_at` timestamp — `liked` is a plain boolean.

## Implementation Approach

Two SQL migration files (schema+trigger, then RLS+policies) checked into
`supabase/migrations/`, applied directly to the project's hosted Supabase
instance. Verification is static (SQL review) plus manual confirmation via
the Supabase dashboard, matching how this repo has no CI migration step or
local DB stack today.

## Phase 1: Schema, trigger, and indexes

### Overview

Create the two tables and the auto-provisioning trigger.

### Changes Required:

#### 1. `profiles` table

**File**: `supabase/migrations/20260825120000_fairy_data_foundation.sql`

**Intent**: One row per authenticated user holding the profile fields the
PRD requires (name, birth date, about-me), auto-created so it always exists
by the time any later slice needs to update it.

**Contract**:
- `profiles.id uuid primary key references auth.users(id) on delete cascade`
- `name text` (nullable — empty at auto-creation, filled in by S-01/S-02)
- `birth_date date` (nullable)
- `about_me text` (nullable), with a check constraint enforcing
  `char_length(about_me) <= 500`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

#### 2. `fairy_responses` table

**File**: same migration file as above

**Intent**: One row per question/answer exchange, carrying the `liked` flag
that both drives session history (FR-008) and the style-pool query
(FR-007).

**Contract**:
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `question text not null`
- `answer text not null`
- `liked boolean not null default false`
- `created_at timestamptz not null default now()`
- Index `(user_id, liked, created_at desc)` to serve both the full history
  list and the "last 10 liked" style-pool query efficiently.

#### 3. Auto-provisioning trigger

**File**: same migration file as above

**Intent**: Guarantee a `profiles` row exists the instant a user signs up,
so no downstream slice needs to branch on "profile row missing."

**Contract**: a `security definer` function `public.handle_new_user()` that
inserts `(id) values (new.id)` into `public.profiles`, wired via `after
insert on auth.users for each row execute function
public.handle_new_user()`. Must set `search_path = public` on the function
(standard Supabase pattern to avoid search-path hijacking in
`security definer` functions).

### Success Criteria:

#### Automated Verification:

- Migration file exists: `test -f supabase/migrations/20260825120000_fairy_data_foundation.sql`
- SQL defines both tables: `grep -q "create table.*profiles" supabase/migrations/20260825120000_fairy_data_foundation.sql && grep -q "create table.*fairy_responses" supabase/migrations/20260825120000_fairy_data_foundation.sql`
- Trigger function is `security definer`: `grep -q "security definer" supabase/migrations/20260825120000_fairy_data_foundation.sql`

#### Manual Verification:

- SQL reviewed for correctness (column types, constraints, FK cascade
  behavior) before applying.

---

## Phase 2: Row Level Security policies

### Overview

Lock both tables down to owner-only access.

### Changes Required:

#### 1. Enable and scope RLS

**File**: `supabase/migrations/20260825120100_fairy_data_foundation_rls.sql`

**Intent**: Enforce the PRD's privacy guardrail — profile and response data
must be readable/writable only by its owner, at the database layer (not
just app-layer checks).

**Contract**:
- `alter table public.profiles enable row level security;`
- `alter table public.fairy_responses enable row level security;`
- `profiles`: `select` and `update` policies, each `using (auth.uid() = id)`
  (update also `with check (auth.uid() = id)`). No `insert`/`delete`
  policies — row creation is trigger-owned, and no requirement exists yet
  for a user to delete their own profile.
- `fairy_responses`: `select`, `insert`, `update`, and `delete` policies,
  each scoped to `auth.uid() = user_id` (insert/update also `with check
  (auth.uid() = user_id)`). `update` is required so a later slice can toggle
  `liked` without a fresh insert; `delete` is required for FR-009.

### Success Criteria:

#### Automated Verification:

- Migration file exists: `test -f supabase/migrations/20260825120100_fairy_data_foundation_rls.sql`
- RLS enabled on both tables: `grep -c "enable row level security" supabase/migrations/20260825120100_fairy_data_foundation_rls.sql` returns `2`
- Policies scoped to `auth.uid()`: `grep -c "auth.uid()" supabase/migrations/20260825120100_fairy_data_foundation_rls.sql` returns at least `6`

#### Manual Verification:

- SQL reviewed to confirm no policy is missing a `USING`/`WITH CHECK` clause
  and none accidentally grants cross-user access.

---

## Phase 3: Apply and verify against the real project

### Overview

Push both migrations to the hosted Supabase project and confirm the end
state matches the plan.

### Changes Required:

#### 1. Apply migrations

**File**: n/a (operational step, no further file changes)

**Intent**: Get the schema live in the project referenced by
`SUPABASE_URL`/`SUPABASE_KEY` so downstream changes (F-02, S-01) have
somewhere to read/write.

**Contract**: apply via `supabase db push` (if the CLI is installed and
linked) or by pasting both migration files' SQL into the Supabase
dashboard's SQL editor, in order (schema file first, RLS file second).

### Success Criteria:

#### Automated Verification:

- N/A — no CLI/local DB stack available in this environment; applying and
  confirming is a manual step.

#### Manual Verification:

- Supabase dashboard Table Editor shows `profiles` and `fairy_responses`
  with the expected columns.
- Supabase dashboard Authentication → a test signup produces a matching
  `profiles` row automatically (trigger fires).
- Supabase dashboard Database → Policies shows RLS enabled with the
  expected policies on both tables.
- Using two different test accounts (or the dashboard's policy simulator),
  confirm neither can read or write the other's `profiles`/`fairy_responses`
  rows.

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human that
the manual testing (dashboard inspection, cross-user RLS check) was
successful.

---

## Testing Strategy

### Unit Tests:

- None — this change has no application code, only SQL DDL.

### Integration Tests:

- None automated (no local Supabase stack). Manual cross-user RLS check in
  Phase 3 substitutes.

### Manual Testing Steps:

1. Apply both migrations to the hosted project.
2. Sign up a test user via the existing `/auth/signup` flow; confirm a
   `profiles` row with matching `id` appears automatically.
3. As that user (via `supabase-js` with their session, or the dashboard's
   "impersonate" / policy test tool), attempt to `select` another user's
   `profiles`/`fairy_responses` row and confirm it returns zero rows.
4. Attempt to `update` another user's row and confirm it's rejected/affects
   zero rows.

## Performance Considerations

The `(user_id, liked, created_at desc)` index on `fairy_responses` keeps
both the history list and the "last 10 liked" style-pool query index-backed
as data grows; no other performance work applies at this schema-only stage.

## Migration Notes

Greenfield — no existing data to migrate. Both migration files are
additive-only (no destructive statements), so no rollback plan beyond
`DROP TABLE` is needed if this foundation needs to be reworked before any
downstream slice depends on it.

## References

- Roadmap: `context/foundation/roadmap.md` (Foundation F-01)
- PRD: `context/foundation/prd.md` (NFR privacy guardrail, FR-002, FR-006,
  FR-007, FR-009)
- Existing Supabase client: `src/lib/supabase.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, trigger, and indexes

#### Automated

- [x] 1.1 Migration file exists
- [x] 1.2 SQL defines both tables
- [x] 1.3 Trigger function is security definer

#### Manual

- [x] 1.4 SQL reviewed for correctness

### Phase 2: Row Level Security policies

#### Automated

- [ ] 2.1 Migration file exists
- [ ] 2.2 RLS enabled on both tables
- [ ] 2.3 Policies scoped to auth.uid()

#### Manual

- [ ] 2.4 SQL reviewed for policy completeness

### Phase 3: Apply and verify against the real project

#### Manual

- [ ] 3.1 Dashboard shows both tables with expected columns
- [ ] 3.2 Test signup auto-creates a profiles row
- [ ] 3.3 Dashboard shows RLS enabled with expected policies
- [ ] 3.4 Cross-user access confirmed blocked
