import { test, expect } from "@playwright/test";
/**
 * The chat studio used to hide the shell siderail to get a focused canvas,
 * which left this the only workspace you could not navigate out of. It keeps
 * the rail now; the studio's own conversation list sits beside it.
 */
test("the shell siderail navigates out of the chat studio", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/jev-chat");
  const rail = page.locator("aside.sidebar");
  await expect(rail).toBeVisible();
  const bounds = await rail.boundingBox();
  expect(bounds!.x).toBe(0);
  expect(bounds!.width).toBeGreaterThan(50);
  // The studio's own panel is a separate surface, not the shell rail.
  await expect(page.locator(".jev-chat-studio")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await rail.getByRole("link", { name: "Ask gate", exact: true }).click();
  await expect(page).toHaveURL(/\/gate$/);
});
test("narrow screens reach the same navigation through the menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/jev-chat");
  await expect(page.locator("aside.sidebar")).toBeHidden();
  await page.locator(".mobile-menu").click();
  const rail = page.locator("aside.sidebar");
  await expect(rail).toBeVisible();
  await rail.getByRole("link", { name: "Ask gate", exact: true }).click();
  await expect(page).toHaveURL(/\/gate$/);
});
