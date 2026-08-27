---
date: 2026-08-27T22:12:20+02:00
researcher: Claude (dwachnicki@tlen.pl)
git_commit: 40268de4edeaa48378b324dc109000602d1bb2a6
branch: main
repository: wrozka-online
topic: "AI-native safety review test coverage (rollout Phase 3) — Risk #3"
tags: [research, codebase, fairy-ai, disclaimer, safety, openrouter, llm-judge, system-prompt]
status: complete
last_updated: 2026-08-27
last_updated_by: Claude (dwachnicki@tlen.pl)
---

# Research: AI-native safety review (Phase 3 — Risk #3)

**Date**: 2026-08-27T22:12:20+02:00
**Researcher**: Claude (dwachnicki@tlen.pl)
**Git Commit**: 40268de4edeaa48378b324dc109000602d1bb2a6
**Branch**: main
**Repository**: wrozka-online

## Research Question

Ground rollout Phase 3 of `context/foundation/test-plan.md` ("AI-native safety review") for Risk #3: "Wróżka generuje treść czytaną jako realna porada medyczna/finansowa/prawna mimo disclaimeru" (the AI fairy generates content read as real medical/financial/legal advice despite a disclaimer).

Per test-plan.md §2 Risk Response Guidance, the research must ground: "Actual model/provider in use, any moderation or post-filter step." The likely cheapest layer is flagged as "AI-native (LLM-as-judge or pattern-based check)," and the anti-pattern to avoid is "Asserting on exact generated string (oracle problem)."

## Summary

There is **no runtime safety net** protecting against Risk #3 today — mitigation rests entirely on two static layers, neither of which is enforced against the model's actual output:

1. A single soft sentence in the system prompt (`src/lib/ai/fairy.ts:13-17`) instructing a free-tier model (`minimax/minimax-m3:free`) not to give medical/financial/legal advice.
2. Static, always-rendered UI disclaimer text (`src/components/dashboard/AnswerCard.tsx:23-26`, `src/pages/dashboard/history.astro:47-51`) shown below every answer regardless of its content.

No moderation call, keyword filter, or secondary validation step exists between the model's raw response and what gets persisted to `fairy_responses` and shown to the user. No existing test touches content safety or disclaimer presence — everything AI-related in `tests/` today is either hermetic provider-failure testing or ownership/plumbing testing. There is also no existing pattern in this codebase for a test that makes a genuine outbound LLM call (an LLM-as-judge test would be new infrastructure, distinct in kind from the existing `mock-openrouter-fetch.ts`, which exists specifically to *avoid* real calls).

This confirms the risk is real and unmitigated at the code level — Phase 3's job is to build the first AI-native (LLM-judge) test layer this project has, from zero.

## Detailed Findings

### Current safety mitigation (or lack thereof)

**System prompt** — `src/lib/ai/fairy.ts:13-17`:
```
Jesteś "Wróżbitą Online" — spójną, ciepłą i klimatyczną postacią wróżki.
Odpowiadasz na pytania użytkownika w charakterystycznym, "magicznym" stylu, ale zwięźle.
Nigdy nie udzielaj porad medycznych, finansowych ani prawnych — jeśli pytanie tego dotyczy,
odpowiedz w swoim stylu, ale bez konkretnych zaleceń w tych obszarach, kierując rozmowę
z powrotem w stronę refleksji i rozrywki. Twoje odpowiedzi to rozrywka, nie realna porada.
```
This is the *only* safety instruction sent to the model — no few-shot examples, no explicit refusal format, no instruction to self-tag a disclaimer in the output. It is a soft directive the model may or may not reliably obey (exactly the "must challenge" the test-plan flags: `"System prompt says X" ≠ "model reliably obeys X"`).

**Provider and model** — OpenRouter, called directly via `fetch` to `https://openrouter.ai/api/v1/chat/completions` (`src/lib/ai/fairy.ts:37`). Model string: `"minimax/minimax-m3:free"` (`fairy.ts:3`) — a free-tier model with no model-level moderation/safe-mode parameter set in the request body (`fairy.ts:43-53`). API key sourced from `OPENROUTER_API_KEY` env var.

**No post-generation moderation** — `generateFairyAnswer` (`fairy.ts:32-74`) takes `data.choices[0].message.content` and returns it verbatim (`fairy.ts:66,73`); the only checks are presence/absence of content and HTTP status, never content safety. The caller `src/pages/api/fairy/ask.ts:57-73` inserts that string straight into `fairy_responses` (line 71) with no keyword filter, regex scan, second-LLM moderation call, or human review step. Grep across `src/lib/ai/` and `src/pages/api/fairy/` for `moderat|safety|filter|validate` returns nothing relevant.

**UI-level disclaimer** — shown in two places, identical wording, always rendered (not conditional on response content, not a click-to-acknowledge step):
- `src/components/dashboard/AnswerCard.tsx:23-26`: `"To rozrywka, nie porada — nie zastępuje profesjonalnej pomocy medycznej, finansowej ani prawnej."`
- `src/pages/dashboard/history.astro:47-51`: same text, shown once above the history list when non-empty.

**Adjacent constraints** — `MAX_TOKENS = 400` (`fairy.ts:4`) caps length but not content; `QUESTION_MAX_LENGTH = 500` (`ask.ts:5`) caps input; no rate limiting exists on `/api/fairy/ask` (unlike the auth flows, which do have it — grep for `rate.?limit|throttle` across `src/` only matches `src/lib/auth-errors.ts`). A user could repeatedly probe the fairy with medical/financial/legal-shaped questions with no request-frequency guardrail.

**No existing safety tests** — `tests/unit/api-ask-provider-failure.test.ts` tests only provider-failure/redirect behavior; `tests/unit/api-fairy-ownership.test.ts` and `tests/unit/api-fairy-delete-style-pool.test.ts` mock `generateFairyAnswer` to return `"mock answer"` and test ownership/style-pool plumbing, not content. Grep across `tests/` for `disclaimer|moderat|safety` returns no relevant hits.

### Governing constraints from test-plan.md (verbatim)

**§2 Risk Map, row #3**:
> Wróżka generuje treść czytaną jako realna porada medyczna/finansowa/prawna mimo disclaimeru | High | Medium | PRD FR-005 Socratic resolution (explicit business rule), hot-spot dir `src/lib/ai/` (5 commits/30d)

**§2 Risk Response Guidance, row #3**:
> What would prove protection: Response to a medical/financial/legal-shaped question stays in-character and avoids concrete recommendations
> Must challenge: "System prompt says X" ≠ "model reliably obeys X"
> Context to ground: Actual model/provider in use, any moderation or post-filter step
> Likely cheapest layer: AI-native (LLM-as-judge or pattern-based check) — classic assertion can't judge freeform text
> Anti-pattern to avoid: Asserting on exact generated string (oracle problem)

**§7 What We Deliberately Don't Test** (hard design constraint on how a Phase 3 test may be written):
> **Dokładna treść wygenerowanej wróżby** — nie asertujemy konkretnej, kreatywnej treści odpowiedzi AI (nie da się sensownie zweryfikować "dobra wróżba"); testujemy tylko strukturę i bezpieczeństwo (Risk #3, AI-native layer), nigdy dosłowną treść. Re-evaluate if the product starts scoring or ranking response quality. (Source: Phase 2 interview Q5.)

This means any LLM-judge rubric for Phase 3 must score against a safety/structure rubric (e.g., "stays in-character," "avoids concrete medical/financial/legal recommendation," "redirects to reflection/entertainment") — it must never compare the fairy's actual creative wording to a reference answer.

**§4 Stack, "(optional) AI-native" row**:
> LLM-as-judge script (checked: 2026-08-27) | n/a | When NOT to use: never for deterministic assertions (data isolation, delete-cascade, error handling) — only for judging freeform generated text against a safety rubric

**§4 Stack grounding tools note** — every line explicitly marked unchecked in the session that wrote test-plan.md:
> Docs: none available in current session — not checked via a docs MCP...
> Search: none available in current session...

This means the "LLM-as-judge script" tool recommendation was never externally verified — it is an asserted convention, not a grounded one. This session had `WebSearch`/`WebFetch` tools available but grounding tool choice is `/10x-plan`'s job, not `/10x-research`'s (this document stays in the "signal, not knowledge extracted from code" lane per test-plan.md §1 principle #3); flagging this gap for `/10x-plan` to close if it wants external verification of current LLM-judge conventions before committing to an implementation approach.

**§5 Quality Gates row**:
> AI-native safety review | CI on PR (selective) | required after §3 Phase 3 | disclaimer/safety-framing regressions in generated content

"Selective" implies this gate should not run on every PR — likely a cost/latency concern for making a real LLM call in CI. This is a design decision Phase 3's plan needs to make explicit (sampling, manual trigger, scheduled run, etc.).

**§6.5 cookbook placeholder** (currently a stub):
> TBD — see §3 Phase 3 for the LLM-judge pattern on generated fairy responses.

### No prior phase touches Risk #3

- `context/archive/2026-08-27-testing-fairy-loop-business-rules/plan.md:46` explicitly defers it: "Not re-litigating Risk #3 (AI-native safety review) or Risk cross-cutting CI wiring — those are Phase 3 and Phase 4 respectively."
- `context/changes/testing-critical-path-security-auth/` (Phase 1, status `complete` per test-plan.md but not yet archived) — grepped `plan.md`/`research.md` for AI-native/LLM-judge/Risk #3/medical/financial/legal/disclaimer: zero matches. Phase 1 never touches this risk.
- No existing infrastructure anywhere in `tests/` makes a genuine outbound LLM call. `tests/helpers/mock-openrouter-fetch.ts` is the opposite — it exists specifically to stub `fetch` and avoid real network calls, per its own doc comment. `tests/setup/astro-env-server.ts:14-16` defines `OPENROUTER_API_KEY` with a dummy fallback, confirming no test today expects a real key. An LLM-judge helper would be new infrastructure of a fundamentally different kind (deliberately live, not hermetic) than everything Phase 1/2 built.

## Code References

- `src/lib/ai/fairy.ts:3` — model string `"minimax/minimax-m3:free"`.
- `src/lib/ai/fairy.ts:13-17` — the system prompt's only safety instruction.
- `src/lib/ai/fairy.ts:32-74` — `generateFairyAnswer`; no content-safety check on the returned string.
- `src/lib/ai/fairy.ts:37` — the OpenRouter `fetch` call (the sole external boundary).
- `src/pages/api/fairy/ask.ts:57-73` — the AI answer is inserted into `fairy_responses` verbatim, no moderation step.
- `src/components/dashboard/AnswerCard.tsx:23-26` — static UI disclaimer shown under every answer.
- `src/pages/dashboard/history.astro:47-51` — static UI disclaimer shown above the history list.
- `src/lib/ai/fairy.ts:4-5` — `MAX_TOKENS`/`REQUEST_TIMEOUT_MS` (length/reliability, not safety, constraints).
- `src/pages/api/fairy/ask.ts:5,30-34` — `QUESTION_MAX_LENGTH` input cap.
- `tests/helpers/mock-openrouter-fetch.ts` — existing hermetic fetch-stub pattern (contrast case: a Phase 3 LLM-judge helper would need to make a *real* call, the opposite of this helper's purpose).
- `tests/setup/astro-env-server.ts:14-16` — `OPENROUTER_API_KEY` dummy-fallback pattern, confirming no live-call precedent exists yet.
- `context/foundation/test-plan.md:45,67,83,99,112-116,129,194-196,216-220` — all Risk #3 and AI-native-layer governing text (Risk Map, Risk Response Guidance, Phased Rollout, Stack, Stack grounding tools, Quality Gates, §6.5 cookbook stub, §7 negative-space constraint).

## Architecture Insights

- **This project separates "prompt-level intent" from "enforced behavior" everywhere except AI safety.** Ownership checks are enforced both at the app layer and via RLS (defense in depth, per Phase 2's research). The `about_me` length limit is enforced both server-side and via a DB `CHECK` constraint. Content safety has no such second layer — it is prompt-only, with a UI caption as the sole (non-enforcing) backstop.
- **The disclaimer is presentation, not protection.** Because `AnswerCard.tsx`'s disclaimer text is static and unconditional, it does not change based on whether the actual response contains advice-like content — it can't "catch" anything, it can only add a caption. A test proving "disclaimer is rendered" would pass even if the model returned literal medical dosing instructions.
- **No existing pattern for a live-call test in this codebase.** Every AI-adjacent test built in Phase 1/2 is hermetic by design (matches the project's no-Docker, no-live-external-call convention established in Phase 1). An LLM-judge test necessarily breaks that convention on purpose — Phase 3's plan should treat this as a deliberate, documented exception (e.g., explicitly gated behind an env var or a "selective" CI trigger per §5), not an accidental inconsistency.
- **"Selective" CI gate (§5) implies sampling or manual-trigger design**, not a per-PR blocking gate — this needs to be an explicit planning decision, since a naive "run on every PR" design would add real per-PR cost/latency for a probabilistic check.

## Historical Context (from prior changes)

- `context/archive/2026-08-27-testing-fairy-loop-business-rules/plan.md:46` — explicit "not doing" note deferring Risk #3 to this phase.
- `context/archive/2026-08-27-testing-fairy-loop-business-rules/research.md:157` — confirms Risk #3 was never bundled into Phase 2's "not doing" list; it was always slated as its own phase.
- `context/changes/testing-critical-path-security-auth/` — Phase 1 (status `complete`, not yet archived) — no overlap with Risk #3; established the hermetic-testing convention Phase 3 will need to deliberately break for the LLM-judge layer.
- `context/foundation/test-plan.md` §7 — the Phase 2 interview (Q5) is the source of the "never assert exact content" constraint that binds Phase 3's design.

## Related Research

- `context/archive/2026-08-27-testing-fairy-loop-business-rules/research.md` — Phase 2 research (delete/style-pool, AI-provider failure, about_me length); established the hermetic Supabase/fetch mocking conventions Phase 3 will contrast against.
- `context/archive/testing-critical-path-security-auth/research.md` (or equivalent path if since archived) — Phase 1 research (auth, ownership).

## Open Questions

- **Which LLM should serve as the judge, and should it be a different model/provider than the one under test?** Using the same free-tier model (`minimax/minimax-m3:free`) as both subject and judge risks correlated blind spots (a model that fails to follow the safety instruction as the *responder* might also fail to correctly *judge* the same kind of failure). Worth deciding during `/10x-plan` whether to use a stronger/different judge model, and whether that requires a second API key or provider.
- **What exact rubric should the judge score against?** Candidates grounded in the code: (a) does the response avoid a concrete medical/financial/legal recommendation, (b) does it stay in the "Wróżbita Online" character/tone, (c) does it redirect toward reflection/entertainment when the question is medical/financial/legal-shaped. This needs to be turned into a concrete pass/fail or scored rubric during planning — this research only confirms the constraint (never exact-string) and the source material (the system prompt's own instruction) to derive the rubric from.
- **Should the CI gate be "selective" via sampling (e.g., run against N adversarial-shaped fixture questions on every PR touching `src/lib/ai/`), a scheduled/nightly run, or a manual pre-release check?** test-plan.md §5 says "selective" but doesn't specify the mechanism — this is a planning decision, not something research can determine from the code as it stands today (no CI config for this exists yet; Phase 4 "Quality-gates wiring" is the cross-cutting CI phase, so Phase 3's plan should design the test itself and note how it expects to be invoked, while final CI wiring may be Phase 4's job).
- **Should a docs/search MCP be consulted during planning to verify current LLM-as-judge conventions**, since test-plan.md flagged this as unchecked? This research deliberately did not do so (out of scope for code-grounding research per test-plan.md §1 principle #3), but `/10x-plan` has `WebSearch`/`WebFetch` available in this session and could close that gap before committing to an implementation approach.
