# Quality-Gates Wiring Implementation Plan

## Overview

Rollout Phase 4 (the final phase) of `context/foundation/test-plan.md` locks unit+integration into CI as a required gate alongside existing lint/build. Research (`context/changes/testing-quality-gates-wiring/research.md`) found CI currently runs lint and build only — the "unit + integration | required after §3 Phase 1" claim in `test-plan.md` §5 has been documentation-only for three phases. This plan adds the missing `npm test` step, plus a real `astro check` typecheck step (a related, adjacent gap research found: the "lint + typecheck ... already wired" claim is also inaccurate — CI's `astro sync` step generates types but doesn't check them).

## Current State Analysis

- `.github/workflows/ci.yml`'s `ci` job runs: `checkout → setup-node(22) → npm ci → npx astro sync → npm run lint → npm run build`. No test step exists anywhere under `.github/`.
- `deploy` depends on `ci` (`needs: ci`) and only runs on push to `main` — a failing `ci` job already blocks deployment by GitHub Actions' own semantics, no extra wiring needed for that guarantee.
- `package.json:14` defines `"test": "vitest run"` — the exact command to add.
- Verified directly (not just read): `npm test` passes with 43/43 tests across 14 files in a completely wiped environment (`env -i`, no secrets) — the suite needs zero new CI secrets.
- `npm run astro check` was run repeatedly during Phases 1-3's implementation and consistently passes with 0 errors — it is a real, working local command that CI simply never invokes.
- Branch-protection configuration (requiring the `ci` check before merge) is a GitHub repository setting, not a file in this repo, and is out of scope — it cannot be verified or automated from within the codebase (per this planning session's explicit decision).

### Key Discoveries:

- `.github/workflows/ci.yml` (full file, 43 lines) — the only file this plan modifies for the CI change.
- `package.json:7,11,14` — `"build"`, `"lint"`, `"test"` scripts; the new step follows the exact `run: npm run <script>` pattern already used for `lint`/`build`.
- `tests/setup/astro-env-server.ts` — the dummy-fallback env design confirmed (via direct execution) to make the suite secrets-free in CI.
- `context/foundation/test-plan.md:118-131` (§5 Quality Gates) is the authoritative list this plan is closing out; its "unit + integration" and "lint + typecheck" rows both need their `Required?`/description text reconciled with what CI will now actually run.

## Desired End State

`.github/workflows/ci.yml`'s `ci` job runs `lint → test → typecheck → build` (see Phase 1 for exact placement), so both a failing test and a failing type error block the PR check and, transitively, deployment. `test-plan.md` reflects the full rollout as complete: §3's Phase 4 row moves to `complete`, §5's gate rows accurately describe what CI runs, and §6 gets a short cookbook note. `context/changes/testing-quality-gates-wiring/change.md` reaches `status: implemented`.

### Verification

Push a commit (or open a PR) and confirm the GitHub Actions `ci` job includes visible `test` and `astro check` steps that both pass; locally, `npm test`, `npm run astro check`, and `npm run lint` all pass with exit code 0.

## What We're NOT Doing

- Not archiving `context/changes/testing-critical-path-security-auth/` (Phase 1's change folder, marked `complete` in `test-plan.md` but never moved to `context/archive/`) — this is a separate, standalone `/10x-archive` action, not part of this plan's phases, per explicit decision during planning.
- Not configuring GitHub branch-protection rules to require the `ci` check before merge — that is a repository setting outside this codebase, not something a plan phase or `/10x-implement` can verify or apply; noted as a manual follow-up for the user, not a plan step.
- Not adding e2e (Playwright) to CI — `test-plan.md` §5's "e2e on critical flows" row remains a separate, still-unimplemented gate; this plan only wires what already exists (the Vitest suite and `astro check`).
- Not changing anything about the `deploy` job beyond what `needs: ci` already provides — no new deployment gating logic.
- Not modifying any test file, source file, or the `safety-checker`/`ask.ts`/etc. code shipped in Phases 1-3 — this phase is CI configuration only.

## Implementation Approach

Add two steps to the existing `ci` job in `.github/workflows/ci.yml`, following the exact pattern already used for `lint`/`build` (`- run: npm run <script>`, no new env vars needed for `test`/`typecheck` since neither requires secrets). Then update `test-plan.md` to reflect the shipped state as the final rollout-closing action.

## Phase 1: CI Workflow Changes

### Overview

Add the `test` and `astro check` steps to the `ci` job.

### Changes Required:

#### 1. CI workflow

**File**: `.github/workflows/ci.yml`

**Intent**: Make the `ci` job run the existing Vitest suite and a real Astro typecheck, so both are required gates rather than local-only conventions. A failing test or type error must fail the job exactly the way a failing lint or build already does.

**Contract**: Within the `ci` job's `steps:` list, insert `- run: npm test` immediately after the existing `- run: npm run lint` step and before `- run: npm run build`, and insert `- run: npm run astro check` immediately after the new `npm test` step (so the final order is `checkout → setup-node → npm ci → npx astro sync → npm run lint → npm test → npm run astro check → npm run build`). Neither new step needs an `env:` block — both run with no environment variables, matching the direct verification in research.md that `npm test` passes secrets-free, and `astro check`'s prior local invocations across Phases 1-3 never required secrets either (it only type-checks, doesn't build/deploy). Leave the `deploy` job untouched.

### Success Criteria:

#### Automated Verification:

- Local dry-run of what CI will do: `npm test` exits 0
- Local dry-run: `npm run astro check` exits 0
- Local dry-run: `npm run lint` exits 0 (unchanged, confirms no regression from the edit)
- YAML is syntactically valid: `npx --yes yaml-lint .github/workflows/ci.yml 2>/dev/null || node -e "require('js-yaml') ? null : null"` — if no YAML linter is available in this project, visually confirm indentation matches the existing `- run:` steps exactly (2-space step-list indentation, no tabs)

#### Manual Verification:

- Push the change (or open a PR) and confirm in the GitHub Actions UI that the `ci` job now shows `test` and `astro check` as distinct, named steps that both pass
- Confirm the `deploy` job still only triggers on push to `main` and still depends on `ci` (i.e., `needs: ci` line is unchanged)

---

## Phase 2: Docs Wrap-Up

### Overview

Close out the entire test rollout: mark Phase 4 complete, correct the two §5 gate descriptions to match what CI now actually runs, add a §6 cookbook note, and finalize the change record.

### Changes Required:

#### 1. Rollout status and gate corrections

**File**: `context/foundation/test-plan.md`

**Intent**: Reflect CI reality accurately. The "unit + integration" gate row can now truthfully say "required" without the historical asterisk that it was undocumented CI, and the "lint + typecheck" row's "(already wired)" claim needs to note that typecheck specifically was added in this phase (it wasn't actually wired before, despite the row's prior wording).

**Contract**: §3 Phase 4 row: `Status` → `complete`, `Change folder` → `context/changes/testing-quality-gates-wiring/`. §5 Quality Gates table: update the "unit + integration" row's `Required?` cell to note it is now actually enforced in CI (not just documented as required), and update the "lint + typecheck" row's `Required?` cell from `required (already wired)` to reflect that typecheck (`astro check`) was added in Phase 4 — lint was already wired, typecheck was not until now. Add a one-line note (§6.6 per-rollout-phase notes, following the existing Phase 2/Phase 3 note format) describing what Phase 4 added: the `npm test` and `npm run astro check` CI steps, with a pointer to `.github/workflows/ci.yml`.

#### 2. Change record sync

**File**: `context/changes/testing-quality-gates-wiring/change.md`

**Intent**: Reflect that the change — and the entire 4-phase test rollout — has completed implementation.

**Contract**: Set `status: implemented` and `updated: <date of completion>`.

### Success Criteria:

#### Automated Verification:

- Full suite still passes: `npm test`
- Linting passes: `npm run lint`
- Typechecking passes: `npm run astro check`

#### Manual Verification:

- A reader unfamiliar with this phase can open `test-plan.md` §3 and see all four rollout phases marked `complete`, and §5 accurately describes the CI gates now in effect
- Note to self (not a plan action): archive `context/changes/testing-critical-path-security-auth/` via `/10x-archive` as a follow-up, since it remains un-archived despite being `complete`

---

## Testing Strategy

### Unit Tests:

- Not applicable — this phase adds no new application code, only CI configuration and documentation.

### Integration Tests:

- Not applicable.

### Manual Testing Steps:

1. After Phase 1 lands, push to a branch and open a PR (or push directly per this repo's existing workflow) and watch the Actions tab to confirm `test` and `astro check` appear as steps in the `ci` job and both succeed.
2. Temporarily introduce a failing test locally (e.g., change an assertion) and run `npm test` to confirm it would fail the CI step if pushed; revert the temporary change afterward. Do not actually push a failing test.
3. Confirm the existing `lint` and `build` steps still pass unchanged after the edit — the new steps must be pure additions, not replacements.

## Performance Considerations

`npm test` takes roughly 1 second locally (43 tests); `npm run astro check` takes a few seconds (type generation + checking). Both are negligible additions to the existing CI job's total runtime compared to `npm ci` and `npm run build`.

## Migration Notes

Not applicable — no schema or data changes; no existing CI behavior is removed, only added to.

## References

- Research: `context/changes/testing-quality-gates-wiring/research.md`
- CI file being modified: `.github/workflows/ci.yml`
- Prior phases' deferrals confirming scope: `context/changes/testing-critical-path-security-auth/plan.md:177-178`, `context/archive/2026-08-27-testing-fairy-loop-business-rules/plan.md:46`, `context/archive/2026-08-27-testing-ai-native-safety-review/plan.md:37`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: CI Workflow Changes

#### Automated

- [x] 1.1 Local dry-run of what CI will do: `npm test` exits 0 — 2dc24f1
- [x] 1.2 Local dry-run: `npm run astro check` exits 0 — 2dc24f1
- [x] 1.3 Local dry-run: `npm run lint` exits 0 — 2dc24f1
- [x] 1.4 YAML is syntactically valid / indentation matches existing steps — 2dc24f1

#### Manual

- [x] 1.5 Confirm in GitHub Actions UI that `ci` job shows `test` and `astro check` as passing steps — 2dc24f1
- [x] 1.6 Confirm `deploy` job trigger and `needs: ci` are unchanged — 2dc24f1

### Phase 2: Docs Wrap-Up

#### Automated

- [x] 2.1 Full suite still passes: `npm test`
- [x] 2.2 Linting passes: `npm run lint`
- [x] 2.3 Typechecking passes: `npm run astro check`

#### Manual

- [x] 2.4 A reader can see all four rollout phases marked `complete` in test-plan.md §3, and §5 accurately describes the CI gates in effect
