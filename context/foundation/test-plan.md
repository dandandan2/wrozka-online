# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-08-27

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic diff that already catches the
   regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/` (Astro pages, API
routes, React components, lib) — 20 commits/30d. Excluded: `dist/`,
`node_modules/`, `.astro/`, `supabase/migrations/` (schema, not app logic).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | Zalogowany użytkownik odczytuje lub edytuje profil bądź historię innego użytkownika | High | Medium | PRD NFR (dane profilu/historii dostępne wyłącznie dla właściciela), PRD Access Control, interview Q1 ("worries most") |
| 2 | Logowanie magic-link/kod zawodzi albo pozwala zalogować się jako inny użytkownik | High | Medium | interview Q3 (low-confidence area), hot-spot dir `src/pages/api/auth/` + `src/components/auth/` (13 commits/30d) |
| 3 | Wróżka generuje treść czytaną jako realna porada medyczna/finansowa/prawna mimo disclaimeru | High | Medium | PRD FR-005 Socratic resolution (explicit business rule), hot-spot dir `src/lib/ai/` (5 commits/30d) |
| 4 | Usunięcie wpisu z historii nie usuwa go z puli wzorców stylu (FR-009) | Medium | Medium | PRD FR-009 Socratic resolution (explicit business rule) |
| 5 | Zewnętrzne wywołanie AI (OpenRouter) zawodzi/timeoutuje i użytkownik dostaje niejasny błąd albo powstaje niespójny wpis | Medium | Medium-High | hot-spot dir `src/lib/ai/` (5 commits/30d), roadmap S-01 Unknown (koszt/latencja pod limitem CPU Cloudflare Workers) |
| 6 | Brak throttlingu na endpoint magic-link pozwala zalać cudzy e-mail linkami/kodami (resource abuse) | Medium | Medium | abuse lens (resource abuse), PRD FR-001, hot-spot dir `src/pages/api/auth/` (13 commits/30d) |
| 7 | Pole "o sobie" nie ma wymuszonego serwerowo limitu długości (tylko UI), rozdymając kontekst przekazywany do AI | Medium | Medium | PRD FR-002 Socratic resolution (explicit NFR), roadmap S-01 Unknown |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | User A's request never returns or mutates User B's profile or fairy-response rows | "RLS policy exists" ≠ "every query path is scoped by user_id" | RLS policy definitions; which queries rely on RLS vs. explicit user-id filters | integration (DB with 2 authenticated sessions) | Testing only the happy-path single-user case |
| #2 | A valid link/code issues a session for the right user; expired, reused, or foreign codes are rejected | "Magic link exists" ≠ "expiry/reuse/cross-account cases are handled" | Token/code lifecycle, expiry window, callback route behavior | integration (auth API routes) | Mocking Supabase auth entirely — misses real token validation |
| #3 | Response to a medical/financial/legal-shaped question stays in-character and avoids concrete recommendations | "System prompt says X" ≠ "model reliably obeys X" | Actual model/provider in use, any moderation or post-filter step | AI-native (LLM-as-judge or pattern-based check) — classic assertion can't judge freeform text | Asserting on exact generated string (oracle problem) |
| #4 | After delete, a subsequent ask() no longer includes that answer in the style-pattern context | "Delete removes DB row" ≠ "delete removes it from the liked-for-style query too" | Query that builds the liked-answers list; delete handler | integration (delete → ask → assert answer absent from AI call payload) | Asserting only that the DB row disappeared, not that the style pool excludes it |
| #5 | On AI-provider failure/timeout, the user sees a clean error and no partial or corrupt fairy-response row is written | "try/catch exists" ≠ "no partial write happens on failure" | Error path in the ask handler; ordering of generate-then-insert | unit/integration (mock provider failure) | Only testing the happy path where the provider succeeds |
| #6 | Repeated link/code requests to the same email are throttled or rejected past a threshold | "Feature works" ≠ "feature can't be abused at volume" | Whether any rate-limit exists today (research must confirm) | integration (hammer the request-link endpoint) | Skipping this because "it's a small app, nobody would abuse it" |
| #7 | An oversized `about_me` submitted directly via API (bypassing the UI) is rejected or truncated server-side | "UI has maxLength" ≠ "server enforces it" | Actual server-side validation (or its absence) on profile update | integration (POST oversized field directly to the API) | Testing only via the UI form, never hitting the API directly |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Critical-path security & auth | Prove data isolation and auth-flow correctness hold; bootstrap Vitest | #1, #2, #6 | unit + integration | complete | `context/changes/testing-critical-path-security-auth/` |
| 2 | Fairy-loop business-rule integrity | Prove delete/style-pool consistency and AI-failure handling don't silently corrupt state | #4, #5, #7 | integration + unit | not started | — |
| 3 | AI-native safety review | Prove disclaimer/safety framing holds under adversarial-shaped questions | #3 | AI-native (LLM-judge) | not started | — |
| 4 | Quality-gates wiring | Lock unit+integration into CI as a required gate alongside existing lint/build | cross-cutting | gates | not started | — |

**Status vocabulary** (fixed): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

The classic test base for this project. AI-native tools carry a `checked:`
date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | none yet — see Phase 1 | Native to the Astro/Vite toolchain already in use; TS-first, no separate transform config needed |
| API mocking | MSW (or native `fetch` mock for the OpenRouter edge) | none yet — see Phase 2 | Mock only the external OpenRouter HTTP boundary; never mock internal `src/lib/` modules |
| e2e | Playwright | none yet — see Phase 1 (only if a risk needs full deployed shape) | Reserve for auth/session flows crossing cookies + Cloudflare middleware |
| accessibility | none planned | — | Out of scope for this rollout — not raised by PRD, interview, or hot-spots |
| (optional) AI-native | LLM-as-judge script (checked: 2026-08-27) | n/a | When NOT to use: never for deterministic assertions (data isolation, delete-cascade, error handling) — only for judging freeform generated text against a safety rubric |

**Environment constraint (learned during Phase 1 implementation, 2026-08-27):**
This project's dev/CI environment has no Docker, so `supabase start` cannot
run here — every Supabase-dependent test in Phase 1 is therefore hermetic
(mocked Supabase client/Auth via `tests/helpers/`) rather than real-infra,
including the Risk #6 rate-limit test, which cannot confirm Supabase's real
limits are actually configured anywhere. Future rollout phases (2-4 below)
should plan for the same constraint rather than assuming real integration
tests will run automatically; see `context/changes/testing-critical-path-security-auth/plan.md`'s
revision note and Open Risks for what a real-infra version of each test
would look like once a Docker-capable environment is available.

**Stack grounding tools (current session):**
- Docs: none available in current session — not checked via a docs MCP (e.g. Context7); Vitest/Astro compatibility relies on known ecosystem convention; checked: 2026-08-27.
- Search: none available in current session; checked: 2026-08-27.
- Runtime/browser: `claude-in-chrome` MCP is present but is an interactive browser-automation tool, not a test-authoring framework — not used for this recommendation; checked: 2026-08-27.
- Provider/platform: none used — Supabase/Cloudflare MCPs not available in current session; checked: 2026-08-27.

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI | required (already wired) | syntactic / type drift |
| unit + integration | local + CI | required after §3 Phase 1 | logic and data-isolation regressions |
| e2e on critical flows | CI on PR | required after §3 Phase 1 (auth flow only) | broken login/session path |
| AI-native safety review | CI on PR (selective) | required after §3 Phase 3 | disclaimer/safety-framing regressions in generated content |
| post-edit hook | local (agent loop) | out of scope this lesson | configured in Module 3 Lesson 3 |
| pre-prod smoke | between merge + prod | optional | environment-specific failures (Cloudflare Workers) |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, it reads "TBD — see §3
Phase N."

### 6.1 Adding a unit test

Unit tests use Vitest (`npm test`) and live under `tests/unit/`. For
auth/session logic, mock `@/lib/supabase`'s `createClient` (via
`vi.mock("@/lib/supabase")`) to inject a fake client/auth object, then call
the exported route handler directly with a hand-built `APIContext` — see
`tests/helpers/fake-api-context.ts` and `tests/helpers/mock-supabase-auth.ts`,
with `tests/unit/auth-request-link.test.ts` as the canonical example. For a
JWT-role/environment-assumption check (e.g. verifying `SUPABASE_KEY` decodes
to `role: "anon"`), see `tests/unit/supabase-key-role.test.ts`. For
pure-function error-mapping tests, see `tests/unit/auth-errors.test.ts`.
See §3 Phase 2 for AI-failure-handling patterns once that phase lands.

### 6.2 Adding an integration test

This environment has no Docker, so there is no live-Postgres/live-Supabase
integration layer today — every "integration-shaped" test (ownership
filtering, auth-flow correctness, rate-limit handling) is written
hermetically instead: mock `@/lib/supabase`'s client
(`tests/helpers/mock-supabase-client.ts` for query-builder calls,
`tests/helpers/mock-supabase-auth.ts` for Auth SDK calls) and assert on
recorded calls/arguments rather than real database/provider behavior. See
`tests/unit/api-fairy-ownership.test.ts` for the query-filter pattern and
`tests/unit/auth-request-link.test.ts` for the SDK-call pattern. When a
Docker-capable environment becomes available, add real integration tests
alongside these (two authenticated Supabase sessions for RLS, real OTP
lifecycle via local Inbucket, real rate-limit hammering) — see
`context/changes/testing-critical-path-security-auth/plan.md`'s revision
note and Open Risks for the original real-infra designs these hermetic
tests stand in for.

### 6.3 Adding an e2e test

- TBD — see §3 Phase 1, only if the auth flow needs full deployed-shape coverage.

### 6.4 Adding a test for a new API endpoint

For a new `src/pages/api/` endpoint that touches `profiles` or
`fairy_responses`, add a hermetic ownership-filter test: mock
`@/lib/supabase`'s client via `tests/helpers/mock-supabase-client.ts`, call
the exported handler with a fake `APIContext`
(`tests/helpers/fake-api-context.ts`) where `locals.user.id` and any
client-supplied resource id are deliberately different values, then assert
every `.eq(...)` call filtering `profiles`/`fairy_responses` uses
`locals.user.id`, never the request-supplied value. See
`tests/unit/api-fairy-ownership.test.ts` and
`tests/unit/api-profile-ownership.test.ts`.

### 6.5 Adding an AI-native safety check

- TBD — see §3 Phase 3 for the LLM-judge pattern on generated fairy responses.

### 6.6 Per-rollout-phase notes

(Filled in as each phase lands.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption
changes.

- **Dokładna treść wygenerowanej wróżby** — nie asertujemy konkretnej,
  kreatywnej treści odpowiedzi AI (nie da się sensownie zweryfikować "dobra
  wróżba"); testujemy tylko strukturę i bezpieczeństwo (Risk #3, AI-native
  layer), nigdy dosłowną treść. Re-evaluate if the product starts scoring
  or ranking response quality. (Source: Phase 2 interview Q5.)
- **Wizualny/kosmetyczny wygląd komponentów** (Topbar, Welcome, Banner) —
  niski impact biznesowy, wysoka częstość zmian estetycznych;
  re-evaluate if a visual regression reaches production and causes a
  reported issue. (Source: challenger pass — not explicitly raised in
  interview, low priority by impact×likelihood.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-08-27
- Stack versions last verified: 2026-08-27
- AI-native tool references last verified: 2026-08-27

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
