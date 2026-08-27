# Critical-Path Security & Auth Testing Implementation Plan

## Overview

Bootstrap Vitest for this project for the first time, then write tests
proving the three risks assigned to Rollout Phase 1 of
`context/foundation/test-plan.md` hold against the *existing* code:

- **#1** — a logged-in user can never read or mutate another user's `profiles`
  or `fairy_responses` rows.
- **#2** — a valid magic-link/kod login issues a session for the right user,
  and expired/reused/foreign codes are rejected.
- **#6** — repeated magic-link/kod requests to the same email are throttled.

Research (`context/changes/testing-critical-path-security-auth/research.md`)
found the app already enforces ownership correctly everywhere (RLS + explicit
`user_id` filters at every query site, no query relying on RLS alone) and
that auth/throttling are thin wrappers around Supabase Auth's own behavior
(no custom OTP/rate-limit logic exists in the app). This plan is therefore
**verification, not remediation** — no application source code is expected
to change; only test infrastructure and test files are added.

**Revision note (this version supersedes the original Phases 2-4 design):**
The environment this plan is implemented in has no Docker, so `supabase
start` cannot run here — every test that needs a live Postgres+RLS engine or
a live Supabase Auth/Inbucket instance cannot be executed or verified in this
sandbox. After surfacing this during Phase 1 of implementation, the response
per risk (each confirmed explicitly with the user, trading signal for
portability) is:

- **#1**: real RLS-level proof is dropped from this phase's automated scope.
  Replaced with **hermetic wiring tests** — mock the Supabase client and
  assert every `profiles`/`fairy_responses` query in `src/pages/api/**`
  filters on the session-derived `locals.user.id`, never a client-supplied
  value. This proves the app *asks* for ownership-scoped data; it does
  **not** prove Postgres *enforces* it — that remains a documented,
  code-inspection-only fact (see research.md) until a Docker-capable
  environment runs the real integration test.
- **#2**: same trade — **hermetic wiring tests** assert each auth endpoint
  calls the correct Supabase Auth SDK method with the correct arguments and
  branches correctly on success/error. Real expiry/reuse/cross-account
  rejection is Supabase Auth's own behavior and is **not** re-verified here.
- **#6**: also demoted to **hermetic** — mock the Supabase client so that
  after a configurable number of calls it returns the
  `over_email_send_rate_limit` error, and assert the app handles that
  response cleanly (no crash, correct redirect/message via
  `auth-errors.ts`). This proves the app *reacts correctly* to a rate-limit
  error; it does **not** prove Supabase's real limit is actually configured
  or enabled anywhere (local `config.toml`, or a production project's
  dashboard) — same category of gap as #1's RLS enforcement and #2's
  Supabase-Auth behavior.

This is a real, acknowledged reduction in what Phases 2-4 can prove
automatically in this environment. It is not a silent downgrade — every gap
is called out below and in the Open Risks section, precisely so a future
Docker-capable run can restore full integration coverage without
rediscovering why it was missing.

## Current State Analysis

- No test runner, test config, or test files exist anywhere in the repo
  (`research.md` §"Bootstrap facts").
- Every `profiles`/`fairy_responses` query site pairs the RLS policy
  (`supabase/migrations/20260825120100_fairy_data_foundation_rls.sql`) with an
  explicit `.eq("user_id", ...)`/`.eq("id", ...)` filter derived from
  `context.locals.user.id` (`src/middleware.ts:10-13`) — never from client
  input.
- `profiles` has RLS policies for SELECT and UPDATE only; INSERT happens via
  a `SECURITY DEFINER` trigger (`handle_new_user`), and there is no INSERT or
  DELETE policy at all. This gap is real but, per the revision above, is no
  longer covered by an automated test in this phase (it is inherently an
  RLS-enforcement fact, the same category demoted for Risk #1).
- Auth is three thin Supabase SDK calls: `signInWithOtp`
  (`src/pages/api/auth/request-link.ts:17-23`), `exchangeCodeForSession`
  (`src/pages/api/auth/callback.ts:17`), `verifyOtp`
  (`src/pages/api/auth/verify-code.ts:24`). No custom expiry/reuse/pairing
  logic exists in the app.
- No application-level rate limiting exists anywhere. Local Supabase config
  (`supabase/config.toml`) sets `email_sent = 2`/hour, `max_frequency = "1s"`,
  `otp_expiry = 3600` under `[auth.rate_limit]`/`[auth.email]` — relevant
  only as documentation of what a future real integration test (run in a
  Docker-capable environment) would exercise; Phase 4 in this plan no longer
  attempts to trigger it live.
- Stack: Astro 6.3.1, SSR (`output: "server"`), Cloudflare adapter, Vite
  pinned via override to `^7.3.2`, TS strict (`astro/tsconfigs/strict`),
  `@/*` → `./src/*` path alias, three secrets declared via Astro's
  `astro:env/server` env schema (`astro.config.mjs:17-23`).
- **This sandbox has no Docker installed and the `supabase` npm
  devDependency's postinstall (which downloads its platform binary) is
  blocked by npm's script allowlist** — confirmed during implementation:
  `docker info` fails, `npx supabase --version` fails to resolve a binary.
  `supabase start` cannot run here under any configuration.
- CI (`.github/workflows/ci.yml`) runs lint + build only — no test step.
  Wiring CI is explicitly out of scope (test-plan.md §3 Phase 4).
- Vitest `^4.1.11` is already installed as a devDependency and `test`/
  `test:watch` scripts already added to `package.json` (done during the
  aborted first implementation attempt, before this revision) — this work
  carries forward unchanged, since Vitest itself is unaffected by the
  hermetic/real-test split.

## Desired End State

A working Vitest suite (`npm test`) runs in this sandbox (and any other,
Docker or not) and proves:

1. Every `profiles`/`fairy_responses`-touching API route handler in
   `src/pages/api/**` filters strictly on `locals.user.id`, never a
   client-supplied id (hermetic).
2. `SUPABASE_KEY` (whatever environment the suite runs against) decodes to a
   JWT with `role: "anon"`, not `service_role` (hermetic, unaffected by the
   Docker constraint).
3. Each auth endpoint (`request-link`, `verify-code`, `callback`) calls the
   correct Supabase Auth SDK method with the correct arguments and branches
   correctly on success vs. error (hermetic).
4. The app's rate-limit and auth error-code mapping (`src/lib/auth-errors.ts`)
   produces the correct user-facing message for every known Supabase error
   code (hermetic).
5. `request-link` handles a simulated `over_email_send_rate_limit` response
   from Supabase cleanly — correct redirect, no crash, no partial state
   (hermetic; does not prove a real limit is configured anywhere).

`context/foundation/test-plan.md` §6.1, §6.2, and §6.4 are filled in with the
patterns established here, §4 or §8 gets a short note about this
environment's Docker constraint (for later rollout phases' benefit), and the
Phase 1 row in §3 moves to `complete`.

### Key Discoveries:

- `src/lib/supabase.ts:5-24` is the single Supabase client factory used
  everywhere — mocking this one module (via `vi.mock("@/lib/supabase")`)
  is sufficient to intercept every query/auth call the app makes; no need to
  mock `@supabase/ssr` directly.
- API route handlers (`src/pages/api/**/*.ts`) export plain async functions
  (`POST`, `GET`) taking an `APIContext`-shaped argument — these can be
  imported and called directly in a unit test with a hand-built fake context
  (`{ request, cookies, locals: { user } }`), no Astro dev server needed.
- `.astro` page files (`dashboard.astro`, `dashboard/history.astro`,
  `dashboard/profile.astro`) are harder to unit-test in isolation (they mix
  server-side data fetching with rendering) and were already lower-risk read
  paths per research — they are out of this phase's hermetic-test scope; see
  What We're NOT Doing.
- `astro.config.mjs:17-23` declares `SUPABASE_URL`/`SUPABASE_KEY`/
  `OPENROUTER_API_KEY` via `astro:env/server`, a Vite virtual module Vitest
  cannot resolve without an explicit alias.
- Phase 4's rate-limit case reuses Phase 3's `mock-supabase-auth.ts` helper —
  `signInWithOtp` can be configured to return `{ error: { code:
  "over_email_send_rate_limit" } }` on a chosen call, so no new mocking
  primitive is needed beyond what Phase 3 already builds.

## What We're NOT Doing

- No production/application code changes (no new rate limiter, no new RLS
  policies, no refactors) — this phase only adds tests and test
  infrastructure. If a test reveals a real gap, the plan stops and reports it
  rather than silently patching `src/`.
- **No real RLS-level proof for Risk #1 in this phase** (revised down from
  the original plan) — the DB-level "does Postgres actually reject
  cross-user access" question, and the `profiles` INSERT/DELETE policy gap,
  remain documented in research.md as code-inspection findings only. Running
  the real two-user integration test originally designed for this requires a
  Docker-capable environment; it is not written in this phase because a
  written-but-never-run test invites false confidence.
- **No real Supabase-Auth-behavior proof for Risk #2 in this phase**
  (revised down) — expiry, reuse, and cross-account rejection are Supabase
  Auth's own guarantees; this phase proves the app *calls* the SDK
  correctly, not that Supabase *enforces* correctly.
- **No real rate-limit-trigger proof for Risk #6 in this phase** (revised
  down from a real-test-with-skip-gate design) — whether Supabase's
  `email_sent`/`max_frequency` limits are actually configured and enabled
  anywhere (local `config.toml`, or a production project's dashboard) is not
  automated here; only the app's *reaction* to that error code is tested.
- No `.astro` page-level hermetic tests (read-only profile/history/dashboard
  pages) — lower risk per research (they only read data via the same
  `user_id`-filtered pattern already covered on the write side) and
  meaningfully harder to unit test in isolation; not worth the infra cost in
  this phase.
- No CI wiring (`.github/workflows/ci.yml` stays lint+build-only) — that is
  test-plan.md §3 Phase 4 ("Quality-gates wiring"), a separate rollout phase.
- No e2e/Playwright setup.
- No `about_me` server-side length test — that's Risk #7, assigned to
  test-plan.md §3 Phase 2, not this phase.
- No test for Risk #4 (delete/style-pool) or #5 (AI-provider failure) — both
  assigned to Phase 2.
- No change to `supabase/config.toml` rate-limit values.
- No attempt to verify production's actual `SUPABASE_KEY` type or production
  Supabase rate-limit dashboard settings.
- No attempt to install Docker or work around the sandbox's blocked
  `supabase` CLI postinstall — the constraint is treated as a fact of this
  environment, not a problem to solve within this test-writing phase.

## Implementation Approach

Five phases: environment setup → Risk #1 (hermetic wiring tests) → Risk #2
(hermetic wiring tests) → Risk #6 (hermetic wiring test, reusing Phase 3's
mock) → cookbook + status sync. All four risk-bearing phases share the same
hermetic-mocking foundation, so the whole suite runs identically in any
environment, Docker or not. All phases route to `/10x-implement` — none
qualify for `/10x-tdd` since no new application behavior is being built.

## Critical Implementation Details

**Hermetic tests must not become mirror-of-implementation tests.** The
oracle for "which value should the filter use" is `locals.user.id` (the
session-derived identity from `middleware.ts`), not "whatever value the
handler happens to pass" — assertions must check that the filter argument
*equals the test's independently-constructed session user id*, and must
include at least one case where a client-supplied id (e.g. `like.ts`'s form
`id` field) differs from another real user's id, to prove the code doesn't
accidentally use the wrong source. Do not write an assertion that simply
re-executes the same `.eq(...)` call the source code makes and checks they
match — that proves nothing.

**Test-only admin/mocking boundary**: all `vi.mock("@/lib/supabase")` calls
and fake Supabase client/auth objects live inside `tests/`, never inside
`src/` — this preserves the finding that `src/` has exactly one, real,
production-shaped Supabase client factory.

## Phase 1: Vitest Bootstrap

### Overview

Get a first test running at all — no risk-specific assertions yet, just the
scaffolding every later phase depends on. (Vitest itself and the `test`/
`test:watch` scripts are already installed/added from the prior attempt;
this phase's remaining work is the config, aliasing, and smoke test.)

### Changes Required:

#### 1. Test runner dependency and script (already done)

**File**: `package.json`

**Intent**: Vitest `^4.1.11` devDependency and `"test": "vitest run"` /
`"test:watch": "vitest"` scripts are already present from the prior
implementation attempt. No further change needed here — confirm they're
still intact.

**Contract**: N/A — verification only.

#### 2. Vitest configuration

**File**: `vitest.config.ts` (new)

**Intent**: Configure module resolution so tests can import from `src/`
exactly like the app does, and so the `astro:env/server` virtual module
resolves to a controllable test double instead of failing to resolve.

**Contract**: Must alias `@/*` to `./src/*` (matching `tsconfig.json:8-11`)
and alias `astro:env/server` to the new test-double module from Change 3
below. Must load `.env.test` so the double's `process.env` reads succeed.

#### 3. `astro:env/server` test double

**File**: `tests/setup/astro-env-server.ts` (new)

**Intent**: Provide the same named exports the real `astro:env/server`
virtual module provides (`SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY`),
sourced from `process.env`, so `.env.test` alone controls their values —
no code change needed in `src/`.

**Contract**: Export names/shapes must exactly match what
`astro.config.mjs:17-23`'s env schema produces.

#### 4. Environment files for tests

**File**: `.env.test` (new, gitignored) and `.env.test.example` (new,
committed)

**Intent**: Default to dummy values that work for every hermetic test
(Phases 2, 3, and the hermetic half of Phase 4) with no live Supabase
needed. `.env.test.example` documents that filling in a real local
`supabase start` URL/anon key additionally unlocks Phase 4's real
rate-limit test; without it, that one test simply skips.

**Contract**: `.env.test` added to `.gitignore`. `.env.test.example`
documents `SUPABASE_URL` (dummy default e.g. `http://127.0.0.1:54321`),
`SUPABASE_KEY` (a syntactically-valid-but-fake JWT string so the Phase 2
anon-role test has something realistic to decode in the dummy case, or
clearly marked as needing a real value to be meaningful), and
`OPENROUTER_API_KEY` (dummy, unused by this phase's tests).

#### 5. Smoke test

**File**: `tests/setup.smoke.test.ts` (new)

**Intent**: One trivial test proving the whole toolchain works: a `@/*`
import and an import chain that touches `astro:env/server` via
`src/lib/supabase.ts`, before any risk-specific test is written.

**Contract**: Must exercise both aliases configured in Change 2.

### Success Criteria:

#### Automated Verification:

- `npm test` runs and the smoke test passes
- `npm run astro check` (or the project's existing typecheck command) passes
  with the new files included
- `npm run lint` passes on the new files

#### Manual Verification:

- Reviewer confirms `.env.test.example`'s documented dummy values are
  sufficient to run the full suite (minus Phase 4's real test) with zero
  external setup

---

## Phase 2: Risk #1 — Data-Isolation Wiring Tests (Hermetic)

### Overview

Prove every profiles/fairy_responses-touching API route handler filters
strictly on the session-derived user id, never a client-supplied value.
Add the anon-vs-service-role key check. **Does not** prove RLS itself
rejects cross-user access at the database level (see Overview's revision
note and What We're NOT Doing).

### Changes Required:

#### 1. Supabase client mock helper

**File**: `tests/helpers/mock-supabase-client.ts` (new)

**Intent**: A reusable fake chainable query builder (`.from().select().eq()
.order().limit().single()` etc., each call recorded, non-terminal methods
return `this`, terminal awaited calls resolve to a configurable `{ data,
error }`) plus a factory to inject it in place of `src/lib/supabase.ts`'s
`createClient` via `vi.mock("@/lib/supabase")`.

**Contract**: Exposes enough of the Supabase-JS query-builder surface to
cover every call shape used in `ask.ts`, `like.ts`, `delete.ts`, and
`profile/update.ts` (per research.md's query-site table), and records the
full call chain (method name + arguments) per invocation so tests can
assert on it.

#### 2. API route handler wiring tests

**File**: `tests/unit/api-fairy-ownership.test.ts` (new) and
`tests/unit/api-profile-ownership.test.ts` (new)

**Intent**: For `src/pages/api/fairy/ask.ts`, `like.ts`, `delete.ts`, and
`src/pages/api/profile/update.ts`, call the exported handler directly with a
fake `APIContext` (`locals.user.id` set to a fixed test id, plus a
request body containing a *different* id where the endpoint accepts a
client-supplied resource id) and assert the mocked client's recorded calls
filter on the fixed test `locals.user.id`, never the request-supplied
value.

**Contract**: Each test constructs `locals.user.id` and a request body id
that are deliberately different values, then asserts the recorded `.eq(...)`
arguments use `locals.user.id`. For `profile/update.ts`, additionally assert
the mock's `insert`/`delete` methods on the `profiles` table are never
invoked by this handler (a scoped, app-level version of the negative check —
see What We're NOT Doing for what this does *not* prove).

#### 3. Anon-key environment check

**File**: `tests/unit/supabase-key-role.test.ts` (new)

**Intent**: Decode the `SUPABASE_KEY` the current test run is using (via the
`astro:env/server` test double) as a JWT and assert its `role` claim is
`"anon"`.

**Contract**: Pure base64/JSON decode of the JWT payload segment — assert
`payload.role === "anon"`. Unaffected by the Docker constraint (no network
needed); runs in every environment including this one.

### Success Criteria:

#### Automated Verification:

- `npm test -- api-fairy-ownership` passes: `ask.ts`/`like.ts`/`delete.ts`
  filter every query on `locals.user.id`, never a request-supplied id
- `npm test -- api-profile-ownership` passes: `profile/update.ts` filters
  on `locals.user.id` and never calls insert/delete on `profiles`
- `npm test -- supabase-key-role` passes: configured `SUPABASE_KEY` decodes
  to `role: "anon"`
- `npm run astro check` and `npm run lint` pass

#### Manual Verification:

- Reviewer confirms the mock helper's recorded-call assertions actually
  fail if a filter is deliberately changed to use the wrong id (a quick
  local sanity check: temporarily swap `user.id` for the request id in one
  handler, confirm the test catches it, then revert)

---

## Phase 3: Risk #2 — Magic-Link/Kod Auth Flow Wiring Tests (Hermetic)

### Overview

Prove each auth endpoint calls the correct Supabase Auth SDK method with the
correct arguments and branches correctly on success/error. **Does not**
prove Supabase Auth actually enforces expiry/reuse/cross-account rejection
(see Overview's revision note).

### Changes Required:

#### 1. Supabase Auth mock helper

**File**: `tests/helpers/mock-supabase-auth.ts` (new)

**Intent**: A fake `auth` object with configurable spies for
`signInWithOtp`, `verifyOtp`, `exchangeCodeForSession`, `signOut`, each
returning a configurable `{ data, error }`, injected via the same
`vi.mock("@/lib/supabase")` pattern as Phase 2.

**Contract**: Spy call arguments must be inspectable per-test so assertions
can check exact call shape (e.g. `signInWithOtp` called with
`{ email, options: { emailRedirectTo, shouldCreateUser: true } }`).

#### 2. Auth endpoint wiring tests

**File**: `tests/unit/auth-request-link.test.ts`,
`tests/unit/auth-verify-code.test.ts`,
`tests/unit/auth-callback.test.ts` (new)

**Intent**: For each of `request-link.ts`, `verify-code.ts`, `callback.ts`,
call the exported handler with a fake `APIContext` and assert: (a) the
correct SDK method is called with the correct arguments derived from the
request, and (b) the success path redirects as `research.md` documents
(`/auth/confirm-email`, `/`, `/`) while the error path redirects with the
mapped error message.

**Contract**: Error-path cases simulate each Supabase error code
(`otp_expired`, `invalid_credentials`, rate-limit codes) via the mock and
assert the resulting redirect/response reflects `auth-errors.ts`'s mapped
message — cross-referencing Change 3 below rather than re-deriving the
mapping logic.

#### 3. Auth error-mapping unit tests

**File**: `tests/unit/auth-errors.test.ts` (new)

**Intent**: Directly test `toAuthErrorMessage` (or equivalent, from
`src/lib/auth-errors.ts`) against every known Supabase error code
(`otp_expired`, `invalid_credentials`, `over_email_send_rate_limit`,
`over_request_rate_limit`, and the default/unknown-code case), asserting
each maps to its intended user-facing message. This file is extended (not
duplicated) by Phase 4's rate-limit-specific cases.

**Contract**: Pure function test, no network/DB dependency.

### Success Criteria:

#### Automated Verification:

- `npm test -- auth-request-link` / `auth-verify-code` / `auth-callback`
  pass: each endpoint calls the correct Supabase Auth SDK method with the
  correct arguments and redirects correctly on success/error
- `npm test -- auth-errors` passes: every known error code maps to its
  intended message
- `npm run astro check` and `npm run lint` pass

#### Manual Verification:

- Reviewer confirms these tests would fail if, e.g., `verify-code.ts`
  accidentally called `verifyOtp` with the wrong `type` argument (a quick
  local sanity check, revert after confirming)

---

## Phase 4: Risk #6 — Throttling / Resource Abuse (Hermetic)

### Overview

Prove `request-link` reacts correctly to a simulated Supabase rate-limit
error (clean redirect, no crash, no partial state), and keep the
error-mapping coverage complete. **Does not** prove Supabase's real
`email_sent`/`max_frequency` limits are actually configured or enabled
anywhere — that remains a documented, code/config-inspection-only fact (see
research.md) until a Docker-capable environment runs a real hammering test
against it.

### Changes Required:

#### 1. Simulated rate-limit wiring test

**File**: `tests/unit/auth-rate-limit.test.ts` (new)

**Intent**: Reusing Phase 3's `mock-supabase-auth.ts` helper, configure
`signInWithOtp` to return `{ error: { code: "over_email_send_rate_limit" }
}` and call `request-link.ts`'s handler directly; assert it redirects
cleanly with the mapped error message (via `auth-errors.ts`) rather than
throwing or returning a raw 500.

**Contract**: Pure hermetic unit test — no network, no timing, no real
Supabase instance involved. Also covers a second case with
`over_request_rate_limit` for completeness alongside the email-specific
code.

#### 2. Rate-limit error-mapping cases

**File**: `tests/unit/auth-errors.test.ts` (extends Phase 3's file, not a
new file)

**Intent**: If not already covered by Phase 3's initial pass, ensure
`over_email_send_rate_limit` and `over_request_rate_limit` cases are present
and asserted against the intended generic "too many attempts" message.

**Contract**: Additive to the existing file — no duplicate test file.

### Success Criteria:

#### Automated Verification:

- `npm test -- auth-rate-limit` passes: `request-link.ts` handles both
  simulated rate-limit error codes with a clean redirect and mapped message
- `npm test -- auth-errors` passes: all rate-limit error codes map to the
  expected user-facing message
- `npm run astro check` and `npm run lint` pass

#### Manual Verification:

- Reviewer confirms this test does not, and is not claimed to, prove a real
  rate limit exists anywhere — the residual gap is documented in Open Risks,
  not silently implied as covered

---

## Phase 5: Cookbook Update & Wrap-Up

### Overview

Close the loop on `test-plan.md` so future rollout phases and future
contributors inherit the patterns established here, including the
hermetic-mock and skip-gate conventions this environment required.

### Changes Required:

#### 1. Cookbook patterns

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the "TBD — see §3 Phase 1" placeholders in §6.1
(unit test pattern: auth/session logic, JWT-role check, SDK-call wiring
tests), §6.2 (integration test pattern: hermetic Supabase-client/Auth
mocking as this project's default, since no Docker is available), and §6.4
(API endpoint test pattern: ownership-scoped query-filter assertion) with
concrete, short how-to-add-a-test guidance referencing the actual files
created in Phases 1-4.

**Contract**: Each cookbook sub-section gains a short paragraph plus a
pointer to the concrete example file, rather than reproducing full code
inline.

#### 2. Environment-constraint note

**File**: `context/foundation/test-plan.md`

**Intent**: Add a short note (§4 Stack or §8 Freshness Ledger) flagging that
this project's dev/CI environment lacks Docker, so every Supabase-dependent
test in this rollout phase is hermetic (mocked Supabase client/Auth) rather
than real-infra — including Risk #6's rate-limit test, which therefore
cannot confirm Supabase's real limits are actually configured anywhere.
Future rollout phases (2-4 in test-plan.md's own §3) should plan for the
same constraint rather than assuming real integration tests will run.

**Contract**: One to two sentences, added without altering the frozen §1-§5
strategy itself.

#### 3. Rollout status sync

**File**: `context/foundation/test-plan.md`

**Intent**: Move the Phase 1 row in §3 from `change opened` to `complete`.

**Contract**: Table row edit only.

#### 4. Change record sync

**File**: `context/changes/testing-critical-path-security-auth/change.md`

**Intent**: Reflect that the change has completed implementation.

**Contract**: Set `status: implemented` and `updated: <date of completion>`.

### Success Criteria:

#### Automated Verification:

- Full suite passes: `npm test`
- `npm run lint` and `npm run astro check` pass repo-wide

#### Manual Verification:

- A reader unfamiliar with this phase can follow §6.1/§6.2/§6.4 of
  `test-plan.md` and find the referenced example files without additional
  context, and understands from the §4/§8 note why every test in this phase
  is hermetic

---

## Testing Strategy

### Unit Tests:

- `astro:env/server`-alias smoke test (Phase 1)
- `SUPABASE_KEY` JWT role-claim check (Phase 2)
- API route ownership-filter wiring tests: `ask.ts`, `like.ts`, `delete.ts`,
  `profile/update.ts` (Phase 2)
- Auth endpoint SDK-call wiring tests: `request-link.ts`, `verify-code.ts`,
  `callback.ts` (Phase 3)
- Simulated rate-limit-error handling for `request-link.ts` (Phase 4)
- `auth-errors.ts` full error-code mapping, extended across Phases 3-4

### Integration Tests:

- None in this phase — the entire suite is hermetic given this
  environment's Docker constraint. A future Docker-capable run should add
  real integration tests for #1 (two-user RLS), #2 (real OTP lifecycle), and
  #6 (real rate-limit hammering) to close the residual gaps documented in
  Open Risks.

### Manual Testing Steps:

1. Run `npm test` and confirm the full suite passes with zero external
   setup (no Docker, no `supabase start` needed).
2. Temporarily break one ownership filter (e.g. swap `user.id` for a
   request-supplied id in `like.ts`) and confirm Phase 2's test catches it,
   then revert — this is the sanity check that the hermetic tests aren't
   vacuous. Repeat the same sanity check for one auth SDK-call assertion
   (Phase 3) and the rate-limit-error-handling assertion (Phase 4).
3. Wherever a Docker-capable environment becomes available, treat this
   plan's revision history as the spec for the real integration tests that
   should be added then (real 2-user RLS, real OTP lifecycle, real rate-limit
   hammering) — this plan intentionally does not write those files against
   an environment that cannot run them.

## Performance Considerations

None specific to this phase — every test is hermetic and in-process, so the
suite should run in well under a second per file with no network or timing
dependencies.

## Migration Notes

Not applicable — no schema or data migration is part of this phase.

## References

- Related research: `context/changes/testing-critical-path-security-auth/research.md`
- Test-plan strategy: `context/foundation/test-plan.md` §1-§5
- RLS policies (code-inspection only, not automated this phase):
  `supabase/migrations/20260825120100_fairy_data_foundation_rls.sql`
- Auth endpoints: `src/pages/api/auth/request-link.ts`, `callback.ts`, `verify-code.ts`
- Client factory: `src/lib/supabase.ts:5-24`
- Auth guard: `src/middleware.ts:6-29`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest Bootstrap

#### Automated

- [x] 1.1 `npm test` runs and the smoke test passes — 22000e8
- [x] 1.2 `npm run astro check` passes with the new files included — 22000e8
- [x] 1.3 `npm run lint` passes on the new files — 22000e8

#### Manual

- [x] 1.4 Reviewer confirms `.env.test.example`'s documented dummy values are sufficient to run the full suite (minus Phase 4's real test) with zero external setup

### Phase 2: Risk #1 — Data-Isolation Wiring Tests (Hermetic)

#### Automated

- [x] 2.1 `api-fairy-ownership` passes: `ask.ts`/`like.ts`/`delete.ts` filter every query on `locals.user.id`, never a request-supplied id — 7631106
- [x] 2.2 `api-profile-ownership` passes: `profile/update.ts` filters on `locals.user.id` and never calls insert/delete on `profiles` — 7631106
- [x] 2.3 `supabase-key-role` passes: configured `SUPABASE_KEY` decodes to `role: "anon"` — 7631106
- [x] 2.4 `npm run astro check` and `npm run lint` pass — 7631106

#### Manual

- [x] 2.5 Reviewer confirms the mock helper's assertions actually fail on a deliberately broken filter, then revert

### Phase 3: Risk #2 — Magic-Link/Kod Auth Flow Wiring Tests (Hermetic)

#### Automated

- [x] 3.1 `auth-request-link` / `auth-verify-code` / `auth-callback` pass: each endpoint calls the correct Supabase Auth SDK method with the correct arguments and redirects correctly on success/error — 9e6cbf7
- [x] 3.2 `auth-errors` passes: every known error code maps to its intended message — 9e6cbf7
- [x] 3.3 `npm run astro check` and `npm run lint` pass — 9e6cbf7

#### Manual

- [x] 3.4 Reviewer confirms these tests would fail on a deliberately wrong SDK argument, then revert

### Phase 4: Risk #6 — Throttling / Resource Abuse (Hermetic)

#### Automated

- [x] 4.1 `auth-rate-limit` passes: `request-link.ts` handles both simulated rate-limit error codes with a clean redirect and mapped message — aed43cd
- [x] 4.2 `auth-errors` passes: all rate-limit error codes map to the expected user-facing message (already fully covered by Phase 3's file — no change needed) — aed43cd
- [x] 4.3 `npm run astro check` and `npm run lint` pass — aed43cd

#### Manual

- [x] 4.4 Reviewer confirms this test does not, and is not claimed to, prove a real rate limit exists anywhere

### Phase 5: Cookbook Update & Wrap-Up

#### Automated

- [x] 5.1 Full suite passes (or skips only the Phase 4 real test with a stated reason): `npm test` — 2caa89d
- [x] 5.2 `npm run lint` and `npm run astro check` pass repo-wide — 2caa89d

#### Manual

- [x] 5.3 A reader unfamiliar with this phase can follow §6.1/§6.2/§6.4 of `test-plan.md` and understand from the §4/§8 note why some tests are hermetic-only in this environment
