import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { ok: true, configured: false } }),
  );
  await page.route("**/api/run", () => {
    throw Error("Local comparison must not call Jev.");
  });
});

test("solver assets stay unloaded while browsing and idle", async ({
  page,
}) => {
  const workerRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/generated/twisty/"))
      workerRequests.push(request.url());
  });
  await page.goto("/");
  await page
    .getByRole("link", { name: "Open Twisty puzzle solver", exact: true })
    .click();
  await expect(page.locator(".twisty-board")).toHaveAttribute(
    "data-status",
    "ready",
  );
  expect(workerRequests).toEqual([]);
  await expect(page.locator(".twisty-proof")).toHaveCount(0);
});

for (const puzzle of ["2×2 cube", "3×3 cube", "4×4 cube", "Megaminx"]) {
  test(`${puzzle}: actual local worker solves and playback reaches the checked end`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/simulations/twisty-puzzles");
    await page
      .getByRole("button", { name: "Local solver", exact: true })
      .click();
    await page.getByRole("button", { name: puzzle, exact: true }).click();
    await expect(page.locator(".twisty-board")).toHaveAttribute(
      "data-status",
      "ready",
    );
    await expect(page.locator(".twisty-board svg")).toBeVisible();
    const colors = () =>
      page
        .locator(".twisty-board svg stop")
        .evaluateAll((stops) =>
          stops.map((stop) => stop.getAttribute("stop-color")),
        );
    const solvedColors = await colors();
    expect(solvedColors.length).toBeGreaterThan(0);
    await page
      .getByRole("button", { name: "Load scramble", exact: true })
      .click();
    await expect.poll(colors).not.toEqual(solvedColors);
    await page
      .getByRole("button", { name: "Solve puzzle", exact: true })
      .click();
    await expect(page.locator(".twisty-proof")).toContainText("Verified", {
      timeout: 25_000,
    });
    await expect(page.locator(".twisty-proof")).toContainText("State search");
    await page.getByRole("button", { name: "Next solution step" }).click();
    await expect(page.locator(".twisty-step-controls")).toContainText(
      "Step 1 of",
    );
    await page.getByRole("button", { name: "Previous solution step" }).click();
    await expect(page.locator(".twisty-step-controls")).toContainText(
      "Step 0 of",
    );
    await page
      .getByRole("group", { name: "Solution steps" })
      .getByRole("button")
      .last()
      .click();
    await expect(
      page.getByRole("heading", { name: "Solved position" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Next solution step" }),
    ).toBeDisabled();
    await expect.poll(colors).toEqual(solvedColors);
    expect(errors).toEqual([]);
  });
}

test("drafts are separate per puzzle, survive refresh and invalid notation cannot be solved", async ({
  page,
}) => {
  await page.goto("/simulations/twisty-puzzles");
  await page.getByRole("button", { name: "Local solver", exact: true }).click();
  const input = page.getByLabel("Scramble from a solved puzzle");
  await input.fill("R U2 F'");
  await page.getByRole("button", { name: "2×2 cube", exact: true }).click();
  await input.fill("F R2");
  await page.reload();
  await expect(input).toHaveValue("F R2");
  await page.getByRole("button", { name: "3×3 cube", exact: true }).click();
  await expect(input).toHaveValue("R U2 F'");
  await input.fill("(R U)999999");
  await page
    .getByRole("button", { name: "Load scramble", exact: true })
    .click();
  await expect(
    page.locator(".twisty-controls").getByRole("alert"),
  ).toContainText("Unsupported move");
  await expect(
    page.getByRole("button", { name: "One Jev move", exact: true }),
  ).toBeDisabled();
});

test("narrow, short and dark layouts preserve controls and keyboard guidance", async ({
  page,
}) => {
  await page.goto("/simulations/twisty-puzzles");
  await page.getByRole("button", { name: "Local solver", exact: true }).click();
  for (const size of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    const guide = page.getByRole("button", {
      name: "Workspace guide",
      exact: true,
    });
    await guide.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toContainText("Twisty puzzle");
    await page.keyboard.press("Escape");
    await expect(guide).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".twisty-workspace")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("cancel terminates a pending search and a late reply cannot restore its result", async ({
  page,
}) => {
  await page.route("**/generated/twisty/worker-*.js", async (route) => {
    await route.fulfill({
      contentType: "text/javascript",
      body: `
      self.onmessage = () => setTimeout(() => self.postMessage({
        result: { puzzle: "3x3x3", scramble: "R", solution: "R'", moves: ["R'"], method: "state-search", verified: true }
      }), 1000);
    `,
    });
  });
  await page.goto("/simulations/twisty-puzzles");
  await page.getByRole("button", { name: "Local solver", exact: true }).click();
  await page.getByLabel("Scramble from a solved puzzle").fill("R");
  await page
    .getByRole("button", { name: "Load scramble", exact: true })
    .click();
  await page.getByRole("button", { name: "Solve puzzle", exact: true }).click();
  await page
    .getByRole("button", { name: "Cancel search", exact: true })
    .click();
  await expect(page.locator(".twisty-status")).toContainText("cancelled");
  // The injected worker deliberately replies late; observe beyond its deadline.
  await page.waitForTimeout(1200);
  await expect(page.locator(".twisty-proof")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Solve puzzle", exact: true }),
  ).toBeEnabled();
});
