# Fairy Data Foundation — Plan Brief

> Full plan: `context/changes/fairy-data-foundation/plan.md`

## What & Why

Roadmap Foundation F-01: create the minimal data layer — a `profiles` table
and a `fairy_responses` table, both RLS-protected — so that later slices
(starting with S-01, the "ask fairy → personalized answer" north star) have
somewhere to persist user data. Without this, the app cannot store a single
profile field or a single generated answer.

## Starting Point

`supabase/` currently holds only `config.toml` — no migrations, no tables.
Auth already works via Supabase (`auth.users`, password-based today), but
nothing in `public` schema extends it. `src/lib/supabase.ts` already wires
the server client; this change touches no application code.

## Desired End State

Two tables live in the Supabase project: `profiles` (one row per user,
auto-created on signup) and `fairy_responses` (question/answer/liked, one
row per fairy session). RLS ensures a user can only ever see or modify their
own rows — verified by attempting cross-user access and confirming it's
denied.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Liked representation | Boolean column on `fairy_responses` | Simplest schema, trivial "top 10 liked" query, no like-history requirement in PRD | Plan |
| Delete model (FR-009) | Hard delete | Matches "removes it from the style pool too" with zero extra filtering logic | Plan |
| About-me limit | 500 chars, DB check constraint | Enough context for AI prompt, enforced at the DB layer per the NFR | Plan |
| Profile key | `profiles.id = auth.users.id` (1:1 PK+FK) | Standard Supabase pattern, trivial RLS, exactly one profile per user per PRD | Plan |
| Row creation | DB trigger on `auth.users` insert | Guarantees a profile row exists before any later slice needs to update it | Plan |
| Verification | SQL file + manual dashboard apply/check | No Supabase CLI/Docker installed locally; matches current repo reality | Plan |

## Scope

**In scope:**
- `profiles` table (name, birth_date, about_me with length check)
- `fairy_responses` table (question, answer, liked)
- RLS policies scoped to `auth.uid()` on both tables
- Auto-provisioning trigger on `auth.users`

**Out of scope:**
- Any UI or API route (S-01, S-02, S-04)
- Auth flow changes (F-02, separate change)
- AI/LLM response generation (S-01)
- Local Supabase CLI/Docker setup, automated RLS test scripts
- Soft delete, like-history table

## Architecture / Approach

Two additive SQL migration files under `supabase/migrations/`: one for
schema + trigger, one for RLS + policies. Applied directly to the hosted
Supabase project (CLI `db push` or dashboard SQL editor) — no local DB stack
in this environment.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema, trigger, indexes | `profiles` + `fairy_responses` tables, auto-provisioning trigger | Trigger `security definer` misconfiguration could silently fail to create profile rows |
| 2. RLS policies | Owner-only access enforced at the DB layer | A missing `WITH CHECK` clause could allow a user to write rows they don't own |
| 3. Apply and verify | Live schema in the real project, confirmed via dashboard + cross-user check | No automated CI check — relies on manual verification discipline |

**Prerequisites:** Access to the hosted Supabase project's SQL editor or a
linked Supabase CLI.
**Estimated effort:** ~1 session (single foundation change, no app code).

## Open Risks & Assumptions

- Assumes the hosted Supabase project referenced by `SUPABASE_URL`/`SUPABASE_KEY`
  is reachable and the user (or team) has SQL-editor/CLI access to apply
  migrations manually — no CI migration pipeline exists yet.
- The 500-char about-me limit is a first guess; PRD itself flags this as
  tunable after real AI-cost testing in S-01.

## Success Criteria (Summary)

- `profiles` and `fairy_responses` exist in the hosted project with RLS
  enabled and owner-scoped policies.
- A new signup automatically gets a `profiles` row with no app code
  involved.
- Cross-user read/write attempts are verified to fail.
