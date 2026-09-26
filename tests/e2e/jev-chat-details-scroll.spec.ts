import { test, expect, type Locator, type Page } from "@playwright/test";

// Opening a disclosure on a long reply must bring it into the transcript's
// visible area instead of expanding below the fold.

async function visibility(page: Page, target: Locator) {
  return target.evaluate((el) => {
    let scroller = el.parentElement;
    while (scroller && !scroller.classList.contains("jc-scroll"))
      scroller = scroller.parentElement;
    const r = el.getBoundingClientRect();
    const s = scroller!.getBoundingClientRect();
    const visible = Math.max(
      0,
      Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top),
    );
    return {
      // How much of the element is visible, relative to the most that could be.
      shown: visible / Math.min(r.height, s.height),
      topInView: r.top >= s.top - 1 && r.top < s.bottom,
      scrollTop: scroller!.scrollTop,
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/health", (r) =>
    r.fulfill({ json: { configured: false } }),
  );
  await page.route("**/api/run", (r) =>
    r.fulfill({ status: 500, json: { error: "Unexpected provider call." } }),
  );
  await page.goto("/language/jev-chat");
  await page.getByLabel("Chat mode").selectOption("demo");
  await page.getByLabel("Message Jev").fill("List all 50 state capitals");
  await page.getByLabel("Message Jev").press("Enter");
  await expect(
    page.locator(".jc-assistant").last().locator(".jc-message-text"),
  ).toContainText("Wyoming — Cheyenne");
});

test("opening the composition panel scrolls it into view, closing does not", async ({
  page,
}) => {
  const details = page.locator(".jc-composition-details").last();
  const summary = details.locator(":scope > summary");
  await summary.click();
  await expect(details).toHaveAttribute("open", "");
  await expect
    .poll(async () => (await visibility(page, details)).shown)
    .toBeGreaterThan(0.98);
  expect((await visibility(page, details)).topInView).toBe(true);

  // Closing must not scroll. The transcript only shrinks, so the browser may
  // clamp scrollTop to the new maximum; anything beyond that is our scroll.
  const before = (await visibility(page, details)).scrollTop;
  await summary.click();
  await expect(details).not.toHaveAttribute("open", "");
  await page.waitForTimeout(400);
  const after = await details.evaluate((el) => {
    const s = el.closest(".jc-scroll")!;
    return { top: s.scrollTop, max: s.scrollHeight - s.clientHeight };
  });
  expect(after.top).toBe(Math.min(before, after.max));
  await expect(summary).toBeInViewport();
});

test("keyboard toggle reveals the panel and verification status stays visible", async ({
  page,
}) => {
  const details = page.locator(".jc-composition-details").last();
  await details.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("open", "");
  await expect
    .poll(async () => (await visibility(page, details)).shown)
    .toBeGreaterThan(0.98);

  await details.getByRole("button", { name: "Verify content" }).click();
  const status = details.getByRole("status");
  await expect(status).toHaveText("Content integrity verified");
  await expect
    .poll(async () => (await visibility(page, status)).shown)
    .toBeGreaterThan(0.98);
});
