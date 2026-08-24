---
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
---

## Why this stack

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
