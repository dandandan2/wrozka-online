# Quality-Gates Wiring — Plan Brief

> Full plan: `context/changes/testing-quality-gates-wiring/plan.md`
> Research: `context/changes/testing-quality-gates-wiring/research.md`

## What & Why

This is rollout Phase 4 (the final phase) of `context/foundation/test-plan.md`: lock unit+integration into CI as a required gate alongside existing lint/build. Research found CI has run lint+build only for the entire rollout — the "required after Phase 1" claim for tests has been documentation-only for three phases. This plan closes that gap.

## Starting Point

`.github/workflows/ci.yml`'s `ci` job runs `checkout → setup-node → npm ci → astro sync → lint → build`. No test step exists anywhere in `.github/`. Verified directly: `npm test` (43 tests, 14 files) passes in a fully wiped, secrets-free environment — the suite Phases 1-3 built is genuinely hermetic and needs no new CI infrastructure.

## Desired End State

The `ci` job runs tests and a real typecheck as required steps; a failing test or type error fails the PR check exactly like a failing lint or build does today, and (via the existing `needs: ci` dependency) also blocks deployment. `test-plan.md` accurately reflects all four rollout phases as complete.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Step order | `lint → test → astro check → build` | Fails fast on cheap checks before spending time on the build | Plan |
| Typecheck gap | Add `npm run astro check` as its own step in this phase | Research found `astro sync` only generates types, doesn't check them, despite §5 claiming typecheck was "already wired"; the command already works locally | Research / Plan |
| Phase 1 archiving | Not part of this plan | Archiving is a separate, mechanical `/10x-archive` action; bundling it mixes unrelated concerns | Plan |
| Branch protection | Not addressed | GitHub repo setting, outside this codebase, can't be verified or automated from here | Plan |

## Scope

**In scope:**
- Add `npm test` and `npm run astro check` steps to `.github/workflows/ci.yml`'s `ci` job
- Update `test-plan.md` §3/§5/§6 to reflect the shipped CI state and close out the rollout

**Out of scope:**
- Archiving Phase 1's change folder (flagged as a follow-up, not a plan step)
- GitHub branch-protection configuration
- e2e/Playwright CI wiring
- Any change to application/test code from Phases 1-3

## Architecture / Approach

Two new `- run:` steps inserted into the existing `ci` job, following the exact pattern already used for `lint`/`build`. No new secrets, no new services, no new job — the hermetic-testing discipline from prior phases is what makes this a pure config addition.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. CI workflow changes | `test` + `astro check` steps added to `ci.yml` | None significant — both commands already pass locally with no secrets |
| 2. Docs wrap-up | `test-plan.md` closed out; all 4 rollout phases marked complete | None significant — documentation only |

**Prerequisites:** None beyond what Phases 1-3 already shipped.
**Estimated effort:** ~1 session across 2 phases (this is the smallest phase in the rollout).

## Open Risks & Assumptions

- Assumes GitHub Actions' `needs: ci` dependency is sufficient to "block deployment" without additional branch-protection configuration for merge-blocking — this is correct for the `deploy` job specifically, but doesn't stop a bad PR from being merged into `main` without separately configured branch protection (explicitly out of scope, per planning decision).

## Success Criteria (Summary)

- `npm test`, `npm run astro check`, and `npm run lint` all pass locally and in the GitHub Actions `ci` job.
- A failing test or type error, if pushed, would fail the `ci` job the same way a failing lint or build does today.
- `test-plan.md` shows all 4 rollout phases as `complete`.
