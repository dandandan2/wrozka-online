/10x-rule-review AGENTS.md.# Repository Guidelines

Astro 6 SSR app (React 19 islands, Tailwind 4, Supabase auth, shadcn/ui) deployed to Cloudflare Workers. See `@CLAUDE.md.scaffold` for the full architecture rundown.

## Hard rules

- API routes must export `const prerender = false` and use uppercase `GET`/`POST` exports; validate input with zod.
- Use the `cn()` helper from `@/lib/utils` for conditional/merged Tailwind classes — never concatenate class strings manually.
- New Supabase tables always enable RLS with granular per-operation, per-role policies. Migrations live in `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql`.
- No Next.js directives (`"use client"`, etc.) in React components — this is Astro, not Next.
- Path alias `@/*` resolves to `./src/*` (`@tsconfig.json`).

## Project structure

- `src/pages/` — Astro pages and `src/pages/api/` endpoints; `src/pages/auth/` — signin/signup/confirm-email.
- `src/components/` — Astro + React components; `src/components/ui/` — shadcn/ui ("new-york" variant, add via `npx shadcn@latest add [name]`); extract hooks to `src/components/hooks/`.
- `src/lib/` — services/helpers (`src/lib/services/` for business logic); `src/lib/supabase.ts` — SSR Supabase client.
- `src/middleware.ts` — resolves `context.locals.user` on every request; edit `PROTECTED_ROUTES` there to gate new pages.
- `src/types.ts` — shared entities/DTOs.

## Build, test, and development

- `npm run dev` — Cloudflare workerd runtime dev server.
- `npm run build` / `npm run preview` — production build / preview.
- `npm run lint` / `npm run lint:fix` — ESLint with type-checked rules (`@eslint.config.js`).
- `npm run format` — Prettier (`@.prettierrc.json`, includes Astro + Tailwind plugins).
- No test runner is configured in this repo yet.

## Coding style

Enforced by `@eslint.config.js` and `@.prettierrc.json`; pre-commit runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}` via husky + lint-staged (`@package.json`).

## Environment & CI

- Node v22.14.0 (`@.nvmrc`). Env vars `SUPABASE_URL`/`SUPABASE_KEY` go in `.env` (Node) and `.dev.vars` (Cloudflare local, gitignored) — copy from `@.env.example`.
- `.github/workflows/ci.yml` runs lint + build on every push/PR to `master`; requires `SUPABASE_URL`/`SUPABASE_KEY` as repo secrets.

## Commit conventions

Repo history is too short (2 commits) to infer a convention — none established yet.
