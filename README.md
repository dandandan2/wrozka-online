# Wróżbita Online

A personalized "fortune teller" web app. A logged-in user asks a question,
gets a generated, in-character answer from the fairy, and can like answers
they enjoy — up to the 10 most recent likes are fed back into future
generations as a style reference, so responses drift toward the tone the
user actually prefers. It's entertainment, not advice: a visible disclaimer
and a deterministic safety filter keep generated answers from reading as
real medical, financial, or legal recommendations.

## Tech Stack

- [Astro](https://astro.build/) v6 - Server-first rendering
- [React](https://react.dev/) v19 - Interactive components (auth forms, dashboard)
- [TypeScript](https://www.typescriptlang.org/) v5
- [Tailwind CSS](https://tailwindcss.com/) v4
- [Supabase](https://supabase.com/) - Passwordless auth (magic link / OTP) + Postgres with RLS
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime
- [OpenRouter](https://openrouter.ai/) - LLM provider for generated fairy answers

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository and install dependencies:

```bash
git clone <repo-url>
cd wrozka-online
npm install
```

2. Set up Supabase and configure environment variables — see
   [Supabase Configuration](#supabase-configuration) below.

3. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

4. Add an OpenRouter API key (get one at [openrouter.ai](https://openrouter.ai/))
   to both `.env` and `.dev.vars`:

```
OPENROUTER_API_KEY=<your key>
```

5. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run deploy` - Build and deploy via Wrangler
- `npm run lint` / `npm run lint:fix` - ESLint (type-checked rules)
- `npm run format` - Prettier
- `npm test` / `npm run test:watch` - Vitest unit/integration suite
- `npm run astro check` - Typecheck

## Project Structure

```md
.
├── src/
│ ├── layouts/          # Astro layouts
│ ├── pages/
│ │ ├── auth/           # Sign-in, confirm-email pages
│ │ ├── dashboard/      # Profile, history pages
│ │ └── api/
│ │   ├── auth/         # request-link, verify-code, callback, signout
│ │   ├── fairy/        # ask, like, delete
│ │   └── profile/      # update
│ ├── components/       # UI components (Astro & React)
│ └── lib/
│   ├── ai/             # fairy.ts (answer generation), safety-checker.ts
│   └── supabase.ts     # Supabase client factory
├── supabase/migrations/ # profiles, fairy_responses tables + RLS policies
├── tests/               # Vitest unit/integration tests, Playwright e2e
├── context/foundation/  # PRD, test plan, roadmap, tech stack (10x workflow docs)
├── public/              # Public assets
└── wrangler.jsonc       # Cloudflare Workers config
```

## Core Flow

| Route                   | Description                                                       |
| ------------------------ | ------------------------------------------------------------------ |
| `/auth/signin`           | Request a magic link / one-time code by email                     |
| `/auth/confirm-email`    | "Check your inbox" page after requesting a link                   |
| `/dashboard`             | Ask the fairy a question, view/like the latest answer              |
| `/dashboard/profile`     | Edit name, birth date, and "about me" (used to personalize answers) |
| `/dashboard/history`     | View, like/unlike, and delete past questions and answers           |

Route protection is handled in `src/middleware.ts` (`PROTECTED_ROUTES`).
Deleting a history entry also removes it from the liked-answers pool used
for style personalization.

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for auth and data
storage (`profiles`, `fairy_responses`, both with row-level security scoping
every row to its owner — see `supabase/migrations/`). Environment variables
are declared via Astro's `astro:env` schema and are treated as
**server-only secrets** — never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Start the local stack (applies migrations, downloads Docker images on first run):

```bash
npx supabase start
```

3. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
OPENROUTER_API_KEY=<your OpenRouter key>
```

4. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

### Using a cloud Supabase project instead

Add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

Run migrations from `supabase/migrations/` against the cloud project (e.g.
`npx supabase db push`) before first use.

### Passwordless login

Sign-in is magic-link/OTP only (`supabase.auth.signInWithOtp`, no
passwords) — see `src/pages/api/auth/request-link.ts` and
`verify-code.ts`. In local development, Inbucket
(`http://localhost:54324`) catches outgoing emails so you can grab the
link/code without a real mailbox.

## Testing

Unit and integration tests run hermetically (mocked Supabase client/Auth
and mocked OpenRouter HTTP calls — no live network or Docker required):

```bash
npm test
```

Playwright e2e tests live under `tests/e2e/`. See
`context/foundation/test-plan.md` for the risk map these tests are
designed to cover.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

```bash
npm run build
npx wrangler deploy
```

Set `SUPABASE_URL`, `SUPABASE_KEY`, and `OPENROUTER_API_KEY` as secrets in
your Cloudflare dashboard or via `npx wrangler secret put`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs lint, unit/integration
tests, typecheck (`astro check`), and build on every push/PR to `main`, then
deploys on push to `main`. Configure `SUPABASE_URL`, `SUPABASE_KEY`, and
`CLOUDFLARE_API_TOKEN` as repository secrets.

## License

MIT
