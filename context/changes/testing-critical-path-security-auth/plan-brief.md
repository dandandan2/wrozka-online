# Critical-Path Security & Auth Testing — Plan Brief

> Full plan: `context/changes/testing-critical-path-security-auth/plan.md`
> Research: `context/changes/testing-critical-path-security-auth/research.md`

## What & Why

Bootstrap Vitest for the first time and write tests proving Rollout Phase 1
of the test-plan holds: users can't reach each other's profile/history data
(#1), magic-link/kod login is correct under expiry/reuse/cross-account cases
(#2), and repeated login requests to one email are throttled (#6).

**Revision**: this version replaces the original real-integration design for
all three risks with hermetic (mocked-Supabase) wiring tests, after
discovering this implementation environment has no Docker and cannot run
`supabase start`. The whole suite is now hermetic and runs identically in
any environment.

## Starting Point

No test runner or tests exist today. Research found the app already does
the right thing everywhere it matters: RLS is enabled and every query also
adds an explicit `user_id` filter, and auth/throttling are thin wrappers
around Supabase Auth with zero custom logic. Vitest is already installed
from an earlier implementation attempt (before this revision) that stalled
on the Docker constraint.

## Desired End State

A `npm test` suite that runs in **any** environment (Docker or not, zero
external setup) and proves: every API route filters strictly on the
session-derived user id (not real RLS enforcement — that stays documented,
not automated, until a Docker-capable environment runs it); each auth
endpoint calls Supabase Auth correctly (not that Supabase enforces
expiry/reuse — that's Supabase's own guarantee); and `request-link` handles
a simulated rate-limit error cleanly (not that a real limit is actually
configured anywhere — also documented, not automated).

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Docker unavailable in this sandbox | Confirmed via `docker info` failure + blocked `supabase` CLI postinstall | Blocks any test needing real Postgres/RLS or live Supabase Auth | Plan (discovered mid-implementation) |
| Risk #1 test layer | Hermetic: mock Supabase client, assert `.eq("user_id", locals.user.id)` on every API route | Real RLS proof needs Docker; a written-but-never-run test invites false confidence | Plan (Q&A) |
| Risk #2 test layer | Hermetic: mock Supabase Auth SDK calls, assert correct method/args/branching | Real OTP-enforcement proof needs Docker; same reasoning as #1 | Plan (Q&A) |
| Risk #6 test layer | Hermetic: mock a rate-limit error response, assert clean handling | Same portability reasoning as #1/#2, decided after discussing the tradeoff (never proves a real limit exists anywhere) | Plan (Q&A) |
| `profiles` INSERT/DELETE gap | Documented only, not automated this phase | It's an RLS-enforcement fact, same category demoted for #1 | Plan (Q&A) |
| `.astro` page tests | Out of scope | Lower risk (read-only, already `user_id`-filtered) and harder to unit-test in isolation | Plan (Q&A) |
| `test-plan.md` note | Add a short §4/§8 note about the Docker constraint | Saves later rollout phases (2-4) from rediscovering this | Plan (Q&A) |

## Scope

**In scope:**
- Vitest bootstrap (config, env aliasing, `test` script — mostly done)
- Hermetic ownership-filter tests for `src/pages/api/fairy/*` and `profile/update.ts` (Risk #1)
- Hermetic Supabase-Auth-SDK-call tests for the three auth endpoints (Risk #2)
- Full `auth-errors.ts` mapping test, extended for rate-limit codes (Risks #2/#6)
- Hermetic simulated-rate-limit-error test (Risk #6)
- `test-plan.md` cookbook update, environment-constraint note, Phase 1 status flip

**Out of scope:**
- Real RLS/DB-level proof, `profiles` insert/delete DB-level proof, real Supabase-Auth-enforcement proof, real rate-limit-trigger proof — all documented as gaps, not automated, pending a Docker-capable environment
- `.astro` page-level tests
- Any application/production code changes
- CI wiring, Playwright/e2e, Risks #4/#5/#7 (other test-plan phases)

## Architecture / Approach

Five phases: environment setup → Risk #1 (hermetic) → Risk #2 (hermetic) →
Risk #6 (hermetic, reusing Phase 3's mock) → cookbook + status sync. A single
reusable `vi.mock("@/lib/supabase")` pattern (via helpers in
`tests/helpers/`) underlies all three risk-bearing phases' mocking, so the
whole suite runs identically everywhere with zero external setup.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Vitest bootstrap | Config, env aliasing (dummy-by-default), smoke test | None significant — mostly already done |
| 2. Risk #1 hermetic | Ownership-filter wiring tests + anon-key check | Tests could become vacuous mirror tests if not designed to fail on a broken filter (mitigated by a manual sanity check) |
| 3. Risk #2 hermetic | Auth-SDK-call wiring tests + full error-mapping | Same vacuous-test risk as Phase 2 |
| 4. Risk #6 hermetic | Simulated rate-limit-error handling test | Never proves a real limit is configured anywhere — documented, not silently implied as covered |
| 5. Cookbook + wrap-up | `test-plan.md` §6 + §4/§8 note, Phase 1 status → complete | None significant |

**Prerequisites:** none — the full suite runs with zero external setup in
any environment.
**Estimated effort:** ~3-4 sessions across 5 phases.

## Open Risks & Assumptions

- **Real RLS enforcement, Supabase Auth's expiry/reuse/cross-account
  handling, and Supabase's real rate limits all remain unverified by
  automated tests in this phase.** This is the most significant residual gap
  versus the original plan — it should be closed by adding real integration
  tests (2-user RLS, real OTP lifecycle, real rate-limit hammering — the
  designs this plan's revision history superseded) the first time a
  Docker-capable environment is available for this project.
- Hermetic wiring tests only prove the app *calls* the right thing with the
  right arguments — they cannot catch a case where the SDK itself behaves
  unexpectedly.
- This plan assumes the local dev environment's `SUPABASE_KEY` is the anon
  key; the JWT-role test only proves whatever environment actually runs the
  suite, not production.

## Success Criteria (Summary)

- Running `npm test` anywhere (no Docker or setup required) proves
  ownership-filter wiring, auth-SDK-call correctness, and clean rate-limit
  error handling all pass — with no application code changes required.
- `test-plan.md` §3 Phase 1 reads `complete`, §6.1/§6.2/§6.4 point to
  concrete example test files, and §4/§8 documents the Docker constraint for
  future phases.
