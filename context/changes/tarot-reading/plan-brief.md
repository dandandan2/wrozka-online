# Tarot Reading — Plan Brief

> Full plan: `context/changes/tarot-reading/plan.md`

## What & Why

Add a second reading mode — tarot — alongside the existing fairy Q&A flow.
Users choose their mode on `/dashboard`, then either ask the fairy a
question (existing flow, relocated to `/dashboard/fairy`) or draw a single
Major Arcana tarot card (new, at `/dashboard/tarot`) with an optional
question, getting an LLM interpretation grounded in the card and their
profile.

## Starting Point

Today there is exactly one flow: `/dashboard` directly renders `AskForm`,
which posts to `/api/fairy/ask`, calls `generateFairyAnswer()` in
`src/lib/ai/fairy.ts`, and stores the result in `fairy_responses`. There's
no concept of multiple reading "kinds" anywhere — not in the schema, the
UI, or the nav. Notably, `context/foundation/prd.md` and
`context/foundation/roadmap.md` both currently list tarot as explicitly
**out of scope** for MVP — this plan consciously reverses that call.

## Desired End State

A user with a complete profile lands on a chooser screen, picks a mode,
and gets a reading either way — same auth, same safety rules, same
like/history/delete mechanics, now spanning two tables merged into one
chronological, type-labeled history view.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| PRD/roadmap scope conflict | Proceed, update docs (Phase 7) | User chose to consciously reverse the prior MVP exclusion rather than leave docs stale | Plan |
| Spread size | Single card | Smallest scope, matches the existing "one question → one answer" pattern | Plan |
| Card meanings | LLM-generated from card name/keywords, not a hand-written meanings dataset | Minimal dataset to maintain, deep interpretation flexibility | Plan |
| Data model | New `tarot_readings` table (not a `kind` column on `fairy_responses`) | Clean domain model; avoids a polymorphic table with card-specific nullable columns | Plan |
| Question input | Optional | Supports the classic "card of the day" pattern, not just Q&A-style tarot | Plan |
| Mode selector | Chooser screen on `/dashboard` | One obvious entry point; requires relocating the existing flow to `/dashboard/fairy` | Plan |
| Style-learning reuse | Yes, but a separate liked-pool per mode | Consistent like/unlike UX without cross-contaminating tone between fairy and tarot | Plan |
| Like/delete | Same pattern as fairy, mirrored routes | Consistency, no new UX to learn | Plan |
| History display | Merged, chronological, type-badged | Single place to see "what did I do," matches how a real session history reads | Plan |
| Card art | 22 house-authored SVGs, not existing deck scans | Avoids any licensing question since no asset pipeline or deck-art dependency exists today | Plan |
| Content safety | Identical FR-005 rules, reuse `checkFairyAnswerSafety` | Pure reuse — the safety checker is already answer-text-generic | Plan |
| E2E scope | Happy path + auth guard only | Matches the project's "one test per risk" convention, reasonable cost for V1 | Plan |
| Deck size | 22 Major Arcana only | Recognizable, iconic subset; smaller dataset than full 78-card deck | Plan |

## Scope

**In scope:**
- `tarot_readings` table + RLS
- 22-card Major Arcana data + draw/orientation logic + LLM prompt module
- 22 SVG card illustrations
- `/api/tarot/{draw,like,delete}` routes
- Mode-selector on `/dashboard`, relocated `/dashboard/fairy`, new `/dashboard/tarot`
- Merged, type-labeled `/dashboard/history`
- PRD/roadmap doc sync
- Happy-path + auth-guard E2E tests

**Out of scope:**
- Minor Arcana (56 cards), multi-card spreads
- Shared style-learning pool between fairy and tarot
- Reused/licensed deck artwork
- Streaming responses
- Any change to auth or profile behavior

## Architecture / Approach

Mirror the fairy slice's architecture exactly: sibling migration pair,
sibling `src/lib/ai/tarot.ts`, sibling API routes, sibling dashboard
components. History merges two tables in application code (no DB view),
consistent with the project's plain-Supabase-client convention. The one
genuinely new piece is the mode-selector/routing restructure — `/dashboard`
becomes a chooser, the existing flow moves to `/dashboard/fairy`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data model | `tarot_readings` table + RLS | Low — direct mirror of existing pattern |
| 2. Card domain & AI | Card list, draw logic, `tarot.ts` prompt module | Prompt quality/consistency across draws |
| 3. Card illustrations | 22 SVGs | Design effort — no existing pipeline or precedent |
| 4. API routes | draw/like/delete | Low — direct mirror of fairy routes |
| 5. Mode-selector & UI | Chooser, relocated fairy flow, tarot flow, nav | Relocating `/dashboard` → `/dashboard/fairy` risks regressing the existing flow |
| 6. History integration | Merged, type-labeled history | Merge/sort logic correctness across two tables |
| 7. Docs sync | PRD/roadmap updated | None — pure documentation |
| 8. E2E testing | Happy path + auth guard | Coverage is intentionally narrow for V1 |

**Prerequisites:** None beyond the current main branch state — no external
services, API keys, or design assets need to be procured first (SVGs are
authored within Phase 3 itself).
**Estimated effort:** ~8 phases, roughly one focused session per phase for
a HIGH-complexity feature touching data model, AI integration, new visual
assets, routing, and docs.

## Open Risks & Assumptions

- Relocating `/dashboard` to `/dashboard/fairy` is a breaking URL change
  for anyone with the old URL bookmarked/linked — acceptable since this is
  an internal dashboard route behind auth, not a public/shared link.
- LLM-generated (rather than hand-written) card meanings may drift in tone
  or occasionally produce a generic reading if the model under-attends to
  the card keywords — worth a manual quality check in Phase 2 before
  building UI on top of it.
- 22 house-authored SVG illustrations is a real design-effort item with no
  existing template in this codebase — likely the single largest
  time-sink in the plan despite being "just" Phase 3.

## Success Criteria (Summary)

- A user can choose tarot, draw a card (with or without a question), and
  receive a coherent, safety-compliant interpretation
- Liking and deleting tarot readings works identically to the fairy flow
- History shows both reading types together, clearly labeled, in correct
  chronological order
- PRD and roadmap no longer contradict the shipped feature
