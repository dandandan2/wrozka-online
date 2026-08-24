---
bootstrapped_at: 2026-08-24T21:57:58Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: wrozbita-online
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: wrozbita-online
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

### Why this stack

A solo builder shipping "Wróżbita Online" in 3 after-hours weeks needs a
battle-tested, agent-friendly starter that handles auth, database, and edge
deploy out of the box rather than assembling them piecemeal. Astro+Supabase+
Cloudflare is the recommended default for `(web-app, js)` and clears all four
agent-friendly gates, with first-class bootstrapper confidence — mostly smooth
scaffolding with the odd manual step. Auth is in scope (passwordless magic-link
login per FR-001) and AI is in scope (personalized fairy-response generation
per FR-005), so both feature flags are set; payments, realtime, and background
jobs are out of scope per the PRD's non-goals and FR set. Deployment stays on
the starter's own default, Cloudflare Pages, and CI runs on GitHub Actions with
auto-deploy-on-merge — the standard shape for a solo, short-timeline project.

## Pre-scaffold verification

| Signal             | Value                                          | Severity | Notes                                        |
| ------------------ | ----------------------------------------------- | -------- | --------------------------------------------- |
| npm package        | not run                                          | n/a      | `cmd_template` starts with `git clone`; no npm package to resolve |
| GitHub repo        | przeprogramowani/10x-astro-starter last pushed 2026-08-22 | fresh    | from `card.docs_url`; fetched via GitHub REST API (`gh` CLI unavailable in this environment) |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 19 top-level entries (astro.config.mjs, components.json, .env.example, eslint.config.js, .github/, .gitignore [merged, not moved], .husky/, node_modules/, .nvmrc, package.json, package-lock.json, .prettierrc.json, public/, README.md, src/, supabase/, tsconfig.json, .vscode/, wrangler.jsonc, CLAUDE.md [conflict])
**Conflicts (.scaffold siblings)**: CLAUDE.md → CLAUDE.md.scaffold
**.gitignore handling**: append-merged (scaffold's dist/, .astro/, .env.production, .dev.vars/, .wrangler/ lines added under a `# from 10x-astro-starter` separator; existing cwd lines kept in place and order)
**.bootstrap-scaffold cleanup**: deleted (`.git/` removed first, then the temp directory after move-up)

Note: cwd's pre-existing `readme.md` (lowercase) and the scaffold's `README.md` (uppercase) are distinct paths on this case-sensitive filesystem, so both now coexist — not flagged by the conflict matrix as a literal-path collision, but worth a manual look.

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 1 CRITICAL, 13 HIGH, 7 MODERATE, 2 LOW
**Direct vs transitive**: 0/1/2/0 direct of total 1/13/7/2 (via `isDirect` + `metadata.dependencies` from npm audit's own output)

#### CRITICAL findings

- **tar** (range <=7.5.20, transitive) — node-tar: multiple advisories (infinite loop on negative entry size, PAX numeric path type confusion crash, PAX size override file-smuggling differential, uncontrolled recursion stack-overflow DoS, decompression DoS, uncaught exception via NUL byte in PAX records). See https://github.com/advisories/GHSA-8x88-c5mf-7j5w and related.

#### HIGH findings

- **astro** (range <=7.0.9, **direct**) — reflected/stored XSS via unescaped View Transition/slot-name/spread-attribute/transition:* values; Host header SSRF in prerendered error page fetch. See https://github.com/advisories/GHSA-4g3v-8h47-v7g6 and related.
- **brace-expansion** (transitive) — DoS via unbounded/exponential expansion.
- **devalue** (transitive) — DoS via sparse array deserialization.
- **fast-uri** (transitive) — host confusion via backslash/IDN authority parsing.
- **js-yaml** (transitive) — quadratic-complexity DoS in merge-key/omap handling.
- **miniflare** (transitive) — advisory present, no CVE detail parsed.
- **nanoid** (transitive) — indefinite loop on zero/negative size generators.
- **postcss** (transitive) — path traversal via sourceMappingURL leading to arbitrary .map file disclosure.
- **sharp** (transitive) — inherited libvips CVEs (2026-33327, 2026-33328, 2026-35590, 2026-35591).
- **svgo** (transitive) — removeScripts plugin leaves some executable scripts intact.
- **undici** (transitive) — multiple advisories: cross-user cache info disclosure, WebSocket DoS, Set-Cookie SameSite downgrade, TLS bypass in SOCKS5 proxy, header/CRLF injection, response desync.
- **vite** (transitive) — launch-editor NTLMv2 hash disclosure on Windows; `server.fs.deny` bypass on Windows.
- **ws** (transitive) — uninitialized memory disclosure; memory exhaustion DoS via tiny fragments.

#### MODERATE findings

- 7 moderate advisories present in the full `npm audit --json` output (not individually detailed here — see raw JSON output captured during this run if deeper inspection is needed; re-run `npm audit` in the project to regenerate).

#### LOW / INFO findings

- 2 low advisories present in the full `npm audit --json` output.

## Hints recorded but not acted on

| Hint                     | Value              |
| ------------------------ | ------------------- |
| bootstrapper_confidence  | first-class          |
| quality_override         | false                |
| path_taken               | standard             |
| self_check_answers       | null                 |
| team_size                | solo                 |
| deployment_target        | cloudflare-pages     |
| ci_provider              | github-actions       |
| ci_default_flow          | auto-deploy-on-merge |
| has_auth                 | true                 |
| has_payments             | false                |
| has_realtime             | false                |
| has_ai                   | true                 |
| has_background_jobs      | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history — this run deleted the cloned starter's `.git/` so no upstream history leaked in.
- Review `CLAUDE.md.scaffold` against your existing `CLAUDE.md` and merge in anything from the starter worth keeping (e.g. its project-specific dev notes).
- Reconcile `readme.md` (yours, currently near-empty) with the starter's `README.md` — the conflict matrix treated them as distinct files on this case-sensitive filesystem, so both exist side by side.
- Address the 1 CRITICAL (`tar`, transitive) and 1 direct HIGH (`astro`) finding first — `npm audit` in the project directory for the full detail, `npm audit fix` (or a manual `astro` upgrade past 7.0.9) as a starting point. The remaining HIGH/MODERATE/LOW findings are transitive; track upstream fixes.
- Set up Supabase project credentials in `.env` (copy from `.env.example`) before running the dev server.
