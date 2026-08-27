---
date: 2026-08-27T21:18:00+02:00
researcher: Claude (dwachnicki@tlen.pl)
git_commit: 05b1784dc17a2e3660247048edf596381050c7ab
branch: main
repository: wrozka-online
topic: "Fairy-loop business-rule integrity test coverage (rollout Phase 2) — Risks #4, #5, #7"
tags: [research, codebase, fairy-responses, ask-api, profile-update, openrouter, delete, style-pool, about-me, vitest]
status: complete
last_updated: 2026-08-27
last_updated_by: Claude (dwachnicki@tlen.pl)
---

# Research: Fairy-loop business-rule integrity (Phase 2 — Risks #4, #5, #7)

**Date**: 2026-08-27T21:18:00+02:00
**Researcher**: Claude (dwachnicki@tlen.pl)
**Git Commit**: 05b1784dc17a2e3660247048edf596381050c7ab
**Branch**: main
**Repository**: wrozka-online

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md` ("Fairy-loop business-rule integrity") for risks:

- **#4** — Delete nie usuwa wpisu z puli wzorców stylu (FR-009).
- **#5** — AI-provider (OpenRouter) failure/timeout leaves an inconsistent `fairy_responses` row or an unclear error.
- **#7** — Brak serwerowego limitu długości pola "o sobie" (only UI-enforced).

Per the change's Notes, the goal is to determine what the code *actually* does at each of these points — not assume the risk description is accurate — and identify the real testable gap.

## Summary

All three risks, as literally worded in the test plan, turn out to be **already mitigated by the code** — but each has a **real, narrower gap: zero automated test coverage** proving the mitigation holds. This matches the test plan's own framing ("risks are scenarios... research is the ground truth" — §1 principle #3) and its instruction for Risk #7 specifically ("this may already be covered and needs confirming rather than assuming a gap," per `change.md`).

| Risk | As-worded claim | What the code actually does | Real gap |
|---|---|---|---|
| #4 | Delete doesn't remove entry from style pool | Hard `DELETE` on `fairy_responses`; the "style pool" is just a live `SELECT ... WHERE liked = true` re-run on every `ask()` call, no cache — a deleted row is immediately and correctly excluded | No regression test proves create→like→delete→ask excludes the deleted answer; a future soft-delete or cache change could silently reintroduce the bug undetected |
| #5 | AI failure leaves a corrupt/partial DB row | `ask.ts` calls `generateFairyAnswer()` and only inserts into `fairy_responses` **after** a successful, content-validated response; on any AI failure/timeout the DB is never touched, and the user gets a clean generic redirect message | Zero test coverage of the failure/timeout branch — no test simulates OpenRouter failure and asserts (a) no insert happens and (b) the user-facing redirect is clean |
| #7 | Only the UI enforces the 500-char limit | Server-side check in `profile/update.ts` (`ABOUT_ME_MAX_LENGTH = 500`) rejects oversized input with a redirect+error *before* any Supabase write; a DB-level `CHECK` constraint on `about_me` backs it up as defense-in-depth | No test POSTs an oversized `about_me` directly to the API and asserts the rejection path fires |

Existing Phase 1 test infrastructure (`tests/helpers/mock-supabase-client.ts`, `mock-supabase-auth.ts`, `fake-api-context.ts`) is directly reusable for #4 and #7. Risk #5 needs one new piece of infrastructure: a `fetch`-boundary mock for OpenRouter (MSW or `vi.stubGlobal("fetch", ...)`), per `test-plan.md`'s explicit stack guidance to mock the external HTTP boundary rather than the internal `src/lib/ai/fairy.ts` module (the anti-pattern Phase 1 already fell into incidentally in `api-fairy-ownership.test.ts`).

## Detailed Findings

### Risk #4 — Delete / style-pool consistency

**Delete handler** — `src/pages/api/fairy/delete.ts:22`
```ts
const { error } = await supabase.from("fairy_responses").delete().eq("id", id).eq("user_id", user.id);
```
- Hard delete (real SQL `DELETE`), not a flag flip. Contrast with the "like" toggle in `src/pages/api/fairy/like.ts:29-44`, which does a genuine soft-flag update (`update({ liked: !current.liked })`).
- Ownership enforced both app-side (`.eq("user_id", user.id)` from `locals.user.id`) and DB-side via RLS policy `fairy_responses_delete_own` (`supabase/migrations/20260825120100_fairy_data_foundation_rls.sql:35-36`).

**Style-pattern / "liked answers" query** — `src/pages/api/fairy/ask.ts:46-53`
```ts
const { data: likedRows } = await supabase
  .from("fairy_responses")
  .select("answer")
  .eq("user_id", user.id)
  .eq("liked", true)
  .order("created_at", { ascending: false })
  .limit(10);
```
- Feeds into `generateFairyAnswer(profile, question, likedAnswers)` (`ask.ts:57-61`), consumed by `describeStyleReference(likedAnswers)` in `src/lib/ai/fairy.ts:26-28,35,50`.
- There is no separate "style pool" table — the pool is simply `fairy_responses` rows where `liked = true`, backed by a purpose-built index `fairy_responses_user_liked_created_idx on (user_id, liked, created_at desc)` (`supabase/migrations/20260825120000_fairy_data_foundation.sql:14-24`).
- No caching layer anywhere in `src/lib/ai/` (grepped, no hits) — the query runs fresh on every `ask()` call, so a deleted row cannot reappear.

**Conclusion**: the risk as literally worded is not reproducible against current code. A hard-deleted row is gone from the table and the liked-answers query re-reads live state each time. The one adjacent, distinct concern — that *previously generated answer text* which stylistically mimicked a since-deleted liked answer isn't retroactively scrubbed — is a "prompt influence already baked into old output" issue, not a "deleted row still returned by the query" bug, and is out of scope for Risk #4 as worded.

**Existing tests**: `tests/unit/api-fairy-ownership.test.ts` covers ownership filtering on `delete.ts` (lines 62-77) and on `ask.ts`'s liked-answers lookup (lines 16-39), but never asserts the `liked = true` filter specifically, and no test exercises the create→like→delete→ask sequence. **This is the real gap.**

### Risk #5 — AI-provider failure/timeout and DB consistency

**Ordering in the ask handler** — `src/pages/api/fairy/ask.ts`
- Lines 57-61: `generateFairyAnswer(...)` is awaited first, inside a `try`.
- Lines 62-67: on throw, caught and redirected with a generic Polish message (`"Wróżka nie mogła odpowiedzieć. Spróbuj ponownie."`) — **no DB write occurs**.
- Lines 69-73: only after a successful, validated AI response does `supabase.from("fairy_responses").insert({ user_id, question, answer })` run.
- Lines 75-79: if the insert itself fails, same generic redirect — the AI answer is silently discarded (a "lost answer," not a "corrupt row," since the insert is atomic and never partially applied).

**Provider client** — `src/lib/ai/fairy.ts`
- Line 5: `REQUEST_TIMEOUT_MS = 15_000`; line 54: `signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)` — a real timeout is configured, not an indefinite hang.
- Lines 57-61: non-OK HTTP response → raw body logged via `console.error` (server-side only), then throws `Error("OpenRouter request failed with status ${response.status}")` (status code only in the thrown message, no leaked body).
- Lines 63-71: missing `choices[0].message.content` → full response JSON logged server-side, throws `Error("OpenRouter response missing answer content")`.
- No local `try/catch` inside `generateFairyAnswer` — errors propagate up to `ask.ts`'s catch.

**User-facing error**: always the same clean generic redirect message in both the AI-failure and post-success-insert-failure cases (`ask.ts:62-67`, `75-79`) — no provider internals leaked, but also no differentiation between failure modes for the user.

**Conclusion**: the ordering (`generate` → validate content → `insert`) already makes the "inconsistent row" scenario unreachable through this handler as written — there is no pre-AI-call insert, no upsert-then-update pattern, and empty/null AI content is explicitly guarded against (`fairy.ts:68-71`). This would only become a real risk if future code introduced a "pending row" written before the AI call.

**Existing tests**: `tests/unit/api-fairy-ownership.test.ts:6` mocks `generateFairyAnswer` to always resolve — the failure/timeout branch, the insert-after-failure branch, and the missing-content branch are entirely untested. Grep across `tests/` for `mockRejectedValue`/OpenRouter-failure simulation returns nothing. **This is the real gap.**

### Risk #7 — `about_me` server-side length limit

**Server-side check** — `src/pages/api/profile/update.ts`
- Line 4: `const ABOUT_ME_MAX_LENGTH = 500;`
- Lines 32-36:
```ts
if (typeof aboutMe === "string" && aboutMe.length > ABOUT_ME_MAX_LENGTH) {
  return context.redirect(
    `/dashboard/profile?error=${encodeURIComponent(`"O sobie" może mieć maksymalnie ${ABOUT_ME_MAX_LENGTH} znaków.`)}`,
  );
}
```
- The check runs before any Supabase write; violation is rejected (redirect + error param), not silently truncated. The constant is actually used, not dead code.

**Database-level backstop** — `supabase/migrations/20260825120000_fairy_data_foundation.sql:9`
```sql
about_me text check (about_me is null or char_length(about_me) <= 500),
```
No later migration alters this constraint — it remains active as defense-in-depth even if the API check were ever bypassed.

**Client-side (UX only)** — `src/components/dashboard/ProfileForm.tsx:16,88` — a separately-defined `ABOUT_ME_MAX_LENGTH = 500` constant (not shared/imported from the server file) drives a `maxLength` attribute — bypassable by posting directly to the API, but the server/DB layers above don't depend on it.

**Other write paths**: grepped all of `src/pages/api` — `profile/update.ts` is the only writer of `profiles.about_me`. `ask.ts` only reads it (line 38); `like.ts` never touches `profiles`.

**Conclusion**: Risk #7 as worded ("only UI, no server enforcement") is factually incorrect — enforcement exists at two independent layers. The real gap is narrower: **no automated test exercises the 500-char rejection path.**

**Existing tests**: `tests/unit/api-profile-ownership.test.ts` covers ownership filtering only; it never sends an oversized `about_me`. **This is the real gap.**

### Existing test infrastructure (reusable for Phase 2)

- `tests/helpers/mock-supabase-client.ts` — hermetic query-builder mock (`createMockQueryClient`, `eqArgsFor`). Directly reusable for #4 (assert the `liked = true` filter and exclusion after delete) and #7 (assert `update` is never called when validation fails).
- `tests/helpers/mock-supabase-auth.ts` — Auth SDK mock, not directly needed for #4/#5/#7 but available.
- `tests/helpers/fake-api-context.ts` — `createFakeContext({ userId, formData, url })` for constructing a fake `APIContext`; needed by all three risk tests to invoke route handlers directly.
- `vitest.config.ts` — `test.include: ["tests/**/*.test.ts"]`, so no new directory/config is needed; any new Phase 2 test file can live under `tests/unit/` (or a new subfolder) and will be picked up automatically. Path alias `@/*` → `src/*`; `astro:env/server` aliased to `tests/setup/astro-env-server.ts`, which already exports `OPENROUTER_API_KEY` (dummy value) — no new env plumbing needed for #5.
- **Missing piece for #5**: no MSW or `fetch`-mock helper exists yet (grepped `tests/` for `msw|nock|mock.*fetch` — zero hits). `test-plan.md` §4 (Stack) explicitly instructs: *"Mock only the external OpenRouter HTTP boundary; never mock internal `src/lib/` modules."* The existing incidental pattern in `api-fairy-ownership.test.ts:6` (`vi.mock("@/lib/ai/fairy", ...)`) is the anti-pattern to avoid for the Phase 2 AI-failure test specifically — a new helper (e.g. `tests/helpers/mock-openrouter-fetch.ts`) stubbing global `fetch` (`vi.stubGlobal("fetch", ...)`) to simulate non-OK status, timeout, and malformed-JSON responses against `src/lib/ai/fairy.ts:37-74` is the piece to build.
- Phase 1's `plan.md` (`context/changes/testing-critical-path-security-auth/plan.md:180-183`) explicitly deferred all three risks to Phase 2 and confirms no Docker is available in this environment (`supabase start` cannot run) — every Phase 2 test must remain hermetic (mocked Supabase / mocked `fetch`), consistent with Phase 1's approach.

## Code References

- `src/pages/api/fairy/delete.ts:22` — hard `DELETE` on `fairy_responses`, scoped by `id` + `user_id`.
- `src/pages/api/fairy/like.ts:29-44` — soft-flag `liked` toggle (contrast with delete).
- `src/pages/api/fairy/ask.ts:46-53` — liked-answers query (`liked = true`, limit 10) feeding the style-pattern context.
- `src/pages/api/fairy/ask.ts:57-79` — generate→validate→insert ordering and both error redirects.
- `src/lib/ai/fairy.ts:5,26-28,35,37-74` — `REQUEST_TIMEOUT_MS`, `describeStyleReference`, `generateFairyAnswer`, timeout/non-OK/missing-content handling.
- `src/pages/api/profile/update.ts:4,20,32-36,38-45` — `ABOUT_ME_MAX_LENGTH`, length check, redirect-on-violation, the actual `.update()` call.
- `src/components/dashboard/ProfileForm.tsx:16,88` — client-side `maxLength` (UX only).
- `supabase/migrations/20260825120000_fairy_data_foundation.sql:9,14-24` — `about_me` CHECK constraint; `fairy_responses` schema + `fairy_responses_user_liked_created_idx`.
- `supabase/migrations/20260825120100_fairy_data_foundation_rls.sql:35-36` — `fairy_responses_delete_own` RLS policy.
- `tests/unit/api-fairy-ownership.test.ts:6,16-39,62-77` — existing ownership tests on `ask.ts`/`delete.ts`; the `generateFairyAnswer` always-resolves mock (anti-pattern for #5's new test).
- `tests/unit/api-profile-ownership.test.ts` — existing ownership test on `profile/update.ts` (no length-limit case).
- `tests/helpers/mock-supabase-client.ts:25,82` — `createMockQueryClient`, `eqArgsFor`.
- `tests/helpers/fake-api-context.ts:17` — `createFakeContext`.
- `tests/setup/astro-env-server.ts:16` — `OPENROUTER_API_KEY` test stub.
- `vitest.config.ts` — test include pattern and aliases.

## Architecture Insights

- **No caching layer anywhere in the fairy-loop code** — every read (liked answers, profile) is a live Supabase query per request. This removes an entire class of staleness bugs the risk descriptions worried about, but also means there's no cache-invalidation logic to test.
- **Consistent ordering pattern**: both `ask.ts` (AI call before insert) and `profile/update.ts` (validation before write) follow "validate/generate fully, then write" — no route in this codebase does a speculative/pending write before an external call completes.
- **Defense in depth is a repeated pattern**: ownership checks exist at both the app layer (`.eq("user_id", ...)`) and DB layer (RLS policies); the `about_me` limit exists at both the app layer and a DB `CHECK` constraint. Phase 2 tests should assert the app-layer behavior (since DB-layer enforcement can't be tested hermetically without Docker) but the research should keep noting the DB layer as backup, per Phase 1's established convention.
- **Test-plan's own risk framing already anticipated this outcome**: §1 principle #3 states research — not the risk map — is the ground truth on where a failure actually lives, and the Phase 2 change's own `change.md` notes flagged Risk #7 as "may already be covered." This session confirms that pattern extends to Risks #4 and #5 as well: none of the three risks describe a real code defect; all three describe a real **test-coverage** gap.

## Historical Context (from prior changes)

- `context/changes/testing-critical-path-security-auth/plan.md:180-183` — explicit "What We're NOT Doing" list assigning Risks #4, #5, #7 to Phase 2, confirming they were deliberately left untouched by Phase 1.
- `context/changes/testing-critical-path-security-auth/plan.md:23-57,88-92` — no-Docker constraint; every "integration-shaped" test in this project is hermetic (mocked Supabase client/Auth), a constraint Phase 2 must also work within.
- `context/changes/testing-critical-path-security-auth/plan.md:145-148` — precedent of reusing existing mock helpers across phases rather than building new primitives per phase (applies to `mock-supabase-client.ts` for #4/#7).
- `context/changes/testing-critical-path-security-auth/plan.md:202-211` — hermetic-test design principle: assert against an independently-constructed oracle, not a mirror of the code's own logic, and include at least one case where a client-supplied value diverges from the correct one. Directly applicable to Risk #4's test (must independently construct the deleted answer's content and prove its absence from the query result feeding the AI prompt).
- `context/changes/testing-critical-path-security-auth/research.md:70-82,124` — prior research already located `ask.ts:46-52`'s liked-answers query and `update.ts:4`'s `ABOUT_ME_MAX_LENGTH`, corroborating this session's findings.
- `context/foundation/test-plan.md` §2 Risk Response Guidance (rows for #4, #5, #7) — the "must challenge" / "anti-pattern to avoid" columns for each risk, all addressed in Detailed Findings above.
- `context/foundation/test-plan.md` §4 Stack — explicit instruction to mock the OpenRouter HTTP boundary, not internal `src/lib/` modules, for Phase 2.

## Related Research

- `context/changes/testing-critical-path-security-auth/research.md` — Phase 1 research (auth, ownership, rate-limiting).
- `context/changes/testing-critical-path-security-auth/plan.md` — Phase 1 plan, including the no-Docker revision note and hermetic-test design principles reused here.

## Open Questions

- Should Risk #4's test also cover the "AI-prompt payload" boundary directly (asserting on the arguments passed to `generateFairyAnswer`), or is asserting on the mocked Supabase query result sufficient? (Recommend: assert both — the query result *and* that `generateFairyAnswer` receives the post-delete `likedAnswers` array, per the "must challenge" guidance in test-plan.md §2 row #4.)
- For Risk #5, should the new `fetch`-mock helper also simulate a genuine timeout (via a never-resolving promise + real `AbortSignal.timeout`), or is asserting on a rejected/aborted fetch sufficient? A true timeout test would need `vi.useFakeTimers()` or `AbortSignal` interaction — worth deciding during `/10x-plan`.
- Should the test-plan.md risk descriptions for #4/#5/#7 be revised to reflect "enforcement exists, coverage doesn't" now that this research has confirmed it, or left as-is with this research.md as the correction of record? (Recommend surfacing this to `/10x-test-plan --refresh` after Phase 2 ships, not mid-phase.)
