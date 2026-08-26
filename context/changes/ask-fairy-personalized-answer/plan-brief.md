# Profile + Question + Personalized Fairy Answer — Plan Brief

> Full plan: `context/changes/ask-fairy-personalized-answer/plan.md`

## What & Why

Roadmap north star S-01: a logged-in user with a completed profile can ask
the fairy a question and get a generated, personalized answer, and can
like it. This is the smallest end-to-end flow that proves the product's
core hypothesis — that combining profile context with AI generation
actually produces a compelling, "magic" response worth returning for.

## Starting Point

`profiles`/`fairy_responses` tables and RLS already exist (F-01);
passwordless auth and the `/dashboard`-prefix middleware guard already
work (F-02). `/dashboard` today is a static welcome card with no profile
or question UI, and no AI provider is wired up anywhere in the repo.

## Desired End State

A user with an incomplete profile sees a prompt to fill it in first. Once
filled, `/dashboard` shows a question form; asking a question generates a
personalized answer (via OpenRouter) with a visible "for entertainment
only" disclaimer, and the user can like it — the like persists across
reloads.

## Key Decisions Made

| Decision                          | Choice                                   | Why (1 sentence)                                                                 | Source |
| ---------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- | ------ |
| Like button scope                  | In S-01 (persistence only)                | US-01's own acceptance criteria require it; style-learning use of likes stays S-03 | Plan   |
| AI provider                        | OpenRouter                                | Solo/cost-conscious profile, easy to swap models later without a rewrite          | Plan   |
| Page structure                     | Separate `/dashboard/profile`             | Cleaner split; S-02 (edit-profile) will reuse this page                           | Plan   |
| FR-005 safety enforcement          | System prompt + static UI disclaimer only | Exactly the PRD's own Socratic resolution; no added moderation call               | Plan   |
| AI failure handling                | Inline error banner, manual retry         | Simplest, matches existing `ServerError` pattern                                  | Plan   |
| Loading UX                         | Reuse `SubmitButton` pending state        | Full-page-navigation form POST makes the spinner cover the whole wait for free    | Plan   |
| about_me limit                     | 500 chars                                 | Matches the DB check constraint already shipped in F-01 — zero UI/DB mismatch risk | Plan   |
| Ask gating                         | Profile required before asking            | Matches US-01's Given clause literally                                            | Plan   |
| Rate limiting                      | Question length cap only, no cooldown      | Matches PRD's small/low target scale                                              | Plan   |
| Prompt injection handling          | Delimited user-content, no filtering       | Text-only generator with no tool access — worst case is a bad answer, not a breach | Plan   |
| Answer display                     | Single block, no streaming                | NFR only requires visible feedback, not token streaming; far simpler on Workers   | Plan   |
| Testing                            | No framework, static checks + manual       | Matches F-01/F-02 precedent and this project's current scope                      | Plan   |

## Scope

**In scope:**
- Profile fill form (name, birth date, about me) at `/dashboard/profile`
- Question form + AI-generated personalized answer on `/dashboard`
- Like toggle on a generated answer (persistence only)
- Profile-completeness gating before the ask flow is usable
- OpenRouter integration module + production secret wiring

**Out of scope:**
- Using liked answers as a style pattern for future generations (S-03)
- Profile *editing* polish beyond first fill (S-02)
- Session history view / delete / un-like from history (S-04)
- Moderation API second-pass, rate limiting/cooldowns, streaming responses
- New database migrations (F-01's schema is reused as-is)

## Architecture / Approach

Four phases: (1) an isolated `src/lib/ai/fairy.ts` OpenRouter module with
no UI dependency, (2) the profile fill page + save route, (3) the ask
form + answer display + like toggle on `/dashboard`, gated on profile
completeness, (4) production secret + full manual walkthrough. All new
routes use plain form POSTs with full-page redirects (not fetch/JSON),
matching the existing auth-routes pattern — this also means the loading
spinner naturally covers the entire AI-generation wait with no extra
timer logic.

## Phases at a Glance

| Phase                                     | What it delivers                                | Key risk                                                             |
| ------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------- |
| 1. AI integration module                   | Isolated, testable OpenRouter call + prompt logic | Wrong model choice or prompt drift into unsafe topics                 |
| 2. Profile fill flow                       | `/dashboard/profile` page + save route            | New `TextareaField` component must match existing visual conventions  |
| 3. Ask, answer, like — with gating         | Core S-01 user flow end to end                    | Profile-completeness gate bypass; AI failure handling                 |
| 4. Apply and verify                        | Production secret + live walkthrough              | OpenRouter cost/latency behavior only observable in production        |

**Prerequisites:** F-01 and F-02 (both archived/done); an OpenRouter
account + API key.
**Estimated effort:** not estimated — see project convention (roadmap and
plans don't carry time estimates for agentic execution).

## Open Risks & Assumptions

- Exact OpenRouter model slug/pricing is confirmed by the implementer at
  build time (model catalogs change; the plan intentionally doesn't pin a
  slug that could be stale).
- System-prompt steering alone (no moderation API) may occasionally let an
  answer drift toward a discouraged topic — accepted per the PRD's own
  Socratic resolution for a low-stakes entertainment app.
- No load/cost testing against real OpenRouter pricing before launch;
  question-length cap is the only cost guardrail.

## Success Criteria (Summary)

- A user with an incomplete profile cannot reach the ask form; a user with
  a complete profile can ask a question and receive a personalized,
  disclaimer-carrying answer.
- Liking an answer persists across reloads.
- An AI call failure surfaces a friendly inline error, never a crash or
  raw error page.
