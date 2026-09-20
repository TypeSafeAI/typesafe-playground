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
  // Assert the state before measuring: the grid width animates, so a bare
  // boundingBox() can sample mid-transition and read neither 224 nor 64.
  await expect(page.locator(".dashboard-shell")).toHaveClass(/nav-collapsed/);
  expect((await rail.boundingBox())!.x).toBe(0);
  // Collapsed to icon width by default here, not hidden and not a second
  // full-width column beside the conversation list.
  await expect
    .poll(async () => (await rail.boundingBox())!.width)
    .toBeLessThan(120);
  expect((await rail.boundingBox())!.width).toBeGreaterThan(40);
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
test("the collapsed default is per-route, not a stored preference", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/gate");
  // A workspace that has no stored preference starts expanded.
  await expect(page.locator(".dashboard-shell")).not.toHaveClass(
    /nav-collapsed/,
  );
  const expanded = await expandedWidth(page);
  await page.goto("/jev-chat");
  await expect(page.locator(".dashboard-shell")).toHaveClass(/nav-collapsed/);
  // Expanding here works, and does not leave the rail stuck collapsed later.
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.locator(".dashboard-shell")).not.toHaveClass(
    /nav-collapsed/,
  );
  await page.goto("/gate");
  expect(await expandedWidth(page)).toBe(expanded);
});
/** Settles the rail's width animation before reporting it. */
async function expandedWidth(page: import("@playwright/test").Page) {
  const rail = page.locator("aside.sidebar");
  await expect(page.locator(".dashboard-shell")).not.toHaveClass(
    /nav-collapsed/,
  );
  let last = -1;
  await expect
    .poll(async () => {
      const width = (await rail.boundingBox())!.width;
      const settled = width === last;
      last = width;
      return settled;
    })
    .toBe(true);
  return last;
}
