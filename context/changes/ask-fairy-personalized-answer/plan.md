# Profile + Question + Personalized Fairy Answer Implementation Plan

## Overview

Implement roadmap north star **S-01**: a logged-in user with a complete
profile (name, birth date) can ask the fairy a question and receive a
generated, personalized answer via an external AI provider (OpenRouter),
with the ability to like the answer. Users with an incomplete profile are
routed to fill it in first.

## Current State Analysis

- `profiles` and `fairy_responses` tables already exist with RLS, from F-01
  (`context/archive/2026-08-25-fairy-data-foundation/`). Every signed-up
  user already has an empty `profiles` row (auto-created by trigger) —
  filling the profile is an `UPDATE`, never an `INSERT`.
- Passwordless auth (F-02, `context/archive/2026-08-25-passwordless-magic-link-auth/`)
  is live; `context.locals.user` is set by `src/middleware.ts`, which also
  protects any path under `/dashboard` (prefix match on `PROTECTED_ROUTES`).
- `src/pages/dashboard.astro` today is a static welcome card (user email +
  sign-out form) — no profile display, no question/answer UI.
- No `src/pages/dashboard/` subpages, no `/api/profile/*` or `/api/fairy/*`
  routes exist yet.
- `src/lib/supabase.ts`'s `createClient(headers, cookies)` works identically
  in `.astro` pages (`Astro.request.headers`/`Astro.cookies`) and API routes
  (`context.request.headers`/`context.cookies`) — already proven by the auth
  routes and middleware.
- Existing form components (`src/components/auth/FormField.tsx`,
  `SubmitButton.tsx`, `ServerError.tsx`) only support single-line `<input>`.
  No multi-line textarea component exists yet — needed for "about me" and
  the question field.
- `SubmitButton` uses `useFormStatus()` and is driven by a plain
  `<form method="POST" action="...">` doing a full-page browser navigation
  (not `fetch`/JSON) — see `AuthForm.tsx` for the working pattern.
- No AI/LLM SDK or API key is configured anywhere in the repo
  (`astro.config.mjs`, `.env.example`, `wrangler.jsonc` all confirmed clean).
- `context/foundation/infrastructure.md`'s risk register flags Cloudflare's
  free-tier 10ms CPU/invocation cap and recommends delegating generation to
  an external LLM API via `fetch` (I/O-bound, low CPU) rather than doing
  heavy computation in the Worker — directly applicable here.

## Desired End State

A logged-in user visiting `/dashboard` with an incomplete profile
(missing name or birth date) sees a prompt to complete it, linking to
`/dashboard/profile`. Once name and birth date are saved, `/dashboard`
shows a question form; submitting it calls OpenRouter with a prompt built
from the profile and the question, saves the result to `fairy_responses`,
and displays the generated answer with a visible disclaimer and a like
toggle. Liking persists across reloads.

Verification: manually walk through empty-profile → filled-profile →
ask-question → see-answer → like → reload-confirms-liked, against the real
deployed Supabase + OpenRouter integration.

### Key Discoveries:

- No new migration is needed — F-01's schema (including the 500-char
  `about_me` check constraint and the `fairy_responses` index) already
  covers this slice's data needs.
- `/dashboard/profile` is automatically covered by the existing
  `PROTECTED_ROUTES` prefix check in `src/middleware.ts` — no middleware
  change required.
- API routes (`/api/profile/*`, `/api/fairy/*`) are NOT covered by
  `PROTECTED_ROUTES` (that list only matches page paths) — each new API
  route must check `context.locals.user` itself and redirect to
  `/auth/signin` if absent, matching how the rest of the API surface has no
  separate auth middleware layer today.

## What We're NOT Doing

- No use of previously liked answers as a style pattern for generation —
  that mechanism is S-03 (`like-response-style-learning`). This slice only
  persists the `liked` boolean; it does not read it back into any prompt.
- No profile *editing* UI polish beyond the initial fill (e.g. no separate
  "cancel"/dirty-state handling) — that's S-02 (`edit-profile`)'s job; this
  slice's profile page is deliberately minimal (fill-once form).
- No history view, no delete, no un-like from a history list — that's S-04.
- No moderation API call / second safety pass on generated answers — safety
  is enforced via system-prompt steering + a static UI disclaimer only, per
  the PRD's own Socratic resolution for FR-005.
- No per-user rate limiting / cooldown on the ask endpoint — only a
  question-length cap, matching the PRD's `target_scale: small/low`.
- No streaming of the generated answer — a single blocking request/response.
- No new database migration — F-01's schema is reused as-is.
- No automated test framework — matches F-01/F-02 precedent and this
  project's current scope (testing strategy is out of bounds for this
  phase of work).

## Implementation Approach

Four phases, ordered so each is independently verifiable: (1) an isolated
AI-integration module with no UI, (2) the profile fill flow, (3) the
question/answer/like flow with profile-completeness gating, (4) production
secret + end-to-end manual verification. All new POST routes follow the
existing progressive-enhancement pattern (plain `<form method="POST">`,
full-page redirect on completion) rather than `fetch`/JSON, matching the
auth routes.

## Critical Implementation Details

**Request lifecycle drives the loading UX.** The ask/like/profile-save
routes use plain form POSTs with full-page redirects, not `fetch`. This
means `SubmitButton`'s `useFormStatus()` pending state is visible for the
entire duration of the browser navigation — including the full wait for
the OpenRouter call — so the NFR's "visible feedback when generation takes
>2s" is satisfied by construction; no timer or threshold logic is needed.

**System prompt must carry two distinct constraints, not one.** Per the
PRD's Socratic resolution for FR-005, the system prompt must instruct the
model to (a) maintain a consistent "wróżka" persona/tone and (b) avoid
medical/financial/legal topics — and this is *in addition to*, not instead
of, the static UI disclaimer ("to rozrywka, nie porada") rendered next to
every answer. Both are required.

## Phase 1: AI integration module

### Overview

Build the isolated OpenRouter integration and wire its API key, with no UI
dependency — this phase is fully verifiable via type-checking and a code
review, independent of the rest of the feature.

### Changes Required:

#### 1. Fairy-answer generation module

**File**: `src/lib/ai/fairy.ts` (new)

**Intent**: Encapsulate the OpenRouter call and prompt construction in one
place so route handlers stay thin and the AI provider can be swapped later
without touching call sites.

**Contract**: exports
`async function generateFairyAnswer(profile: { name: string | null; birthDate: string | null; aboutMe: string | null }, question: string): Promise<string>`.
Builds a `messages` array: a system message containing the fairy persona
instruction plus the FR-005 topic-avoidance constraint, and a user message
that embeds the profile fields (each defaulting to "nie podano" when null)
followed by a clearly delimited question section. POSTs to
`https://openrouter.ai/api/v1/chat/completions` with
`Authorization: Bearer ${OPENROUTER_API_KEY}`, a cost-effective
general-purpose chat model (implementer confirms the current model slug and
pricing against OpenRouter's live model list at implementation time — e.g.
`openai/gpt-4o-mini` or an equivalent), and a `max_tokens` cap (e.g. 400) to
bound latency and cost. On a non-2xx response or a missing
`choices[0].message.content`, throws an `Error` with a message the caller
maps to a generic user-facing error (never leak raw provider error text,
per the pattern already established in `src/lib/auth-errors.ts`).

#### 2. Env var declaration

**File**: `astro.config.mjs`

**Intent**: Make `OPENROUTER_API_KEY` typed and available via
`astro:env/server`, matching how `SUPABASE_URL`/`SUPABASE_KEY` are declared.

**Contract**: add
`OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true })`
to the existing `env.schema` block.

#### 3. Local dev env example

**File**: `.env.example`

**Intent**: document the new var for local setup.

**Contract**: add line `OPENROUTER_API_KEY=###`.

### Success Criteria:

#### Automated Verification:

- Module exists and exports the function: `test -f src/lib/ai/fairy.ts && grep -q "generateFairyAnswer" src/lib/ai/fairy.ts`
- Calls the correct endpoint: `grep -q "openrouter.ai/api/v1/chat/completions" src/lib/ai/fairy.ts`
- Env var declared: `grep -q "OPENROUTER_API_KEY" astro.config.mjs`
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Code reviewed: prompt content matches the FR-005 persona + topic
  constraints, error handling never forwards raw provider error text.

---

## Phase 2: Profile fill flow

### Overview

Let the user view and save their profile (name, birth date, about me).

### Changes Required:

#### 1. Shared textarea field

**File**: `src/components/forms/TextareaField.tsx` (new)

**Intent**: Multi-line counterpart to `FormField`, needed for "about me"
(this phase) and the question field (Phase 3). New shared location
(`src/components/forms/`) rather than `src/components/auth/`, since these
fields are no longer auth-specific — the existing auth components stay
where they are (no drive-by move).

**Contract**: props
`{ id: string; name?: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string; error?: string; hint?: ReactNode; icon: ReactNode; maxLength?: number; rows?: number }`.
Renders a `<textarea>` using the same visual treatment (border/focus-ring
classes) as `FormField`'s `<input>`, plus a live "`<current>/<max>`"
character counter under the field when `maxLength` is set.

#### 2. Profile form component

**File**: `src/components/dashboard/ProfileForm.tsx` (new)

**Intent**: Collect and submit profile fields.

**Contract**: props
`{ initialName: string | null; initialBirthDate: string | null; initialAboutMe: string | null; serverError?: string | null }`.
`<form method="POST" action="/api/profile/update">` containing: a
`FormField` for `name` (text, required), a `FormField` for `birth_date`
(`type="date"`), a `TextareaField` for `about_me`
(`maxLength={500}`, optional), `ServerError`, `SubmitButton`. Client-side
validation: `name` non-empty, `birth_date` is a valid date not in the
future (mirrors the client-side-validate pattern in `AuthForm.tsx`).

#### 3. Profile page

**File**: `src/pages/dashboard/profile.astro` (new)

**Intent**: Server-render the form pre-filled with the current row.

**Contract**: reads `context.locals.user`; if absent, this path is already
covered by `PROTECTED_ROUTES` middleware (no extra guard needed here).
Queries `profiles` via
`createClient(Astro.request.headers, Astro.cookies).from("profiles").select("name, birth_date, about_me").eq("id", user.id).single()`
and passes the row plus `Astro.url.searchParams.get("error")` into
`ProfileForm`. Wrapped in the existing `Layout`.

#### 4. Save route

**File**: `src/pages/api/profile/update.ts` (new)

**Intent**: Persist profile edits.

**Contract**: `POST` handler. If `context.locals.user` is falsy, redirect
to `/auth/signin`. Reads `name`, `birth_date`, `about_me` from form data;
validates `about_me` length ≤ 500 server-side (defense in depth alongside
the DB check constraint — mirrors the explicit-guard pattern added to
`request-link.ts`/`verify-code.ts` in F-02). Calls
`.from("profiles").update({ name, birth_date, about_me }).eq("id", user.id)`.
On a Supabase error, redirect to
`/dashboard/profile?error=<generic message>` (reuse the
`toAuthErrorMessage`-style approach — map, don't forward raw text). On
success, redirect to `/dashboard`.

### Success Criteria:

#### Automated Verification:

- Files exist: `test -f src/components/forms/TextareaField.tsx && test -f src/components/dashboard/ProfileForm.tsx && test -f src/pages/dashboard/profile.astro && test -f src/pages/api/profile/update.ts`
- Save route touches the right table: `grep -q 'from("profiles")' src/pages/api/profile/update.ts`
- Server-side length guard present: `grep -q "500" src/pages/api/profile/update.ts`
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- `/dashboard/profile` renders an empty form for a fresh user (row exists
  but fields are null) and a pre-filled form after saving once.
- Saving valid data redirects to `/dashboard`; revisiting
  `/dashboard/profile` shows the persisted values.
- Submitting `about_me` over 500 characters is rejected with a visible
  error, not a raw DB constraint failure.

---

## Phase 3: Ask, answer, and like — with profile-completeness gating

### Overview

Add the question flow to `/dashboard`, gated on profile completeness, plus
the like toggle.

### Changes Required:

#### 1. Ask form component

**File**: `src/components/dashboard/AskForm.tsx` (new)

**Intent**: Collect the question and submit for generation.

**Contract**: props `{ serverError?: string | null }`.
`<form method="POST" action="/api/fairy/ask">` with a `TextareaField` for
`question` (`maxLength={500}`, required), `ServerError`, `SubmitButton`
(`pendingText="Wróżka się zastanawia..."`).

#### 2. Answer card component

**File**: `src/components/dashboard/AnswerCard.tsx` (new)

**Intent**: Display the most recent generated answer with the disclaimer
and the like toggle.

**Contract**: props `{ id: string; question: string; answer: string; liked: boolean }`.
Renders the question, the answer, a persistent disclaimer line ("to
rozrywka, nie porada"), and
`<form method="POST" action="/api/fairy/like">` with a hidden `id` field
and a submit button reflecting the current `liked` state in its
label/icon.

#### 3. Dashboard page rewrite

**File**: `src/pages/dashboard.astro` (modified)

**Intent**: Gate the ask flow on profile completeness; show the latest
answer after generation.

**Contract**: reads `context.locals.user` (already guaranteed by
middleware). Queries `profiles` for `name, birth_date`. If either is
null/empty, render a "complete your profile" prompt linking to
`/dashboard/profile` instead of `AskForm`. If both are present, render
`AskForm` (passing `Astro.url.searchParams.get("error")` as its
`serverError`). If `Astro.url.searchParams.get("response")` is present,
query that `fairy_responses` row (RLS scopes it to the current user
automatically) and render `AnswerCard` below the form.

#### 4. Ask route

**File**: `src/pages/api/fairy/ask.ts` (new)

**Intent**: Generate and persist an answer.

**Contract**: `POST` handler. If no `context.locals.user`, redirect to
`/auth/signin`. Reads `question` from form data; if empty or over 500
characters, redirect to `/dashboard?error=<message>`. Queries the user's
`profiles` row; if `name`/`birth_date` are still missing (defense in depth
against the UI gate being bypassed), redirect to `/dashboard/profile`.
Calls `generateFairyAnswer(profile, question)` from `src/lib/ai/fairy.ts`;
on a thrown error, redirect to `/dashboard?error=<generic message>`. On
success, inserts a `fairy_responses` row (`user_id`, `question`, `answer`)
and redirects to `/dashboard?response=<new row id>`.

#### 5. Like route

**File**: `src/pages/api/fairy/like.ts` (new)

**Intent**: Toggle the `liked` flag on a response the user owns.

**Contract**: `POST` handler. If no `context.locals.user`, redirect to
`/auth/signin`. Reads `id` from form data; reads the row's current `liked`
value (RLS scopes the read to `auth.uid()`), updates it to the opposite
boolean, and redirects to `/dashboard?response=<id>`.

### Success Criteria:

#### Automated Verification:

- Files exist: `test -f src/components/dashboard/AskForm.tsx && test -f src/components/dashboard/AnswerCard.tsx && test -f src/pages/api/fairy/ask.ts && test -f src/pages/api/fairy/like.ts`
- Ask route calls the AI module: `grep -q "generateFairyAnswer" src/pages/api/fairy/ask.ts`
- Ask route persists to the right table: `grep -q 'from("fairy_responses")' src/pages/api/fairy/ask.ts`
- Dashboard gates on profile fields: `grep -q "birth_date" src/pages/dashboard.astro`
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Incomplete profile: `/dashboard` shows the "complete your profile"
  prompt, not the ask form.
- Complete profile: asking a question shows the pending spinner
  immediately, then renders the generated, personalized answer with the
  disclaimer visible.
- Liking toggles the button's visible state and persists across a reload.
- A simulated AI failure shows an inline error banner on `/dashboard`
  rather than a crash or raw error page.

---

## Phase 4: Apply and verify against the real project

### Overview

Wire the production secret and walk the full flow end to end.

### Changes Required:

#### 1. Production secret

**File**: n/a (Cloudflare CLI, no repo changes)

**Intent**: Make `OPENROUTER_API_KEY` available to the deployed Worker.

**Contract**: `npx wrangler secret put OPENROUTER_API_KEY`, matching how
`SUPABASE_URL`/`SUPABASE_KEY` were set per
`context/deployment/deploy-plan.md`.

### Success Criteria:

#### Automated Verification:

- N/A — production secret configuration and live AI calls can't be checked
  from the repo.

#### Manual Verification:

- Full walkthrough on the deployed app: sign in → `/dashboard` prompts for
  profile → fill and save profile → `/dashboard` shows the ask form → ask
  a question → generated, personalized answer appears with the disclaimer,
  visible loading feedback shown throughout → like the answer → reload
  confirms the liked state persisted.
- Submitting a question over 500 characters is rejected.
- Temporarily breaking `OPENROUTER_API_KEY` (or simulating a failure)
  shows the inline error banner, not a raw 500 page.

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human
that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- None — no test framework installed, matching F-01/F-02 precedent.

### Integration Tests:

- None automated. Phase 4's manual walkthrough substitutes.

### Manual Testing Steps:

1. Sign in with a test account whose profile is still empty.
2. Confirm `/dashboard` shows the "complete your profile" prompt, not the
   ask form.
3. Fill and save the profile via `/dashboard/profile`; confirm redirect to
   `/dashboard` and that the ask form now appears.
4. Ask a question; confirm a visible pending state, then a generated
   answer referencing the profile context, with the disclaimer shown.
5. Like the answer; reload `/dashboard?response=<id>` and confirm the like
   state persisted.
6. Submit a question over 500 characters; confirm it's rejected client-
   and server-side.
7. Temporarily invalidate `OPENROUTER_API_KEY` locally and confirm the
   error banner path (not a crash).

## Performance Considerations

The OpenRouter call is a single `fetch` (I/O-bound), which stays well
under Cloudflare's free-tier 10ms CPU/invocation cap per
`infrastructure.md`'s risk register — wall-clock wait time during the fetch
is not billed as CPU. `max_tokens` on the generation call and the 500-char
caps on `about_me`/`question` bound both latency and per-call cost.

## Migration Notes

None — this slice reuses F-01's `profiles`/`fairy_responses` schema
unchanged; no new migration file.

## References

- Roadmap: `context/foundation/roadmap.md` (S-01, north star)
- PRD: `context/foundation/prd.md` (US-01, FR-002, FR-004, FR-005, FR-006,
  NFR feedback >2s / about_me limit / data privacy)
- Infrastructure risk register: `context/foundation/infrastructure.md`
  (Cloudflare 10ms CPU cap, external-API mitigation)
- Data foundation: `context/archive/2026-08-25-fairy-data-foundation/plan.md`
- Auth foundation: `context/archive/2026-08-25-passwordless-magic-link-auth/plan.md`
- Existing form patterns: `src/components/auth/{FormField,SubmitButton,ServerError,AuthForm}.tsx`
- Existing error-mapping pattern: `src/lib/auth-errors.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: AI integration module

#### Automated

- [x] 1.1 Module exists and exports the function — 51bbf92
- [x] 1.2 Calls the correct endpoint — 51bbf92
- [x] 1.3 Env var declared — 51bbf92
- [x] 1.4 Type checking passes — 51bbf92
- [x] 1.5 Linting passes — 51bbf92

#### Manual

- [x] 1.6 Code reviewed for correctness — 51bbf92

### Phase 2: Profile fill flow

#### Automated

- [x] 2.1 Files exist — 0332a76
- [x] 2.2 Save route touches the right table — 0332a76
- [x] 2.3 Server-side length guard present — 0332a76
- [x] 2.4 Type checking passes — 0332a76
- [x] 2.5 Linting passes — 0332a76

#### Manual

- [x] 2.6 Profile form renders empty then pre-filled, saves and persists — 0332a76
- [x] 2.7 about_me over 500 chars rejected with visible error — 0332a76

### Phase 3: Ask, answer, and like — with profile-completeness gating

#### Automated

- [x] 3.1 Files exist — 45bc8fc
- [x] 3.2 Ask route calls the AI module — 45bc8fc
- [x] 3.3 Ask route persists to the right table — 45bc8fc
- [x] 3.4 Dashboard gates on profile fields — 45bc8fc
- [x] 3.5 Type checking passes — 45bc8fc
- [x] 3.6 Linting passes — 45bc8fc

#### Manual

- [x] 3.7 Incomplete profile shows the completion prompt — 45bc8fc
- [x] 3.8 Complete profile: pending state then generated answer with disclaimer
- [x] 3.9 Like toggles and persists across reload
- [x] 3.10 AI failure shows inline error banner — 45bc8fc

### Phase 4: Apply and verify against the real project

#### Manual

- [x] 4.1 Full walkthrough succeeds end to end
- [x] 4.2 Over-length question rejected
- [x] 4.3 Broken API key shows error banner, not a crash
