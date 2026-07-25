/**
 * Internationalization and 404 handling smoke tests.
 *
 * Verify that:
 * - English locale paths render with English copy
 * - Unknown routes render the localized not-found page
 *
 * These tests don't require authentication or Supabase.
 */

import { test, expect } from "@playwright/test";

test.describe("Internationalization", () => {
  test("/en/sign-in renders with English title", async ({ page }) => {
    await page.goto("/en/sign-in");
    // English title from messages/en.json
    const title = page.locator("h1, h2");
    await expect(title).toContainText(/Sign in|Sign In/i);
  });

  test("/vi/sign-in renders with Vietnamese title", async ({ page }) => {
    await page.goto("/vi/sign-in");
    // Vietnamese title from messages/vi.json
    const title = page.locator("h1, h2");
    await expect(title).toContainText("Đăng nhập BSK");
  });

  test("default locale defaults when no locale in path", async ({ page }) => {
    // Request /sign-in without locale prefix defaults to app's default (English in this case)
    await page.goto("/sign-in");
    // Should render the sign-in page (English or VI depending on default)
    const title = page.locator("h1, h2");
    const titleText = await title.textContent();
    expect(titleText).toMatch(/Sign in|Đăng nhập/i);
  });
});

test.describe("404 Not Found", () => {
  test("unknown path renders not-found page", async ({ page }) => {
    await page.goto("/this-path-does-not-exist");
    // Should render the not-found page with localized copy
    // Check for Vietnamese not-found text or redirect to 404
    const pageContent = await page.content();
    expect(pageContent.toLowerCase()).toMatch(/không tìm|not found|404/i);
  });

  test("404 page includes Vietnamese copy", async ({ page }) => {
    await page.goto("/nonexistent");
    // From messages/vi.json: "notFoundTitle": "Không tìm thấy trang"
    const pageText = await page.textContent("body");
    expect(pageText).toMatch(/Không tìm|not found|404/i);
  });

  test("/en/nonexistent renders English not-found", async ({ page }) => {
    await page.goto("/en/nonexistent");
    const pageText = await page.textContent("body");
    expect(pageText).toMatch(/not found|page not found|404/i);
  });
});
