// Risk: context/foundation/test-plan.md risk #2 — "Logowanie magic-link/kod zawodzi
// albo pozwala zalogować się jako inny użytkownik". Phase 1 (tests/unit/auth-*.test.ts)
// already proves the token/callback contract hermetically by calling route handlers
// directly, bypassing src/middleware.ts entirely. This spec instead drives the real
// running app end to end, so it is the one slice of risk #2 that only exists once
// auth, routing and cookies integrate for real — session guard on the /dashboard
// prefix, not just its exact path.
// Modeled on: tests/e2e/seed.spec.ts (role locators, waitForURL, no-cleanup reasoning)
import { test, expect } from "@playwright/test";

test("unauthenticated visitor is redirected to sign-in from every /dashboard subroute", async ({ page }) => {
  await page.goto("/dashboard/history");
  await page.waitForURL("**/auth/signin");
  await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();

  await page.goto("/dashboard/profile");
  await page.waitForURL("**/auth/signin");
  await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();

  // No cleanup needed: this flow reads and redirects only, it never mutates state.
});
