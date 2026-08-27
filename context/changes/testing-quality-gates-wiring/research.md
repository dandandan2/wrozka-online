---
date: 2026-08-27T22:52:20+02:00
researcher: Claude (dwachnicki@tlen.pl)
git_commit: e7a4ebf91e1b05967e62dc2726f579b0861f15e7
branch: main
repository: wrozka-online
topic: "Quality-gates wiring test coverage (rollout Phase 4, final phase)"
tags: [research, codebase, ci, github-actions, vitest, quality-gates]
status: complete
last_updated: 2026-08-27
last_updated_by: Claude (dwachnicki@tlen.pl)
---

# Research: Quality-gates wiring (Phase 4 — final rollout phase)

**Date**: 2026-08-27T22:52:20+02:00
**Researcher**: Claude (dwachnicki@tlen.pl)
**Git Commit**: e7a4ebf91e1b05967e62dc2726f579b0861f15e7
**Branch**: main
**Repository**: wrozka-online

## Research Question

Ground rollout Phase 4 of `context/foundation/test-plan.md` ("Quality-gates wiring"): "Lock unit+integration into CI as a required gate alongside existing lint/build." This is the final, cross-cutting phase of the test rollout — not tied to a specific numbered risk, but to locking in everything Phases 1–3 built.

## Summary

`.github/workflows/ci.yml`'s `ci` job currently runs **lint and build only** — `checkout → setup-node(22) → npm ci → npx astro sync → npm run lint → npm run build`. There is **no test step anywhere in `.github/`**, despite `test-plan.md` §5 marking "unit + integration" as `required after §3 Phase 1` since 2026-08-27 — the gate has been conceptually "required" for three phases without actually being wired into CI. Phase 4's job is exactly this: add `npm test` (currently `vitest run`, 43 tests across 14 files, all hermetic) as a required step in the existing `ci` job.

Confirmed via direct verification (not just code reading): running `npm test` in a completely wiped environment (`env -i`, zero environment variables, no secrets) passes cleanly — 43/43 tests, 14 files. This is because `tests/setup/astro-env-server.ts` supplies dummy fallback values for every env var the suite touches (`SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY`) and no test makes a real network call. **This means Phase 4 needs zero new CI secrets** — the test step can be added without touching the `SUPABASE_URL`/`SUPABASE_KEY` secrets already injected for the `build` step.

Three prior phases explicitly deferred CI wiring to this phase (quotes below), confirming Phase 4 was correctly scoped out of each of them and nothing was silently skipped. Phase 3's original "selective CI" complexity for the AI-native gate evaporated because that phase ultimately shipped a fully hermetic checker — Phase 4 inherits a simpler job than the test plan's own risk-response guidance originally anticipated: no sampling/scheduling/live-call design needed, just wire the existing hermetic suite in as a normal required step.

## Detailed Findings

### Current CI state — exact content

`.github/workflows/ci.yml` (43 lines, the only file under `.github/`):

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx astro sync
      - run: npm run lint
      - run: npm run build
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}

  deploy:
    needs: ci
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

`ci` job triggers on push to `main` and on PRs targeting `main`. `deploy` only runs on push to `main` and depends on `ci` passing (`needs: ci`). Since `deploy` requires `ci`, any test step added to `ci` that fails will also block deployment — a real gate, not just a PR annotation.

`npm test`, `vitest`, or any test-command invocation does not appear anywhere else under `.github/`.

### package.json scripts

`package.json:5-16`:
```json
"scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "astro": "astro",
    "deploy": "npm run build && wrangler deploy",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

`npm test` → `vitest run` (line 14) is the exact command to add. `npm run lint` (line 11) and `npm run build` (line 7) are what CI already calls, confirming the naming convention for a new gate step would be `npm test`. There is no separate `typecheck` script — CI's typecheck-equivalent step is `npx astro sync` (ci.yml:19) invoked directly, not through a package.json script; prior phases' plans referred to `npm run astro check` as "this project's equivalent typecheck command," but no `astro check`-named script exists in `package.json`'s scripts block (only the passthrough `"astro": "astro"`, invoked as `npm run astro check` when needed).

### Verified: the test suite needs zero new CI secrets

Direct verification this session: `env -i PATH="$PATH" HOME="$HOME" npm test` (a completely wiped environment, no `SUPABASE_URL`/`SUPABASE_KEY`/`OPENROUTER_API_KEY`, no `.env`/`.env.test` file present) → **43/43 tests pass, 14 files**. This confirms `tests/setup/astro-env-server.ts`'s dummy-fallback design (`SUPABASE_URL ?? "http://127.0.0.1:54321"`, a dummy anon JWT, `OPENROUTER_API_KEY ?? "dummy-openrouter-key"`) works exactly as intended in a secrets-free environment — the full suite is genuinely hermetic, matching every prior phase's design constraint.

**Practical consequence for the CI step**: the new `npm test` step does not need the `env:` block that `npm run build` carries (`SUPABASE_URL`/`SUPABASE_KEY` secrets) — it can run with no environment variables at all, or optionally before the `npm run build` step to fail fast without spending time on a build that would be wasted if tests fail.

### The no-Docker constraint applies to Phase 4 too

`test-plan.md:101-110` (§4 Stack, environment-constraint note) states this project's CI environment has no Docker, so every Supabase-dependent test across all three shipped phases is hermetic (mocked, not real-infra). This constraint is inherited by Phase 4: the CI gate being wired in is a gate over the *hermetic* suite, not a real-Supabase-integration gate. No new infrastructure (Docker service containers, `supabase start` in CI, etc.) needs to be added to make the test step work — the tests already don't need it.

### Prior phases' explicit deferrals to Phase 4 (confirms nothing was skipped)

- `context/changes/testing-critical-path-security-auth/plan.md:177-178` (Phase 1, not yet archived despite `complete` status in test-plan.md — see Open Questions): *"No CI wiring (`.github/workflows/ci.yml` stays lint+build-only) — that is test-plan.md §3 Phase 4 ('Quality-gates wiring'), a separate rollout phase."*
- `context/archive/2026-08-27-testing-fairy-loop-business-rules/plan.md:46` (Phase 2): *"Not re-litigating Risk #3 (AI-native safety review) or Risk cross-cutting CI wiring — those are Phase 3 and Phase 4 respectively."*
- `context/archive/2026-08-27-testing-ai-native-safety-review/plan.md:37` (Phase 3): *"Not wiring CI trigger mechanics (schedule, PR-path-filter, manual dispatch) — that is explicitly Phase 4 'Quality-gates wiring' per test-plan.md §3. This phase's tests run as part of the existing npm test hermetic suite from day one, so there is no special CI wiring left for Phase 4 to do for this risk specifically, but the general CI-gate config work stays in Phase 4's scope."*

### Phase 3's "selective CI" complexity evaporated

Phase 3's own research (`context/archive/2026-08-27-testing-ai-native-safety-review/research.md:91-143`) anticipated Phase 4 would need to design a "selective" CI trigger mechanism (sampling, scheduled run, or manual dispatch) for a live-LLM-judge gate, per `test-plan.md` §5's original "AI-native safety review | CI on PR (selective)" wording. Phase 3 ultimately shipped a fully deterministic, hermetic pattern-based checker instead (no live LLM call), and `test-plan.md` §5 was corrected accordingly to *"local + CI (part of the normal unit+integration gate)"* (confirmed current in the live file, `test-plan.md:129`). **Phase 4 therefore does not need any sampling/scheduling/live-call design** — the AI-native safety check is just another test in the same `npm test` run that Phase 4 is wiring in as a normal gate.

## Code References

- `.github/workflows/ci.yml` (all 43 lines) — the file this phase modifies; `ci` job currently ends at `npm run build` with no test step.
- `package.json:14` — `"test": "vitest run"`, the exact command to add as a CI step.
- `package.json:7,11` — `"build"` and `"lint"` scripts, the existing pattern a new step should match.
- `tests/setup/astro-env-server.ts` — the dummy-fallback env design that makes the suite secrets-free (verified directly, not just read).
- `context/foundation/test-plan.md:79-84` — §3 Phase 4 row (goal, cross-cutting, `not started`).
- `context/foundation/test-plan.md:118-131` — §5 Quality Gates table, the authoritative list of what "locking in" means for each row.
- `context/foundation/test-plan.md:101-110` — §4 no-Docker environment constraint, inherited by this phase.

## Architecture Insights

- **The "required" gate in test-plan.md §5 has been aspirational, not enforced, for three phases.** Rows have said "required after §3 Phase N" since Phase 1 shipped, but until this phase, that requirement lived only in documentation — CI itself never ran a single test. This is exactly the gap Phase 4 exists to close; it's cross-cutting infrastructure work, not a new test.
- **The project's hermetic-testing discipline (established in Phase 1, held through Phases 2-3) is what makes Phase 4 simple.** Because no test needs Docker, a real Supabase instance, or a real LLM call, wiring the gate in is a one-line CI change with no new secrets, no new services, and no new environment configuration — the hard work of making tests CI-safe was already done by each prior phase's hermetic design, not by this phase.
- **`deploy` already depends on `ci` (`needs: ci`)**, so adding a test step to the `ci` job automatically makes test failures block deployment too, not just flag the PR — no additional wiring needed to make the gate "real" (blocking), just adding the step is sufficient given the existing job dependency.

## Historical Context (from prior changes)

- `context/changes/testing-critical-path-security-auth/plan.md:177-178,150-189` and `research.md:40,113,131` (Phase 1, un-archived) — established the current CI baseline (lint+build only) and explicitly deferred all CI wiring to this phase.
- `context/archive/2026-08-27-testing-fairy-loop-business-rules/plan.md:46` (Phase 2) — confirms CI wiring was never in scope for that phase either.
- `context/archive/2026-08-27-testing-ai-native-safety-review/plan.md:37`, `research.md:91-143` (Phase 3) — the most detailed prior discussion of what a "selective" CI gate might have required, now moot since Phase 3 went fully hermetic.
- `context/foundation/test-plan.md` §5 — the authoritative, currently-accurate gate table this phase is implementing.

## Related Research

- `context/changes/testing-critical-path-security-auth/research.md` — Phase 1 research; first to document the CI baseline.
- `context/archive/2026-08-27-testing-ai-native-safety-review/research.md` — Phase 3 research; most detailed prior CI-gate design discussion (superseded by the hermetic pivot).

## Open Questions

- **Phase 1's change folder (`context/changes/testing-critical-path-security-auth/`) is marked `complete` in `test-plan.md` §3 but has never been archived**, unlike Phases 2 and 3. This is a pre-existing housekeeping gap unrelated to Phase 4's actual work — worth flagging to the user, but not something to fix as part of this phase's plan (archiving is a separate, explicit `/10x-archive` action, and this phase's scope is CI wiring, not archive hygiene). Recommend archiving it in a follow-up action, not silently bundled into Phase 4.
- **Should the new `npm test` step run before or after `npm run lint`, and should it also run before `npm run build`?** Research confirms the test suite needs no build artifacts and no secrets, so ordering is a planning-time cost/signal decision (fail fast on tests before spending time on lint/build, vs. keep the existing lint-first order and just append tests) rather than something the code dictates. `/10x-plan` should decide this explicitly.
- **Should `astro check` (the typecheck-equivalent prior phases referenced in their own verification steps) also be added as an explicit CI step**, given `test-plan.md` §5's "lint + typecheck" gate is marked `required (already wired)` but the actual CI step is `npx astro sync` (which generates types, not a full type-check) rather than a true `astro check` invocation? This is a pre-existing gap in the "already wired" claim, discovered as a side effect of this research, and not explicitly named in Phase 4's one-line goal ("Lock unit+integration into CI") — worth surfacing to the user during planning to decide if it's in scope for this phase or a separate follow-up.
