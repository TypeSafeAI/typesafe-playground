import { test, expect } from "@playwright/test";
/**
 * The example builder's two side panels collapse independently. Results always
 * could; the library rail is the newer half, and the grid tracks are shared
 * variables, so collapsing one must not disturb the other.
 */
test("the examples rail collapses and restores alongside the results panel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 950 });
  await page.goto("/language/examples");
  const layout = page.locator(".examples-layout");
  const rail = page.locator(".library-panel");
  const search = page.getByLabel("Search examples", { exact: true });
  // Prove it is there before asserting it disappears, so a wrong selector
  // cannot make the hidden assertion pass for the wrong reason.
  await expect(search).toBeVisible();
  const expanded = (await rail.boundingBox())!.width;
  expect(expanded).toBeGreaterThan(150);

  await page.getByRole("button", { name: "Collapse examples" }).click();
  await expect(layout).toHaveClass(/library-collapsed/);
  await expect
    .poll(async () => (await rail.boundingBox())!.width)
    .toBeLessThan(90);
  // Collapsed, the rail keeps only its own toggle: the filters and the list
  // would be unreadable squeezed into the strip.
  await expect(search).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  // Both panels collapsed at once still leaves the editor usable.
  await expect(layout).toHaveClass(/results-collapsed/);
  await expect(page.getByRole("button", { name: "Run example" })).toBeVisible();

  await page.getByRole("button", { name: "Expand examples" }).click();
  await expect(layout).not.toHaveClass(/library-collapsed/);
  await expect
    .poll(async () => (await rail.boundingBox())!.width)
    .toBe(expanded);
  await expect(search).toBeVisible();
});

test("read-only JSON renders as a tree that folds, filters and copies", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name === "mobile", "Clipboard grant is desktop-only.");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1600, height: 950 });
  await page.goto("/language/examples");
  await page.getByText("Reply intent", { exact: true }).click();
  const view = page.locator(".json-view").first();
  await view.scrollIntoViewIfNeeded();

  // Values arrive parsed, so keys and typed scalars render as distinct nodes
  // rather than one preformatted blob.
  await expect(view.locator(".json-key").first()).toBeVisible();
  const keys = await view.locator(".json-key").count();
  expect(keys).toBeGreaterThan(1);

  // Filtering narrows to matching entries and recovers when cleared.
  const search = view.locator('input[type="search"]');
  await search.fill("question");
  await expect.poll(async () => view.locator(".json-key").count()).toBeLessThan(keys);
  await search.fill("");
  await expect.poll(async () => view.locator(".json-key").count()).toBe(keys);

  // A filter matching nothing says so rather than rendering an empty box.
  await search.fill("zzzz-no-such-key");
  await expect(view.locator(".json-empty")).toBeVisible();
  await search.fill("");

  // Folding the root hides its children and reports what is inside.
  await view.locator(".json-caret").first().click();
  await expect(view.locator(".json-summary")).toHaveText(/\d+ (keys|items)/);
  await expect(view.locator(".json-key")).toHaveCount(0);
  await view.locator(".json-caret").first().click();
  await expect.poll(async () => view.locator(".json-key").count()).toBe(keys);

  // Copy puts the original value on the clipboard, still valid JSON.
  await view.getByRole("button", { name: /^Copy/ }).click();
  await expect(view.locator(".json-copy")).toContainText("Copied");
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(() => JSON.parse(clip)).not.toThrow();
});
