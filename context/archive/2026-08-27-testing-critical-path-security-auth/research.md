---
date: 2026-08-27T20:14:18+02:00
researcher: dwachnicki@tlen.pl
git_commit: 1dc0d7a7e0efe6ab3059ef216fcd79111732afec
branch: main
repository: wrozka-online
topic: "Rollout Phase 1 — Critical-path security & auth (Risks #1, #2, #6)"
tags: [research, codebase, auth, rls, supabase, magic-link, rate-limiting, vitest]
status: complete
last_updated: 2026-08-27
last_updated_by: dwachnicki@tlen.pl
---

# Research: Critical-path security & auth (Rollout Phase 1)

**Date**: 2026-08-27T20:14:18+02:00
**Researcher**: dwachnicki@tlen.pl
**Git Commit**: 1dc0d7a7e0efe6ab3059ef216fcd79111732afec
**Branch**: main
**Repository**: wrozka-online

## Research Question

Ground Rollout Phase 1 of `context/foundation/test-plan.md` ("Critical-path security & auth", risks #1, #2, #6) before planning tests:

- **#1**: Which queries touching `profiles`/`fairy_responses` rely on RLS vs. explicit `user_id` filters? Is there any real cross-user leak surface?
- **#2**: What is the actual token/code lifecycle for magic-link/kod login, and what does the callback route do? Is expiry/reuse/cross-account handling custom or delegated?
- **#6**: Does any rate-limiting/throttling exist today on the magic-link/kod request endpoint?
- Bootstrapping fact-finding: confirm no test runner exists yet and gather what a first-time Vitest setup needs (stack versions, aliases, env vars, local Supabase availability, CI).

## Summary

**Risk #1 (cross-user data leak) — surface is narrow, but two things are untestable at the unit/integration-code layer and must be called out explicitly in the plan:**
RLS is enabled and complete on both `profiles` and `fairy_responses` (`supabase/migrations/20260825120100_fairy_data_foundation_rls.sql`), and **every single app-level query site also adds an explicit `user_id`/`id` filter tied to `context.locals.user.id`** (never a client-supplied value) — defense-in-depth is already in place, not "RLS-only". No query was found that relies on RLS alone. The two residual risks that code-level tests can't fully close: (a) whether `SUPABASE_KEY` in the real environment is the anon key or a service-role key — a service-role key would silently bypass RLS project-wide, and the app has no separate admin client anywhere so this is a single point of failure; (b) `profiles` has no INSERT/DELETE policy at all (insert only happens via a `SECURITY DEFINER` trigger), which is correct-by-omission but worth an explicit "user cannot insert/delete a profiles row directly" test.

**Risk #2 (magic-link/kod correctness) — entirely delegated to Supabase Auth (GoTrue); the app has zero custom OTP/expiry/reuse logic.** Three endpoints: `request-link.ts` (`signInWithOtp`), `callback.ts` (`exchangeCodeForSession`, magic-link path), `verify-code.ts` (`verifyOtp`, 6-digit code path). Session cookies are written automatically by the `@supabase/ssr` client's `setAll` callback — the app never constructs a session or reads a client-supplied user id to establish one. Downstream authorization always re-derives `user.id` from `supabase.auth.getUser()` in `src/middleware.ts`, never from a request parameter. This means integration tests for Risk #2 are testing **Supabase Auth's behavior through the app's thin wrapper**, not custom logic — the "must challenge" item from the test-plan ("mocking Supabase auth entirely — misses real token validation") is a real trap here, since there's barely any app logic to mock around.

**Risk #6 (rate-limiting) — confirmed: no application-level rate limiting exists anywhere in the codebase.** The only throttling is whatever Supabase Auth enforces itself (local dev config shows `email_sent = 2`/hour, `sign_in_sign_ups = 30`/5min/IP, `token_verifications = 30`/5min/IP in `supabase/config.toml`), and production limits depend on the actual hosted Supabase project's dashboard settings — not visible from this repo. The app only translates Supabase's rate-limit error codes into a generic message (`src/lib/auth-errors.ts`). This confirms the test-plan's framing: "feature works" ≠ "feature can't be abused at volume" — today it can only be abused up to whatever Supabase's own (currently un-auditable-from-repo) limits allow.

**Bootstrap facts**: No test runner, config, or test files exist anywhere (`find` for `*.test.ts`/`*.spec.ts`/`__tests__` returned nothing). Stack: Astro 6.3.1 (SSR, `output: "server"`, Cloudflare adapter), Vite pinned via override to `^7.3.2`, TypeScript strict (`astro/tsconfigs/strict`), path alias `@/*` → `./src/*`, three env vars (`SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY`) declared as Astro env-schema secrets (accessed via `astro:env/server`, a virtual module Vitest can't resolve without explicit handling). A local Supabase stack is available via the `supabase` CLI devDependency (`^2.23.4`, unpinned binary) + `supabase/config.toml` (API :54321, DB :54322) with three existing migrations to apply — this is the natural integration-test substrate for Risk #1 and #2. CI (`.github/workflows/ci.yml`) currently runs lint + build only; no test step exists yet.

## Detailed Findings

### Risk #1 — Data isolation (profiles / fairy_responses)

**RLS policies** (`supabase/migrations/20260825120100_fairy_data_foundation_rls.sql`):
```sql
alter table public.profiles enable row level security;          -- line 5
alter table public.fairy_responses enable row level security;   -- line 6

create policy "profiles_select_own" on public.profiles for select
  using (auth.uid() = id);                                        -- lines 8-11
create policy "profiles_update_own" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);           -- lines 13-17

create policy "fairy_responses_select_own" ... for select using (auth.uid() = user_id);   -- 19-22
create policy "fairy_responses_insert_own" ... for insert with check (auth.uid() = user_id); -- 24-27
create policy "fairy_responses_update_own" ... for update using/with check (auth.uid() = user_id); -- 29-33
create policy "fairy_responses_delete_own" ... for delete using (auth.uid() = user_id);   -- 35-38
```
- `profiles` has **no INSERT or DELETE policy** — insert only happens via the `SECURITY DEFINER` trigger `handle_new_user()` (`supabase/migrations/20260825120000_fairy_data_foundation.sql:26-45`), fired on `auth.users` signup. Correct by omission, but worth a negative test.
- `fairy_responses` has full CRUD coverage, all gated `auth.uid() = user_id`.

**Client**: single factory `src/lib/supabase.ts:5-24` (`createServerClient` from `@supabase/ssr`, cookie-based/session-scoped). Grep for `service_role`/`SERVICE_ROLE_KEY`/`supabaseAdmin` across `src/` returned **zero hits** — there is no admin/service-role client anywhere in the app. RLS enforcement therefore depends entirely on `SUPABASE_KEY` actually holding the anon key in every environment; this cannot be verified from code (`.env.example` and `astro.config.mjs:17-23` just declare a generic secret string, not `SUPABASE_ANON_KEY` vs `SUPABASE_SERVICE_ROLE_KEY`).

**Every query site** (no exceptions found) pairs the RLS backstop with an explicit filter derived from `context.locals.user.id` (itself only ever set by `middleware.ts` from `supabase.auth.getUser()`, never from client input):

| File:line | Table | Op | Explicit filter |
|---|---|---|---|
| `src/pages/api/fairy/ask.ts:36-40` | profiles | SELECT | `.eq("id", user.id)` |
| `src/pages/api/fairy/ask.ts:46-52` | fairy_responses | SELECT | `.eq("user_id", user.id).eq("liked", true)` |
| `src/pages/api/fairy/ask.ts:69-73` | fairy_responses | INSERT | `user_id: user.id` in payload |
| `src/pages/api/fairy/like.ts:29-34` | fairy_responses | SELECT | `.eq("id", id).eq("user_id", user.id)` |
| `src/pages/api/fairy/like.ts:40-44` | fairy_responses | UPDATE | `.eq("id", id).eq("user_id", user.id)` |
| `src/pages/api/fairy/delete.ts:22` | fairy_responses | DELETE | `.eq("id", id).eq("user_id", user.id)` |
| `src/pages/api/profile/update.ts:38-45` | profiles | UPDATE | `.eq("id", user.id)` |
| `src/pages/dashboard.astro:26-29` | profiles | SELECT | `.eq("id", user.id)` |
| `src/pages/dashboard.astro:33-43` | fairy_responses | SELECT | `.eq("id", responseId).eq("user_id", user.id)` |
| `src/pages/dashboard/history.astro:20-29` | fairy_responses | SELECT | `.eq("user_id", user.id)`, no `.limit()` |
| `src/pages/dashboard/profile.astro:22-25` | profiles | SELECT | `.eq("id", user.id)` |

Three endpoints accept a client-supplied resource id (`like.ts:16`, `delete.ts:16`, `dashboard.astro:22` via `?response=`) and all three cross-check it against `user.id` in the same query — no path found where a foreign id is trusted alone.

### Risk #2 — Magic-link / kod lifecycle

Three endpoints, all built on the single SSR client (`src/lib/supabase.ts`):

- `src/pages/api/auth/request-link.ts:17-23` — `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: <origin>/api/auth/callback, shouldCreateUser: true } })`. Sends **both** a magic link and a 6-digit code to the same email in one call.
- `src/pages/api/auth/callback.ts:17` — magic-link path: `supabase.auth.exchangeCodeForSession(code)` from the `code` query param, redirects to `/`.
- `src/pages/api/auth/verify-code.ts:24` — code path: `supabase.auth.verifyOtp({ email, token: code, type: "email" })`, redirects to `/`.
- `src/pages/api/auth/signout.ts:7` — `supabase.auth.signOut()`.

No custom state (no expiry timestamps, used-code sets, email/code pairing) exists anywhere in the app — `src/lib/auth-errors.ts:7-12` maps Supabase's own `otp_expired` and `invalid_credentials` error codes to UI strings, confirming expiry/reuse detection happens **inside Supabase Auth**, not the app.

Session establishment: `@supabase/ssr`'s `createServerClient` (`src/lib/supabase.ts:9-23`) auto-writes returned session cookies via its `setAll` callback (lines 17-21) — no manual cookie/session construction. All downstream authorization re-derives the user from `supabase.auth.getUser()` in `src/middleware.ts:10-13` (re-validates JWT against Supabase; not a cookie decode), never from a request parameter — no path found where a forged/foreign user id could be substituted.

Supabase local dev config (`supabase/config.toml`): `jwt_expiry = 3600` (line 158, session token lifetime, not OTP window); `[auth.rate_limit]` (lines 180-194): `email_sent = 2`/hour (requires `auth.email.smtp` enabled per its own comment — the commented-out `[auth.email.smtp]` block at lines 220-227 suggests this may only bind once a production SMTP provider is configured; needs a runtime check against local Inbucket during implementation), `sign_in_sign_ups = 30`/5min/IP, `token_verifications = 30`/5min/IP. `[auth.email]` (lines 202-217) sets `otp_length = 6`, `otp_expiry = 3600` (1 hour — explicit, corrects an earlier pass of this research which missed it), and `max_frequency = "1s"` (minimum time between consecutive send requests to the same address). `[inbucket]` (lines 99-107) is enabled on port 54324 with a web UI/REST API for reading captured local test emails — this is the mechanism available for retrieving a real magic-link/code in an integration test without mocking Supabase. Production behavior for all of the above depends on the actual hosted Supabase project's dashboard, not this repo.

**No existing tests** for any of this: `find . -iname "*.test.ts" -o -iname "*.spec.ts" -o -iname "__tests__"` (excluding node_modules) returned nothing.

### Risk #6 — Rate limiting / throttling

Exhaustive grep across `*.ts`, `*.astro`, `*.toml`, `*.js` for `rate.?limit|throttle|upstash|durable object|retry-after|429` and, narrower, `counter|window|attempts|cooldown` in `src/pages/api/auth` and `src/lib`: the only hits are `supabase/config.toml`'s own `[auth.rate_limit]` block and the app's translation of Supabase's rate-limit error codes (`over_email_send_rate_limit`, `over_request_rate_limit`) in `src/lib/auth-errors.ts:9-11`. **No application-level rate limiting, counters, KV/Durable-Object/Upstash usage, or 429 handling exists in the app code.** Whatever protection exists today is entirely Supabase Auth's built-in limit, whose production values are not visible from this repo.

### Bootstrap facts (Vitest, no runner exists yet)

- `package.json`: `"type": "module"`; scripts are `dev`/`build`/`preview`/`astro`/`deploy`/`lint`/`lint:fix`/`format` — **no `test` script**. Key deps: `astro ^6.3.1`, `@astrojs/cloudflare ^13.5.0`, `@astrojs/react ^5.0.4`, `@supabase/ssr ^0.10.3`, `@supabase/supabase-js ^2.99.1`, `react/react-dom ^19.2.6`. Devdeps: `typescript ^5.9.3`, `supabase` CLI `^2.23.4`, `wrangler ^4.90.0`. No `vitest`/`jest`/`playwright`/`@testing-library/*` anywhere. A `vite` override pins `^7.3.2` (package.json:58-60) — relevant for Vitest version compatibility since there's no direct `vite` devDependency.
- `astro.config.mjs`: `output: "server"` (SSR), Cloudflare adapter, `tailwindcss()` Vite plugin, and an Astro env schema (lines 17-23) declaring `SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY` as server-context secrets accessed via `astro:env/server` — a virtual module Vitest needs explicit mocking/aliasing for, not a plain `import.meta.env` var.
- `tsconfig.json`: extends `astro/tsconfigs/strict`; path alias `@/*` → `./src/*` (needs a matching `resolve.alias` or `vite-tsconfig-paths` in `vitest.config.ts`).
- No `vitest.config.*`/`jest.config.*`/`playwright.config.*` anywhere — first-time setup.
- `.env.example` has exactly `SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY`; a `.dev.vars` file exists at repo root for Wrangler local dev secrets.
- `supabase/` has `config.toml` + three migrations (`20260825120000_fairy_data_foundation.sql`, `..._rls.sql`, `..._updated_at.sql`). Local stack ports: API `54321`, DB `54322` (`config.toml:7-10,27-36`). No Supabase CLI binary version pin beyond the npm devDependency semver range — CI/local rely on `npx supabase` resolving within `^2.23.4`.
- CI (`.github/workflows/ci.yml`, 43 lines): `ci` job runs checkout → setup-node@v4 (node 22) → `npm ci` → `npx astro sync` → `npm run lint` → `npm run build` (build step injects `SUPABASE_URL`/`SUPABASE_KEY` secrets). `deploy` job runs only on push to `main`. **No test step exists** — one would need to be added alongside/after lint.

## Code References

- `src/lib/supabase.ts:5-24` — single SSR Supabase client factory; cookie read/write; returns `null` if env vars missing
- `src/middleware.ts:6-29` — sole route-level auth guard; `supabase.auth.getUser()` → `context.locals.user`; protects `/dashboard`
- `src/pages/api/auth/request-link.ts:17-23` — `signInWithOtp` (issues both link + code)
- `src/pages/api/auth/callback.ts:17` — `exchangeCodeForSession` (magic-link path)
- `src/pages/api/auth/verify-code.ts:24` — `verifyOtp` (6-digit code path)
- `src/pages/api/auth/signout.ts:7` — `signOut`
- `src/lib/auth-errors.ts:5-17` — maps Supabase error codes (`otp_expired`, rate-limit codes, `invalid_credentials`) to UI messages
- `src/pages/api/profile/update.ts:6-54` — profile update, `.eq("id", user.id)`, `about_me` ≤500 chars enforced server-side (`ABOUT_ME_MAX_LENGTH`, line 4)
- `src/pages/api/fairy/ask.ts:13-82` — creates fairy_responses row; reads profile + up to 10 liked answers, both `user_id`-filtered
- `src/pages/api/fairy/like.ts:4-51`, `src/pages/api/fairy/delete.ts:4-31` — toggle/delete with dual `id`+`user_id` filter
- `src/pages/dashboard/history.astro:16-29` — full history list, `user_id`-filtered, no limit
- `supabase/migrations/20260825120000_fairy_data_foundation.sql` — `profiles`/`fairy_responses` schema + `handle_new_user()` trigger (implicit profile creation)
- `supabase/migrations/20260825120100_fairy_data_foundation_rls.sql` — all RLS policies (verbatim above)
- `supabase/config.toml:150-209` — local `jwt_expiry` and `[auth.rate_limit]` defaults
- `.github/workflows/ci.yml` — current CI (lint + build only, no test step)
- `astro.config.mjs:17-23`, `tsconfig.json` — env schema and path-alias facts needed for `vitest.config.ts`

## Architecture Insights

- **Defense-in-depth is already the pattern, not the exception**: every query site pairs RLS with an explicit ownership filter derived from a server-verified session, never from client input. This significantly narrows Risk #1's testable surface — the interesting tests are less "does the app leak data" (it doesn't appear to) and more "does the DB-level policy hold on its own if the app-level filter were ever removed" (regression insurance) plus an environment/config check that the configured key is anon, not service-role.
- **Auth is a thin wrapper around Supabase Auth**, not custom-built. This flips the usual "don't mock the SDK" concern into "there's almost nothing to test except the wrapper" — integration tests here are effectively testing Supabase Auth's OTP/magic-link behavior through the app's redirect/cookie glue, which matches the test-plan's explicit warning against mocking Supabase auth entirely.
- **No rate limiting is an intentional (or at least undecided) gap**, not a bug the plan should silently work around — Risk #6 tests should assert against whatever Supabase's actual limits are (or document that today's only protection is Supabase's own defaults, unverifiable from this repo).
- **`profiles` row lifecycle is entirely trigger-driven** (creation) and policy-restricted (no insert/delete from the app) — a different shape than `fairy_responses`, which has full app-level CRUD. Tests for #1 should not assume symmetric CRUD coverage between the two tables.

## Historical Context (from prior changes)

No prior `context/changes/**/` or `context/archive/**/` entries exist yet for auth/security testing — this is the first rollout phase opened for this test-plan effort (`context/changes/testing-critical-path-security-auth/` is itself brand new, created via `/10x-new` earlier in this session). `context/foundation/lessons.md` has one entry (post-epilogue fixes must update plan.md) — not directly applicable to research, but relevant once this phase reaches implementation/epilogue.

## Related Research

None yet — this is the first research artifact under this test-plan rollout.

## Open Questions

1. **Which key does `SUPABASE_KEY` actually hold in staging/production** (anon vs. service-role)? This cannot be determined from the repo and is the single largest residual risk for #1 — RLS is fully bypassed if it's a service-role key, and the app has no separate admin client to fall back on for comparison. Recommend a documented manual/config check in the plan rather than a code test.
2. **What are the actual production Supabase Auth rate-limit values** for `email_sent` / `sign_in_sign_ups` / `token_verifications`? `supabase/config.toml` only shows local-dev defaults; the hosted project's dashboard may differ. Integration tests against a local `supabase start` instance will exercise the config.toml values, not necessarily production's.
3. Should Risk #1 tests include a DB-level RLS regression test (two real authenticated Postgres sessions asserting cross-user `SELECT`/`UPDATE`/`DELETE` return zero rows) in addition to the app-level integration tests, given the app-level filters already look complete? The test-plan's risk-response guidance explicitly asks to challenge "RLS policy exists ≠ every query path is scoped" — the finding here is that every query path *is* scoped, so the RLS-only regression test is what actually stresses the "policy exists" half of that guidance.

These should be resolved (or explicitly deferred with a documented reason) during `/10x-plan`.
