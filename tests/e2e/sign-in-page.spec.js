/**
 * Sign-in page smoke tests — verify UI rendering and interactions.
 *
 * These are infrastructure-level tests that verify the sign-in form
 * renders and basic interactions work without a real Supabase instance.
 *
 * Full credential validation tests are BLOCKED on a provisioned
 * Supabase project with test user accounts.
 * (see tests/e2e/README.md for prerequisites).
 */

import { test, expect } from "@playwright/test";

test.describe("Sign-in page", () => {
  test("sign-in page renders", async ({ page }) => {
    await page.goto("/vi/sign-in");
    // Check for Vietnamese sign-in title from messages/vi.json
    const title = page.locator("h1, h2");
    await expect(title).toContainText("Đăng nhập BSK");
  });

  test("displays email and password inputs", async ({ page }) => {
    await page.goto("/vi/sign-in");
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  test("email input has autofocus", async ({ page }) => {
    await page.goto("/vi/sign-in");
    const emailInput = page.locator('input[type="email"]');
    // Check if autofocus was set (may not be settable/gettable in Playwright, but visible is enough)
    await expect(emailInput).toBeFocused();
  });

  test("password reveal toggle switches input type", async ({ page }) => {
    await page.goto("/vi/sign-in");
    const passwordInput = page.locator('input[id="password"]');
    // Toggle button is a button element with aria-label containing "Hiện" or "Ẩn"
    const toggleButton = page
      .locator('button[aria-label*="Hiện"], button[aria-label*="Ẩn"]')
      .first();

    // Initially password type
    await expect(passwordInput).toHaveAttribute("type", "password");

    // Click toggle to reveal password
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute("type", "text");

    // Click again to hide password
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute("type", "password");
  });

  test("submit button is enabled on empty form", async ({ page }) => {
    await page.goto("/sign-in");
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).not.toBeDisabled();
  });

  test("form is interactive", async ({ page }) => {
    await page.goto("/sign-in");
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');

    // Type in the email field
    await emailInput.fill("test@example.com");
    await expect(emailInput).toHaveValue("test@example.com");

    // Type in the password field
    await passwordInput.fill("testpassword");
    await expect(passwordInput).toHaveValue("testpassword");
  });
});
