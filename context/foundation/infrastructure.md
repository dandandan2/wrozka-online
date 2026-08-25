---
project: wrozbita-online
researched_at: 2026-08-25
recommended_platform: Cloudflare Workers/Pages
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript/JavaScript
  framework: Astro 6 (React 19 islands)
  runtime: Cloudflare Workers (workerd, via @astrojs/cloudflare)
---

## Recommendation

**Deploy on Cloudflare Workers/Pages.**

Cloudflare scores 5/5 on all agent-friendly criteria (CLI-first via `wrangler`, managed/serverless, `llms.txt` docs, stable `wrangler deploy`/`rollback` API, GA MCP server), costs $0 at the project's expected 10k–100k monthly requests (100k req/day free tier), and is already the bootstrapped adapter in this repo (`@astrojs/cloudflare` in `package.json`, `deployment_target: cloudflare-pages` in `context/foundation/tech-stack.md`). It also matches the developer's stated existing familiarity and the "minimize cost" priority from the interview — no other candidate ties Cloudflare on both scoring and zero switching cost.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP/Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare | Pass | Pass | Pass | Pass | Pass | 5 Pass |
| Vercel | Pass | Pass | Pass | Pass | Pass | 5 Pass |
| Netlify | Partial | Pass | Pass | Partial | Pass | 3 Pass / 2 Partial |
| Render | Partial | Pass | Pass | Pass | Partial | 3 Pass / 2 Partial |
| Railway | Pass | Partial | Partial | Pass | Pass | 3 Pass / 2 Partial |
| Fly.io | Pass | Partial | Pass | Pass | Pass | 4 Pass / 1 Partial |

- **Cloudflare**: `wrangler deploy`/`rollback`/`tail` all GA; free tier covers this project's traffic at $0; `llms.txt` + per-page markdown docs; official MCP server + Agents SDK.
- **Vercel**: Equally strong technically (`@astrojs/vercel` v10 GA, `vercel deploy`/`rollback`/`logs`, `llms.txt`, hosted MCP GA mid-2026), but the free Hobby tier is restricted to non-commercial use — a monetized app later would need Pro at $20/mo minimum.
- **Netlify**: True $0 credit-based tier at this traffic, `llms.txt`, official hosted MCP GA — but rollback is dashboard-only (no dedicated CLI verb), and WebSockets aren't natively supported (not needed for this MVP).
- **Render**: One-click Astro SSR template, full WebSocket support, REST API rollback — but CLI is thin (deploy/rollback mainly dashboard/API-driven) and the free tier cold-starts after 15 min idle (bad UX for a user-facing MVP without upgrading to the $7/mo Starter).
- **Railway**: Fully-managed Postgres/Redis/volumes and official MCP, but it's container/Dockerfile-based (not truly serverless), has no confirmed `llms.txt`, and has no free tier (~$5–20/mo minimum).
- **Fly.io**: Native long-running WebSocket support and official MCP built into `flyctl`, but requires hand-tuned Dockerfiles, has no free tier at all (~$5–25/mo minimum), and doesn't match the "minimize cost" priority.

### Shortlisted Platforms

#### 1. Cloudflare Workers/Pages (Recommended)

Already the bootstrapped deployment target for this repo. Zero cost at MVP traffic, full CLI/API parity for deploy/rollback/logs, and an official MCP server for agent-driven operations. The only real trade-off is `workerd`'s partial Node.js compatibility, mitigated by the fact that the stack (Astro + Supabase `@supabase/ssr` + zod) is already verified to work on this adapter by the starter itself.

#### 2. Vercel

Matches Cloudflare on every scored criterion and would be the pick if the team had prior Vercel experience or if Next.js-specific tooling mattered. Held back only by the Hobby-tier commercial-use restriction and by requiring a stack migration away from the already-bootstrapped Cloudflare adapter.

#### 3. Netlify

A viable low-cost fallback with strong docs/MCP support, but the dashboard-only rollback path is a real gap for an agent-driven operational loop, and it also requires migrating off the already-bootstrapped Cloudflare adapter.

## Anti-Bias Cross-Check: Cloudflare Workers/Pages

### Devil's Advocate — Weaknesses

1. `workerd` is not full Node.js — the `nodejs_compat` flag covers most but not all Node APIs, so a future dependency could break silently in production despite working in `astro dev`.
2. Outgoing WebSocket connections to external services are **not** hibernation-eligible (open GitHub issue #4864) — irrelevant today (no realtime in scope per PRD non-goals) but a trap if realtime is added later.
3. Env/secrets must be read via `locals.runtime.env` or `astro:env`, not plain `process.env` — an easy mistake for an agent session copying a generic Node.js example, and it fails silently (undefined, not an error) in production.
4. D1/KV/R2/Durable Objects create real lock-in if the MVP later wants co-located storage beyond Supabase.
5. The free plan's 10ms CPU/invocation cap could bite if AI-response generation (FR-005) does synchronous heavy work at the edge instead of delegating to an external LLM API and just proxying the response.

### Pre-Mortem — How This Could Fail

The team leans on `workerd` Node-compat shims for a dependency that isn't actually fully supported, discovers it only in production, and loses a day debugging a silent runtime difference between `astro dev` and deployed Workers. Meanwhile, an agent session writes the AI-response handler (FR-005) reading secrets via `process.env`, copied from a generic Node.js example — this works locally under `astro dev` but returns `undefined` in production because Cloudflare requires the runtime-env path instead. The broken deploy isn't caught by CI (which only runs lint + build, not a live secrets check) and isn't caught until a real user hits the fairy-response feature and gets an error instead of their personalized reading.

### Unknown Unknowns

- Workers CPU-time billing is separate from wall-clock time — an AI API call that takes 3s of wall time but sits mostly idle waiting on the LLM response consumes far less than 3s of *billed* CPU; modeling cost as request-duration would overestimate spend.
- Cloudflare Pages preview deployments are automatic per-branch and are **public URLs by default** — gating them requires configuring Cloudflare Access separately, worth doing before the profile/history features (which hold private user data per the PRD's privacy guardrail) are live in a preview.
- The `nodejs_compat` flag is gated by a `compatibility_date` in `wrangler.jsonc` — forgetting to bump it can silently freeze the project on an older polyfill set even as Cloudflare ships newer Node-compat coverage.

**Decision**: proceed with Cloudflare — risks noted and captured in the risk register below.

## Operational Story

- **Preview deploys**: Cloudflare Pages generates an automatic preview URL per branch/PR push. These are public by default — configure Cloudflare Access before any preview branch carries real user profile/history data (see privacy guardrail in the PRD).
- **Secrets**: `SUPABASE_URL` / `SUPABASE_KEY` are declared via `astro:env/server` (see `CLAUDE.md.scaffold`) and set as Cloudflare Worker secrets (`npx wrangler secret put <NAME>`) for production, or in `.dev.vars` (gitignored) for local Cloudflare dev. Never read via `process.env` — always via `locals.runtime.env` / `astro:env`.
- **Rollback**: `wrangler rollback [<version-id>]` instantly reactivates a prior Worker version across all routes; omit the version ID to roll back to the immediately preceding version. `wrangler deployments list` shows history to pick a specific target.
- **Approval**: An agent may run `wrangler deploy` for iterative preview/staging deploys unattended. A human should approve any `wrangler secret put` (new/rotated secret) and the first production deploy after a schema-relevant change (e.g. anything touching the profile/history privacy guardrail).
- **Logs**: `wrangler tail` streams live production logs (last 100 events on connect) — read-only, no dashboard needed. `wrangler deployments list` for deploy history.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Secrets read via `process.env` instead of `locals.runtime.env`/`astro:env`, silently `undefined` in production | Pre-mortem | M | H | Add a project rule (AGENTS.md/CLAUDE.md) requiring `astro:env` for all server secrets; smoke-test the deployed preview URL after any change touching Supabase auth. |
| `workerd` Node-compat gap breaks a dependency only in production, not in `astro dev` | Devil's advocate | L | M | Prefer dependencies with documented Workers/`workerd` compatibility; test against `wrangler dev` (not just `astro dev`) before merging. |
| Cloudflare Pages preview URLs are public by default, exposing profile/history data during testing | Unknown unknowns | M | H | Configure Cloudflare Access on preview deployments before any preview branch handles real user data, per the PRD's privacy guardrail. |
| Free-tier 10ms CPU cap hit by synchronous AI-response work at the edge | Devil's advocate | L | M | Delegate response generation to an external LLM API call (I/O-bound, low CPU) rather than doing heavy computation in the Worker itself. |
| `nodejs_compat` polyfill set silently frozen by a stale `compatibility_date` in `wrangler.jsonc` | Unknown unknowns | L | L | Periodically bump `compatibility_date` and re-run the test suite / smoke test after bumping. |
| Outgoing WebSocket to external services not hibernation-eligible | Devil's advocate | L (not needed for MVP) | L | Out of scope for MVP (no realtime per PRD non-goals); revisit only if realtime is added later. |

## Getting Started

1. Confirm the adapter is already installed and configured: `@astrojs/cloudflare` is in `package.json` and `astro.config.mjs` (already done by the bootstrapper).
2. Authenticate wrangler: `npx wrangler login`.
3. Set local secrets: copy `.env.example` to `.dev.vars` and fill in `SUPABASE_URL`/`SUPABASE_KEY` (see `README.md` Supabase Configuration section).
4. Deploy: `npm run build` then `npx wrangler deploy` (or push to `master` — CI in `.github/workflows/ci.yml` runs lint + build on every push/PR).
5. Set production secrets: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`, or configure them as Cloudflare Pages environment variables in the dashboard.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
