import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("3D arena renders geometry, shoots, turns and resizes in fullscreen", async ({
  page,
}) => {
  await page.goto("/simulations/doom");
  const canvas = page.locator(".doom-scene canvas");
  await expect(page.locator(".doom-scene")).toHaveAttribute(
    "data-status",
    "ready",
  );
  await expect(canvas).toHaveAttribute("data-rendered", "true");
  const pixels = await sharp(await canvas.screenshot()).stats();
  expect(
    Math.max(...pixels.channels.slice(0, 3).map((c) => c.stdev)),
  ).toBeGreaterThan(10);
  await page.getByRole("button", { name: "Start arena", exact: true }).click();
  await canvas.click();
  await expect(page.locator(".doom-screen-hud")).toContainText("31");
  const initialAngle = await canvas.getAttribute("data-angle");
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 70,
    bounds.y + bounds.height / 2,
    { steps: 3 },
  );
  await page.mouse.up();
  await expect
    .poll(() => canvas.getAttribute("data-angle"))
    .not.toBe(initialAngle);
  await page.getByRole("button", { name: "Pause arena", exact: true }).click();
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect(page.locator(".doom-arena-panel")).toHaveClass(
    /doom-fullscreen/,
  );
  await expect(canvas).toHaveAttribute("data-rendered", "true");
  await page
    .getByRole("button", { name: "Exit fullscreen", exact: true })
    .click();
  await page.getByText("Tactical map", { exact: true }).click();
  await expect(page.locator(".doom-minimap svg")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("missing WebGL exposes a playable tactical fallback", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      ...args: any[]
    ) {
      if (
        type === "webgl" ||
        type === "webgl2" ||
        type === "experimental-webgl"
      )
        return null;
      return (original as any).call(this, type, ...args);
    } as any;
  });
  await page.goto("/simulations/doom");
  await expect(page.locator(".doom-render-message")).toContainText(
    "3D graphics unavailable",
  );
  await page.getByText("Tactical map", { exact: true }).click();
  await expect(page.locator(".doom-minimap svg")).toBeVisible();
  await page.getByRole("button", { name: "Start arena", exact: true }).click();
  await page.getByRole("button", { name: "Shoot", exact: true }).click();
  await expect(page.locator(".doom-screen-hud")).toContainText("31");
  await page.getByRole("button", { name: "Pause arena", exact: true }).click();
});

test("JevDoom fullscreen fills the screen and captures a branded paused scene", async ({
  page,
}) => {
  await page.goto("/simulations/doom");
  await expect(page.locator(".doom-scene")).toHaveAttribute(
    "data-status",
    "ready",
  );
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect(page.locator(".doom-arena-panel")).toHaveClass(
    /doom-fullscreen/,
  );
  await expect
    .poll(
      async () =>
        (await page.locator(".doom-scene canvas").boundingBox())!.width,
    )
    .toBeGreaterThan(page.viewportSize()!.width - 5);
  const bounds = (await page.locator(".doom-scene canvas").boundingBox())!;
  expect(bounds.width).toBeGreaterThan(page.viewportSize()!.width - 5);
  expect(bounds.height).toBeGreaterThan(page.viewportSize()!.height - 5);
  await expect(page.locator(".jevdoom-brand")).toContainText("JevDoom");
  await page.getByRole("button", { name: "Start arena", exact: true }).click();
  await page
    .getByRole("button", { name: "Screenshot mode", exact: true })
    .click();
  await expect(page.locator(".doom-touch-controls")).toBeHidden();
  await expect(page.locator(".doom-capture-caption")).toBeVisible();
  const tick = await page.getByTestId("doom-tick").textContent();
  await page.waitForTimeout(350);
  expect(await page.getByTestId("doom-tick").textContent()).toBe(tick);
  await page
    .getByRole("button", { name: "Show controls", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start arena", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Exit fullscreen", exact: true })
    .click();
});

test("a complete human-controlled run reaches the sector-cleared screen", async ({
  page,
}) => {
  test.setTimeout(120000);
  const { readFile } = await import("node:fs/promises");
  const { ACTION_LABELS } = await import("../../lib/classifyActionWithJev");
  const run = JSON.parse(
    await readFile(
      process.cwd() + "/tests/fixtures/doom-winning-run.json",
      "utf8",
    ),
  );
  await page.goto("/simulations/doom");
  await expect(page.locator(".doom-scene")).toHaveAttribute(
    "data-status",
    "ready",
  );
  const start = new Date();
  await page.clock.install({ time: start });
  // Pause ahead of installation so transport latency cannot target the past.
  await page.clock.pauseAt(new Date(start.getTime() + 60_000));
  await page.getByRole("button", { name: "Start arena", exact: true }).click();
  for (const action of run.actions) {
    await page
      .locator(".doom-touch-controls")
      .getByRole("button", {
        name: ACTION_LABELS[action as keyof typeof ACTION_LABELS],
        exact: true,
      })
      .click();
    await page.clock.runFor(200);
  }
  await expect(page.locator(".doom-game-over strong")).toHaveText(
    "SECTOR CLEARED",
  );
  await expect(page.locator(".doom-screen-hud")).toContainText("5/5");
  await page
    .getByRole("button", { name: "Restart same seed", exact: true })
    .click();
  await expect(page.getByTestId("doom-tick")).toHaveText("0");
  await expect(page.locator(".doom-game-over")).toHaveCount(0);
});

test("paused keyboard input cannot queue a shot into the next run", async ({
  page,
}) => {
  await page.goto("/simulations/doom");
  await page.getByRole("application").focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Start arena", exact: true }).click();
  await expect
    .poll(async () => Number(await page.getByTestId("doom-tick").innerText()))
    .toBeGreaterThan(2);
  await page.getByRole("button", { name: "Pause arena", exact: true }).click();
  await expect(page.locator(".doom-screen-hud")).toContainText("32");
});
