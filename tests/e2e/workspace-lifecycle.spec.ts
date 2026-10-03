import { test, expect } from "@playwright/test";

test("arcade pause/resume keeps one local loop and cancels its timer on navigation", async ({
  page,
}) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { configured: false } }),
  );
  await page.clock.install({ time: new Date("2026-10-03T12:00:00Z") });
  await page.goto("/arcade/meteor-dodge");
  await page.getByLabel("Speed").selectOption("slow");
  await page.clock.pauseAt(new Date("2026-10-03T12:01:00Z"));
  await page.evaluate(() => {
    const native = window.setTimeout;
    (window as any).orphanedArcadeTimers = 0;
    window.setTimeout = ((
      handler: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) => {
      const arcade = delay === 320 && !!document.querySelector(".arcade-stage");
      if (!arcade || typeof handler !== "function")
        return native(handler, delay, ...args);
      return native(() => {
        if (!document.querySelector(".arcade-stage"))
          (window as any).orphanedArcadeTimers++;
        handler(...args);
      }, delay);
    }) as typeof window.setTimeout;
  });
  const moves = page.locator(".arcade-log > li");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(moves).toHaveCount(1);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(moves).toHaveCount(2);
  await page.clock.runFor(320);
  expect(await moves.count()).toBe(3);
  // Use client navigation so a document reload cannot hide an orphaned timer.
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.locator(".arcade-stage")).toHaveCount(0);
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => (window as any).orphanedArcadeTimers)).toBe(
    0,
  );
});

test("chat history releases its backdrop and focus trap when the viewport widens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/language/jev-chat");
  await page
    .getByRole("button", { name: "Conversation history", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Close history", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator(".jc-backdrop")).toHaveCount(0);
  const composer = page.locator(".jc-composer textarea");
  await expect(composer).toBeFocused();
  await composer.fill("A draft after rotating");
  await expect(composer).toHaveValue("A draft after rotating");
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await expect(page.locator(".jc-backdrop")).toBeVisible();
  await page
    .getByRole("button", { name: "Close guide panel", exact: true })
    .click();
  await expect(page.locator(".jc-backdrop")).toHaveCount(0);
});

test("the shared usage clock sleeps when closed or hidden and resumes for the dialog", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const create = window.setInterval,
      clear = window.clearInterval;
    const active = new Set<number>();
    (window as any).activeUsageClocks = active;
    window.setInterval = ((
      handler: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) => {
      const id = create(handler, delay, ...args);
      if (delay === 1000) active.add(id);
      return id;
    }) as typeof window.setInterval;
    window.clearInterval = ((id?: number) => {
      if (id !== undefined) active.delete(id);
      clear(id);
    }) as typeof window.clearInterval;
  });
  await page.goto("/");
  const clocks = () =>
    page.evaluate(() => (window as any).activeUsageClocks.size);
  await page.getByRole("button", { name: "Open API usage dashboard" }).click();
  await expect.poll(clocks).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(clocks).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(clocks).toBe(1);
  await page.getByRole("button", { name: "Close usage dashboard" }).click();
  await expect.poll(clocks).toBe(0);
});

test("a timed usage block still expires while its dialog is closed", async ({
  page,
}) => {
  await page.route("**/api/run", (route) =>
    route.fulfill({
      status: 429,
      json: {
        error: "Wait for the reported reset",
        _playgroundUsage: {
          attempted: true,
          status: 429,
          retryAt: new Date(Date.now() + 2000).toISOString(),
          inputTokens: null,
          outputTokens: null,
        },
      },
    }),
  );
  await page.goto("/language/extraction");
  const run = page.getByRole("button", { name: "Run extraction", exact: true });
  const badge = page.getByRole("button", { name: "Open API usage dashboard" });
  await run.click();
  await expect(badge).toContainText("Calls paused");
  await expect(run).toBeDisabled();
  await expect(run).toBeEnabled({ timeout: 5000 });
  await expect(badge).not.toContainText("Calls paused");
});

test("arcade cannot start playback during an in-flight single move", async ({
  page,
}) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { configured: true } }),
  );
  let release: (() => void) | undefined;
  await page.route("**/api/run", async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    const payload = route.request().postDataJSON();
    const action = Object.keys(payload.questions.action.criteria)[0];
    await route.fulfill({
      json: {
        answers: {
          action: {
            type: "choice",
            choice: action,
            confidence: 1,
            probabilities: { [action]: 1 },
          },
        },
      },
    });
  });
  await page.goto("/arcade/breakout");
  await page.getByLabel("Player").selectOption("jev");
  await page.getByRole("button", { name: "One move", exact: true }).click();
  await expect.poll(() => !!release).toBe(true);
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeDisabled();
  release!();
  await expect(page.locator(".arcade-log > li")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeEnabled();
});
