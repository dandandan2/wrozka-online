# Tarot Reading Implementation Plan

## Overview

Add a second "reading mode" to the app: alongside the existing fairy Q&A
flow, users can draw a single Major Arcana tarot card (with an optional
question) and receive an LLM-generated interpretation. Users choose their
mode from a new chooser screen at `/dashboard`; the existing ask-flow moves
to `/dashboard/fairy`. This consciously reverses a prior MVP scope
decision — the PRD's Non-Goals and the roadmap's Parked section both
currently exclude "additional divination methods (tarot, cards, runes)" —
so this plan also updates those two documents to reflect the new scope.

## Current State Analysis

The app (Astro 6 + React 19 islands, Tailwind v4, Supabase Postgres/Auth/RLS,
Cloudflare Workers deploy) has exactly one reading flow today:

- `src/pages/dashboard.astro` renders `AskForm` (a `client:load` React
  island) directly once the user's profile is complete
  (`dashboard.astro:67-92`). There is no mode concept — no chooser, no
  second flow.
- `POST /api/fairy/ask` (`src/pages/api/fairy/ask.ts`, 86 lines): auth guard
  → validate `question` (≤500 chars) → require complete profile → fetch up
  to 10 liked answers → `generateFairyAnswer()` → `checkFairyAnswerSafety()`
  → insert into `fairy_responses` → redirect to `/dashboard?response=<id>`.
- `src/lib/ai/fairy.ts` (75 lines): fixed `SYSTEM_PROMPT` (persona +
  medical/financial/legal avoidance), `describeProfile()`,
  `describeStyleReference()`, `generateFairyAnswer(profile, question,
  likedAnswers)` — a single non-streaming `fetch` to OpenRouter
  (`minimax/minimax-m3:free`, 400 max tokens, 15s timeout).
- `src/lib/ai/safety-checker.ts`: `checkFairyAnswerSafety(answer)` —
  deterministic regex backstop for medical/financial/legal content. Fully
  generic on answer text; not fairy-specific despite the name.
- Data model: `public.profiles` and `public.fairy_responses`
  (`supabase/migrations/20260825120000_fairy_data_foundation.sql`), both
  RLS-scoped to `auth.uid()` (`...120100_fairy_data_foundation_rls.sql`).
  `fairy_responses` has no "kind" discriminator — there's no existing
  concept of multiple reading types anywhere in the schema or UI.
- `POST /api/fairy/like` and `POST /api/fairy/delete`
  (`src/pages/api/fairy/{like,delete}.ts`): both auth-guarded, both
  double-scope mutations by `id` + `user_id`, both form-POST/redirect
  (no JSON responses anywhere in this slice).
- `src/pages/dashboard/history.astro` + `HistoryItem.tsx`: flat,
  untyped list of `fairy_responses` rows, each with like/delete forms
  posting to the fairy routes.
- `src/components/Topbar.astro`: flat nav — "Zapytaj wróżkę" (→
  `/dashboard`), "Twój profil", "Historia" — duplicated for desktop
  (lines 38-65) and mobile (lines 110-141).
- No static-asset pipeline exists: `public/` holds only `favicon.png`, no
  `src/assets/`, no `astro:assets` usage anywhere, no image-processing
  dependency in `package.json`.
- `context/foundation/prd.md:143-144` (Non-Goals) and
  `context/foundation/roadmap.md:243-244` (Parked) both currently exclude
  tarot/card-based readings from MVP scope.

## Desired End State

A signed-in user with a complete profile lands on `/dashboard`, sees two
mode cards ("Zapytaj wróżkę" / "Wróżba z tarota"), and can:

- Go to `/dashboard/fairy` for the existing (relocated, unchanged-in-
  behavior) Q&A flow.
- Go to `/dashboard/tarot`, optionally type a question, draw one Major
  Arcana card (random selection + upright/reversed orientation), and
  receive an LLM interpretation grounded in the card, its orientation, and
  their profile — under the same safety rules as the fairy flow.
- Like/unlike and delete past tarot readings the same way they do fairy
  answers.
- See both fairy and tarot entries together, newest-first, each labeled
  with its type, in `/dashboard/history`.

`context/foundation/prd.md` and `context/foundation/roadmap.md` reflect
that tarot is now in scope.

**Verification**: manual walkthrough of the full flow (draw → see result →
like → appears in history with badge → delete) plus the automated/manual
checks listed per phase below.

### Key Discoveries:

- `checkFairyAnswerSafety` (`src/lib/ai/safety-checker.ts:69`) is answer-text-generic
  and reusable as-is for tarot — no new safety-checking code needed.
- The three fairy API routes share one exact shape (auth guard →
  per-request Supabase client → form validation → mutate → redirect with
  `?error=`/`?response=` query params) that the tarot routes should mirror
  line-for-line, not reinvent.
- Making `/dashboard` a chooser (per user decision) requires relocating the
  existing ask-flow to `/dashboard/fairy` — this is a routing/nav change to
  existing functionality, not just new-file addition.
- `Topbar.astro` duplicates its nav markup for desktop (lines 38-65) and
  mobile (lines 110-141) — both need the same link changes.

## What We're NOT Doing

- No Minor Arcana (56 cards) — V1 ships the 22 Major Arcana only.
- No multi-card spreads (3-card, Celtic Cross, etc.) — one card per draw.
- No shared style-learning pool between fairy and tarot — tarot's "liked"
  answers feed only the tarot prompt, and vice versa.
- No reuse of any existing tarot deck artwork/scans (licensing risk) — card
  illustrations are newly authored, minimalist SVGs in the app's own visual
  language.
- No streaming responses (matches the existing non-streaming fairy pattern).
- No changes to auth, profile, or the fairy flow's own behavior beyond its
  URL moving from `/dashboard` to `/dashboard/fairy`.

## Implementation Approach

Mirror the existing fairy slice's architecture end-to-end rather than
inventing new patterns: a sibling migration pair (schema + RLS), a sibling
`src/lib/ai/tarot.ts`, sibling `src/pages/api/tarot/*.ts` routes, sibling
dashboard components, and a history query that now reads two tables and
merges them in application code (no DB view, consistent with the project's
"no ORM, plain Supabase client queries" convention). The mode-selector and
routing change is the one piece with no precedent, so it gets its own
phase and careful nav updates.

## Phase 1: Data Model — `tarot_readings` Table

### Overview

Add the storage for tarot draws, mirroring `fairy_responses`'s shape and
RLS policy set.

### Changes Required:

#### 1. Schema migration

**File**: `supabase/migrations/20260913120000_tarot_reading_foundation.sql`

**Intent**: Create `public.tarot_readings` to store one row per draw:
the card drawn, its orientation, the optional user question, the
generated interpretation, and a `liked` flag for the style-learning loop
— structurally parallel to `fairy_responses`.

**Contract**: Columns: `id uuid primary key default gen_random_uuid()`,
`user_id uuid not null references auth.users(id) on delete cascade`,
`question text` (nullable — question is optional per user decision),
`card_key text not null` (stable identifier, e.g. `"the-fool"`, matching
the card data added in Phase 2), `orientation text not null check
(orientation in ('upright', 'reversed'))`, `answer text not null`, `liked
boolean not null default false`, `created_at timestamptz not null default
now()`. Add index `tarot_readings_user_liked_created_idx on
public.tarot_readings (user_id, liked, created_at desc)` — same shape as
`fairy_responses_user_liked_created_idx`, supports the "last 10 liked
readings" query in Phase 2's route.

#### 2. RLS migration

**File**: `supabase/migrations/20260913120100_tarot_reading_foundation_rls.sql`

**Intent**: Enable RLS and scope all access to the owning user, matching
`fairy_responses`'s policy set exactly (full CRUD needed: select for
history, insert on draw, update for like-toggle, delete for history
management).

**Contract**: `enable row level security` on `tarot_readings`, then
`tarot_readings_select_own`, `tarot_readings_insert_own` (`with check
auth.uid() = user_id`), `tarot_readings_update_own` (`using` + `with
check auth.uid() = user_id`), `tarot_readings_delete_own` (`using
auth.uid() = user_id`) — same predicate pattern as
`20260825120100_fairy_data_foundation_rls.sql`.

### Success Criteria:

#### Automated Verification:

- Migrations apply cleanly against local Supabase: `supabase db reset` (or
  project's equivalent migration-apply command)
- Existing test suite still passes: `npm run test`

#### Manual Verification:

- Inspect Supabase Studio (or `psql`) to confirm `tarot_readings` exists
  with RLS enabled and the four policies present
- Confirm a row inserted as one user is not selectable by another user's
  session (spot-check via SQL with two different `auth.uid()` contexts)

---

## Phase 2: Card Domain Data & AI Integration

### Overview

Define the 22-card Major Arcana list, the draw/orientation logic, and the
tarot prompt-building module — mirroring `src/lib/ai/fairy.ts`'s shape.

### Changes Required:

#### 1. Card data

**File**: `src/lib/tarot/cards.ts`

**Intent**: A static list of the 22 Major Arcana cards, each with a
stable `key` (used as `card_key` in the DB and to resolve the Phase 3 SVG
filename), a Polish display name, and a short canonical-meaning hint (a
few keywords, not a full essay — the LLM generates the actual
interpretation, per the "meanings generated by LLM" decision) so the
prompt has a consistent anchor and doesn't drift between draws for the
same card.

**Contract**: `interface TarotCard { key: string; name: string; keywords:
string[] }`; `export const MAJOR_ARCANA: TarotCard[]` (22 entries, Fool
through World); `export function drawCard(): { card: TarotCard;
orientation: "upright" | "reversed" }` — uses `Math.random()` for both card
selection and orientation (50/50), consistent with the project having no
existing seeded-RNG/testing-determinism requirement elsewhere.

#### 2. AI integration module

**File**: `src/lib/ai/tarot.ts`

**Intent**: Build the tarot system/user prompt and call the LLM, mirroring
`fairy.ts`'s `generateFairyAnswer` shape and safety posture (same
medical/financial/legal avoidance instructions — FR-005 — per user
decision to keep identical content-safety rules) but referencing the drawn
card, its orientation, and its keywords instead of a free-form question
alone.

**Contract**: `export async function generateTarotReading(profile:
FairyProfile, card: TarotCard, orientation: "upright" | "reversed",
question: string | null, likedAnswers: string[] = []):
Promise<string>` — same OpenRouter model/timeout/token constants as
`fairy.ts` (import and reuse them rather than redefining), same
`describeProfile`/`describeStyleReference`-equivalent helpers (extract and
share the profile-formatting helper from `fairy.ts` rather than
duplicating it, since it has no fairy-specific content), and a
tarot-specific system prompt that includes the same topic-avoidance
guardrails as `fairy.ts`'s `SYSTEM_PROMPT`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run astro check` (or project's equivalent)
- Unit tests for `drawCard()` distribution/shape and prompt construction:
  `npm run test`

#### Manual Verification:

- Manually invoke `generateTarotReading` against a real profile/card in a
  scratch script or via the Phase 4 route once wired, confirm the response
  references the drawn card and respects the safety guardrails

---

## Phase 3: Card Illustrations

### Overview

Add 22 newly authored SVG illustrations, one per Major Arcana card, in the
app's existing gold/espresso visual language.

### Changes Required:

#### 1. SVG assets

**File**: `public/tarot/<card-key>.svg` (22 files, one per `MAJOR_ARCANA`
entry's `key` from Phase 2)

**Intent**: House-authored, minimalist line-art/geometric illustrations
per card — not scans or reproductions of any existing published deck —
styled consistently with the site's established palette (`#d9b877` gold,
`#1c1408`/`#0d0a06` espresso darks, per `Topbar.astro`'s and
`global.css`'s existing tokens) so a drawn card visually belongs on the
page.

**Contract**: Flat file layout under `public/tarot/`, filenames exactly
matching each card's `key` (e.g. `the-fool.svg`), served as plain static
assets (`<img src="/tarot/the-fool.svg">`) — no `astro:assets` pipeline,
consistent with the project's current all-static `public/` convention.

### Success Criteria:

#### Automated Verification:

- Build succeeds and copies all 22 files into `dist/tarot/`: `npm run
  build` then confirm file count: `ls dist/tarot | wc -l` equals 22

#### Manual Verification:

- Visually spot-check a handful of cards in a browser at `/tarot/<key>.svg`
  for legibility and visual consistency with the rest of the UI

---

## Phase 4: API Routes

### Overview

Add `draw`, `like`, and `delete` routes for tarot readings, mirroring the
fairy routes exactly in structure and error handling.

### Changes Required:

#### 1. Draw route

**File**: `src/pages/api/tarot/draw.ts`

**Intent**: Mirror `src/pages/api/fairy/ask.ts`'s flow, adapted for an
optional question and a server-side card draw: auth guard → Supabase
client → parse optional `question` (same 500-char cap, but empty/missing
is valid) → require complete profile (reuse the same check as `ask.ts`) →
`drawCard()` → fetch last 10 liked tarot readings (same query shape as
`ask.ts`'s liked-answers fetch, against `tarot_readings`) →
`generateTarotReading(...)` → `checkFairyAnswerSafety(answer)` → insert
into `tarot_readings` (`user_id, question, card_key, orientation, answer`)
→ redirect to `/dashboard/tarot?reading=<id>`.

**Contract**: `export const POST: APIRoute`, same redirect-based
form-POST contract as `ask.ts` (no JSON responses), same
`?error=<message>` pattern on failure at every step.

#### 2. Like route

**File**: `src/pages/api/tarot/like.ts`

**Intent**: Byte-for-byte structural mirror of `src/pages/api/fairy/like.ts`,
targeting `tarot_readings` instead of `fairy_responses`, with
`redirect_to` supporting `/dashboard/history` and `/dashboard/tarot`.

**Contract**: `export const POST: APIRoute`, same ownership-scoped
select-then-toggle pattern (`eq("id", id).eq("user_id", user.id)`).

#### 3. Delete route

**File**: `src/pages/api/tarot/delete.ts`

**Intent**: Byte-for-byte structural mirror of
`src/pages/api/fairy/delete.ts`, targeting `tarot_readings`, redirecting
to `/dashboard/history` on both success and failure (matching the fairy
route's behavior).

**Contract**: `export const POST: APIRoute`, same
`.eq("id", id).eq("user_id", user.id)` double-scoping.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run astro check`
- Route-level tests (mocking the Supabase client and `fetch`, per the
  existing `tests/helpers/mock-supabase-client.ts` /
  `fake-api-context.ts` pattern): `npm run test`

#### Manual Verification:

- POST to `/api/tarot/draw` with a valid session via the UI (Phase 5) and
  confirm a row lands in `tarot_readings` with the expected shape
- Confirm unauthenticated POSTs to all three routes redirect to
  `/auth/signin`

---

## Phase 5: Mode-Selector & Tarot UI

### Overview

Turn `/dashboard` into a mode chooser, relocate the existing ask-flow to
`/dashboard/fairy`, and build the tarot draw/result UI at
`/dashboard/tarot`.

### Changes Required:

#### 1. Relocate the fairy flow

**File**: `src/pages/dashboard.astro` → becomes the chooser;
**new file** `src/pages/dashboard/fairy.astro` takes over the current
`dashboard.astro` content (profile-completeness gate, `AskForm`,
`AnswerCard`, `?response=`/`?error=` handling) unchanged.

**Intent**: Preserve the existing ask-flow's exact behavior at a new URL;
`dashboard.astro` no longer renders `AskForm` directly.

**Contract**: `dashboard.astro` keeps the profile-completeness gate (if
profile incomplete, same CTA to `/dashboard/profile` as today) but, once
complete, renders two mode-choice cards instead of `AskForm` — one linking
to `/dashboard/fairy`, one to `/dashboard/tarot` — styled with the
existing card/CTA conventions (`rounded-[2rem]` card shell, gold-gradient
CTA pill, per the classes already used in `dashboard.astro:69-91`).

#### 2. Tarot page

**File**: `src/pages/dashboard/tarot.astro`

**Intent**: Structural mirror of the relocated `dashboard/fairy.astro`:
profile-completeness gate, then `TarotForm` island, then (if
`?reading=<id>` present) a `TarotResult` island showing the drawn card,
its orientation, and the interpretation.

**Contract**: Fetches the `tarot_readings` row by `id` + `user_id` when
`?reading=` is present, same pattern as `dashboard.astro`'s
`latestResponse` fetch.

#### 3. Tarot form component

**File**: `src/components/dashboard/TarotForm.tsx`

**Intent**: Mirror `AskForm.tsx`'s shape (client validation, `ServerError`,
`SubmitButton`) but with an optional (not required) question field,
posting to `/api/tarot/draw`.

**Contract**: `<form method="POST" action="/api/tarot/draw">`, textarea
`name="question"` with no required-field validation (empty submit is
valid).

#### 4. Tarot result component

**File**: `src/components/dashboard/TarotResult.tsx`

**Intent**: Mirror `AnswerCard.tsx`'s shape — show the card illustration
(Phase 3 SVG, resolved via `card_key`), card name + orientation label
("Odwrócona" / "Prosto"), the question if any, the interpretation text,
and a like button posting to `/api/tarot/like` with
`redirect_to=/dashboard/tarot`.

**Contract**: Props mirror `AnswerCard`'s (`id`, `answer`, `liked`) plus
`cardKey`, `cardName`, `orientation`, `question`.

#### 5. Navigation

**File**: `src/components/Topbar.astro`

**Intent**: Update both the desktop (lines 38-65) and mobile (lines
110-141) nav blocks: the primary gold-pill link changes from "Zapytaj
wróżkę" → `/dashboard` to a link labeled "Panel" → `/dashboard` (the new
chooser), and two new secondary links are added — "Zapytaj wróżkę" →
`/dashboard/fairy` and "Tarot" → `/dashboard/tarot` — alongside the
existing "Twój profil" and "Historia" links, keeping the same pill
styling conventions already present in the file.

**Contract**: No new styling classes — reuse the existing gold-gradient
primary and bordered-pill secondary classes verbatim.

#### 6. Middleware / auth-guard coverage

**File**: `src/middleware.ts` — no code change needed
(`PROTECTED_ROUTES = ["/dashboard"]` already prefix-matches
`/dashboard/tarot` and `/dashboard/fairy`); confirmed here for the
implementer so it isn't re-investigated.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`
- Full test suite passes: `npm run test`

#### Manual Verification:

- Visiting `/dashboard` with a complete profile shows the two mode cards,
  not a form
- Clicking through to `/dashboard/fairy` reproduces the exact pre-existing
  ask-flow experience (question → answer → like)
- Clicking through to `/dashboard/tarot`, submitting with and without a
  question, both produce a card draw + interpretation
- Nav on both desktop and mobile viewports shows all four destinations and
  each link resolves correctly

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human
that the manual testing was successful before proceeding to the next
phase.

---

## Phase 6: History Integration

### Overview

Merge `fairy_responses` and `tarot_readings` into one chronological,
type-labeled list on `/dashboard/history`.

### Changes Required:

#### 1. History query + merge

**File**: `src/pages/dashboard/history.astro`

**Intent**: Query both tables, normalize each row into a common shape
carrying a `type` discriminator, merge, and sort by `created_at`
descending in application code (no DB view, per the project's existing
"plain Supabase client queries" convention) before rendering.

**Contract**: A shared `HistoryEntry` type: `{ id: string; type: "fairy" |
"tarot"; question: string | null; answer: string; liked: boolean;
createdAt: string; cardKey?: string; orientation?: "upright" |
"reversed" }`; `fairy_responses` rows map with `type: "fairy"`,
`tarot_readings` rows map with `type: "tarot"` plus `cardKey`/
`orientation`.

#### 2. History item rendering

**File**: `src/components/dashboard/HistoryItem.tsx`

**Intent**: Extend to render a small type badge ("Wróżka" / "Tarot") and,
for tarot entries, the card name + orientation above the question/answer
block; like/delete forms post to `/api/fairy/like` + `/api/fairy/delete`
or `/api/tarot/like` + `/api/tarot/delete` depending on `type`.

**Contract**: New optional props on the existing `Props` interface:
`type: "fairy" | "tarot"`, `cardName?: string`, `orientation?: "upright" |
"reversed"` — form `action` attributes become conditional on `type`
rather than hardcoded to the fairy routes.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run astro check`
- Full test suite passes: `npm run test`

#### Manual Verification:

- `/dashboard/history` shows both fairy and tarot entries interleaved by
  time, each clearly labeled
- Like and delete both work correctly for tarot entries from the history
  page (not just from `/dashboard/tarot`)

---

## Phase 7: Docs Sync

### Overview

Update the PRD and roadmap to reflect that tarot is now in scope,
consistent with the earlier decision to consciously reverse the prior
MVP-scope call rather than leave the docs stale.

### Changes Required:

#### 1. PRD Non-Goals

**File**: `context/foundation/prd.md`

**Intent**: Remove the tarot exclusion from Non-Goals (line 143-144: "Brak
dodatkowych metod wróżenia (np. tarot, karty, runy)...") since it's no
longer accurate; optionally note in the relevant Functional Requirements
or Scope section that a single-card Major Arcana tarot reading is now
in scope, mirroring how the fairy Q&A requirement is documented.

**Contract**: Remove or rewrite the Non-Goals bullet at `prd.md:143-144`;
no other section is required to change for this plan to be internally
consistent, but the implementer should skim FR numbering to see if a new
FR for tarot is warranted given the doc's existing style.

#### 2. Roadmap Parked → active

**File**: `context/foundation/roadmap.md`

**Intent**: Remove the tarot entry from the Parked section (line 243-244)
since it's no longer parked; the `tarot-reading` change itself is tracked
via `context/changes/tarot-reading/change.md`, not a roadmap line item (no
existing roadmap item references this Change ID, confirmed during
planning), so no roadmap milestone/slice edit is required beyond
un-parking the entry.

**Contract**: Delete the bullet at `roadmap.md:243-244`; bump the
roadmap's frontmatter `updated:` date.

### Success Criteria:

#### Automated Verification:

- N/A (documentation-only change)

#### Manual Verification:

- Re-read `prd.md` Non-Goals and `roadmap.md` Parked sections, confirm
  no remaining reference to excluding tarot

---

## Phase 8: E2E Testing

### Overview

Add Playwright coverage for the tarot happy path and its auth guard,
matching the project's existing "one test per risk" pattern (per
`context/archive/2026-08-25.../` E2E setup and
`tests/e2e/dashboard-subroutes-require-authentication.spec.ts`).

### Changes Required:

#### 1. Happy-path E2E test

**File**: `tests/e2e/tarot-draw-happy-path.spec.ts`

**Intent**: Cover the highest-risk path: a signed-in user with a complete
profile chooses tarot, draws a card (with and/or without a question), and
sees a result. Follow the project's E2E rules (`CLAUDE.md`): `getByRole`/
`getByLabel`/`getByText` locators only, no `waitForTimeout`, independent
setup/teardown with a unique test identity.

**Contract**: Uses the project's existing Playwright auth-seeding helper
(whatever `dashboard-subroutes-require-authentication.spec.ts` or sibling
specs use to establish a signed-in session) rather than reinventing login;
asserts the result view becomes visible via `toBeVisible()`, never a fixed
timeout.

#### 2. Auth-guard coverage

**File**: `tests/e2e/dashboard-subroutes-require-authentication.spec.ts`

**Intent**: Extend the existing spec's list of protected subroutes to
include `/dashboard/tarot` (and `/dashboard/fairy`, since it's also new),
consistent with how `/dashboard/history` and `/dashboard/profile` are
already covered there.

**Contract**: Add cases following the existing test's exact structure —
visit the route unauthenticated, assert redirect to `/auth/signin`.

### Success Criteria:

#### Automated Verification:

- E2E suite passes: `npm run test:e2e` (or project's Playwright script)

#### Manual Verification:

- N/A — this phase's output is itself the verification

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human
that the manual testing was successful before proceeding to the next
phase.

---

## Testing Strategy

### Unit Tests:

- `drawCard()`: returns a card from `MAJOR_ARCANA`, orientation is one of
  `"upright"`/`"reversed"`, distribution is roughly uniform across many
  calls
- `generateTarotReading()`: prompt construction includes card
  name/orientation/keywords and profile fields; mocks the OpenRouter
  `fetch` boundary per the project's existing `fairy.ts` test pattern
- API routes: auth-guard redirects, validation errors, safety-check
  rejection path (answer discarded, not persisted), ownership-scoped
  like/delete

### Integration Tests:

- Full draw → insert → history-visible round trip against a mocked
  Supabase client

### Manual Testing Steps:

1. Sign in, complete profile, land on `/dashboard`, confirm two mode cards
2. Choose tarot, submit with a question, confirm a card + orientation +
   interpretation renders
3. Choose tarot again, submit with no question, confirm it still works
4. Like the tarot reading, confirm it appears liked in `/dashboard/history`
5. Delete a tarot reading from history, confirm it's gone and a fairy
   entry created around the same time is unaffected
6. Confirm `/dashboard/fairy` still behaves exactly as `/dashboard` did
   before this change

## Performance Considerations

No new performance-sensitive paths beyond what `fairy.ts` already
establishes (single non-streaming LLM call under Cloudflare Workers' I/O-
bound `fetch` pattern, 15s timeout). SVG assets are small, flat files
served statically — no build-time image processing to budget for.

## Migration Notes

Two new, additive migrations (Phase 1) — no changes to existing tables, no
backfill needed, safe to apply independently of any existing data.

## References

- Existing fairy slice: `src/lib/ai/fairy.ts`, `src/pages/api/fairy/*.ts`,
  `src/pages/dashboard.astro`, `src/pages/dashboard/history.astro`
- Prior architecture decisions: `context/archive/2026-08-26-ask-fairy-personalized-answer/plan.md`,
  `context/archive/2026-08-26-like-response-style-learning/plan.md`,
  `context/archive/2026-08-26-session-history-management/plan.md`
- Testing conventions: `context/archive/2026-08-27-testing-fairy-loop-business-rules/research.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data Model — `tarot_readings` Table

#### Automated

- [x] 1.1 Migrations apply cleanly against local Supabase — 7d337f8
- [x] 1.2 Existing test suite still passes — 7d337f8

#### Manual

- [x] 1.3 Confirm `tarot_readings` exists with RLS enabled and four policies — 7d337f8
- [x] 1.4 Confirm cross-user row isolation via RLS — 7d337f8

### Phase 2: Card Domain Data & AI Integration

#### Automated

- [x] 2.1 Type checking passes — 0729f20
- [x] 2.2 Unit tests for `drawCard()` and prompt construction pass — 0729f20

#### Manual

- [ ] 2.3 Manually invoke `generateTarotReading` and confirm output quality/safety

### Phase 3: Card Illustrations

#### Automated

- [x] 3.1 Build succeeds and all 22 SVGs land in `dist/tarot/` (actual path: `dist/client/tarot/` — server-mode Astro/Cloudflare build, not static output; plan's assumed path was slightly off) — 39ecb8e

#### Manual

- [x] 3.2 Visually spot-check card illustrations for legibility/consistency — 39ecb8e

### Phase 4: API Routes

#### Automated

- [x] 4.1 Type checking passes
- [x] 4.2 Route-level tests pass

#### Manual

- [ ] 4.3 Confirm `POST /api/tarot/draw` inserts the expected row via the UI
- [ ] 4.4 Confirm unauthenticated POSTs redirect to `/auth/signin`

### Phase 5: Mode-Selector & Tarot UI

#### Automated

- [ ] 5.1 Type checking passes
- [ ] 5.2 Linting passes
- [ ] 5.3 Full test suite passes

#### Manual

- [ ] 5.4 `/dashboard` shows two mode cards for a complete profile
- [ ] 5.5 `/dashboard/fairy` reproduces the pre-existing ask-flow exactly
- [ ] 5.6 `/dashboard/tarot` works with and without a question
- [ ] 5.7 Nav shows all four destinations correctly on desktop and mobile

### Phase 6: History Integration

#### Automated

- [ ] 6.1 Type checking passes
- [ ] 6.2 Full test suite passes

#### Manual

- [ ] 6.3 History shows interleaved, labeled fairy and tarot entries
- [ ] 6.4 Like/delete work for tarot entries from the history page

### Phase 7: Docs Sync

#### Manual

- [ ] 7.1 PRD Non-Goals and roadmap Parked no longer exclude tarot

### Phase 8: E2E Testing

#### Automated

- [ ] 8.1 E2E suite passes
