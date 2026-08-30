// seed.spec.ts — the exemplar every generated E2E test in this project is modeled on.
// Pattern source: .claude/skills/10x-e2e/references/seed-test-pattern.md
import { test, expect } from "@playwright/test";

test("unauthenticated visitor requesting the dashboard is redirected to sign-in", async ({ page }) => {
  // Real risk: src/middleware.ts guards PROTECTED_ROUTES and must send anonymous
  // traffic to /auth/signin before any dashboard data loads (see test-plan.md risk #2).
  await page.goto("/dashboard");

  await page.waitForURL("**/auth/signin");
  await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();

  // No cleanup needed: this flow reads and redirects only, it never mutates state.
});

// Note: a second scenario exercising the magic-link submit → /auth/confirm-email
// redirect was deliberately left out of the seed. It needs a real Supabase project
// (SUPABASE_URL/SUPABASE_KEY) to respond to signInWithOtp; this sandbox has neither
// and no Docker to run one locally (same constraint test-plan.md documents for the
// unit/integration layer). Add it back once real Supabase credentials are available
// to the dev server.
