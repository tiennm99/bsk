/**
 * Auth gate smoke tests — unauthenticated requests redirect to sign-in.
 *
 * These are infrastructure-level tests that verify the auth middleware
 * works without a live Supabase instance. They assert that protected
 * routes deny access and redirect correctly.
 *
 * Full session + queue→checkup→prescription happy-path tests are
 * BLOCKED on a provisioned Supabase project with seed data
 * (see tests/e2e/README.md for prerequisites).
 */

import { test, expect } from "@playwright/test";

test.describe("Auth Gate", () => {
  test("unauthenticated /dashboard redirects to sign-in", async ({ page }) => {
    await page.goto("/dashboard");
    // Should redirect to sign-in page
    expect(page.url()).toContain("/sign-in");
  });

  test("unauthenticated /queue redirects to sign-in", async ({ page }) => {
    await page.goto("/queue");
    // Should redirect to sign-in page
    expect(page.url()).toContain("/sign-in");
  });

  test("unauthenticated /patients redirects to sign-in", async ({ page }) => {
    await page.goto("/patients");
    // Should redirect to sign-in page
    expect(page.url()).toContain("/sign-in");
  });

  test("sign-in form is visible after redirect", async ({ page }) => {
    await page.goto("/dashboard");
    // Wait for sign-in form to load
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
  });
});
