import { test, expect } from "@playwright/test";
import { DOOM_ACTIONS } from "../../types/doom";
test("Doom human controls shoot, pause, and preserve a comparable run", async ({
  page,
}) => {
  await page.goto("/simulations/doom");
  await page.getByRole("button", { name: "Start arena", exact: true }).click();
  await page.getByRole("application").focus();
  await page.keyboard.down("Space");
  await expect(page.locator(".doom-stats > div").first()).toContainText("1");
  await page.keyboard.up("Space");
  await page.getByRole("button", { name: "Pause arena", exact: true }).click();
  const tick = await page.getByTestId("doom-tick").innerText();
  await page.waitForTimeout(450);
  await expect(page.getByTestId("doom-tick")).toHaveText(tick);
  await page
    .getByRole("radio", { name: "Random baseline", exact: true })
    .click();
  await expect(page.getByTestId("doom-tick")).toHaveText("0");
  await expect(page.locator(".doom-scoreboard tbody tr").first()).toContainText(
    "last run",
  );
  await page.getByRole("button", { name: "Start arena", exact: true }).click();
  await expect
    .poll(async () => Number(await page.getByTestId("doom-tick").innerText()))
    .toBeGreaterThan(1);
  await page.getByRole("button", { name: "Pause arena", exact: true }).click();
});
test("Doom batches real frames, displays all probabilities and exposes chaos state", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/run", async (route) => {
    const p = route.request().postDataJSON();
    calls++;
    expect(p.state.frames).toHaveLength(4);
    const ticks = p.state.frames.map((f: any) => f.tick);
    expect(ticks).toEqual([ticks[0], ticks[0] + 1, ticks[0] + 2, ticks[0] + 3]);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(4);
    expect(Object.keys(p.questions.frame_0.criteria)).toEqual([
      ...DOOM_ACTIONS,
    ]);
    expect(
      p.state.frames.every((f: any) => f.features.enemy_distance === "unknown"),
    ).toBe(true);
    await route.fulfill({
      json: {
        answers: Object.fromEntries(
          Object.keys(p.questions).map((key) => [
            key,
            {
              type: "choice",
              choice: "shoot",
              confidence: 0.97,
              probabilities: Object.fromEntries(
                DOOM_ACTIONS.map((a) => [a, a === "shoot" ? 1 : 0]),
              ),
            },
          ]),
        ),
      },
    });
  });
  await page.goto("/simulations/doom");
  await page.getByRole("radio", { name: "Jev control", exact: true }).click();
  await page.getByLabel("Chaos mode · hide enemy distance").check();
  await page.getByRole("button", { name: "Start arena", exact: true }).click();
  await expect(page.locator(".doom-current-action")).toContainText(
    "97.0% confidence",
  );
  await page.getByRole("button", { name: "Pause arena", exact: true }).click();
  expect(calls).toBeGreaterThanOrEqual(1);
  const stoppedCalls = calls;
  await page.waitForTimeout(1300);
  expect(calls).toBe(stoppedCalls);
  await expect(page.locator(".doom-probabilities > div")).toHaveCount(10);
  await page.locator(".doom-state > summary").click();
  await expect(page.locator(".doom-feature-grid")).toContainText("unknown");
  await page.locator(".doom-trace > summary").click();
  await expect(page.locator(".doom-trace")).toContainText("history only");
  await expect(page.locator(".doom-trace")).toContainText("live candidate");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("Doom never applies delayed or invented model actions", async ({
  page,
}) => {
  await page.route("**/api/run", async (route) => {
    const p = route.request().postDataJSON();
    await route.fulfill({
      json: {
        answers: Object.fromEntries(
          Object.keys(p.questions).map((k) => [
            k,
            {
              type: "choice",
              choice: "run_script",
              confidence: 1,
              probabilities: { run_script: 1 },
            },
          ]),
        ),
      },
    });
  });
  await page.goto("/simulations/doom");
  await page.getByRole("radio", { name: "Jev control", exact: true }).click();
  await page.getByRole("button", { name: "Start arena", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Invalid",
    { ignoreCase: true },
  );
  await expect(page.locator(".doom-current-action strong")).toHaveText("Idle");
  await page.getByRole("button", { name: "Pause arena", exact: true }).click();
  await expect(page.locator(".doom-stats > div").first()).toContainText("0");
});

test("Doom waits for delayed decisions and quick taps survive the tick boundary", async ({
  page,
}) => {
  await page.route("**/api/run", async (route) => {
    const p = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.fulfill({
      json: {
        answers: Object.fromEntries(
          Object.keys(p.questions).map((key) => [
            key,
            {
              type: "choice",
              choice: "shoot",
              confidence: 1,
              probabilities: Object.fromEntries(
                DOOM_ACTIONS.map((a) => [a, a === "shoot" ? 1 : 0]),
              ),
            },
          ]),
        ),
      },
    });
  });
  await page.goto("/simulations/doom");
  await page.getByRole("radio", { name: "Jev control", exact: true }).click();
  await page.getByRole("button", { name: "Start arena", exact: true }).click();
  await expect(page.locator(".doom-current-action")).toContainText(
    "100.0% confidence",
  );
  await expect(page.locator(".doom-screen-hud")).toContainText("31");
  await page.getByRole("button", { name: "Pause arena", exact: true }).click();
  await page.locator(".doom-trace > summary").click();
  await expect(page.locator(".doom-trace")).toContainText("latest accepted");
  await page.getByRole("radio", { name: "Human control", exact: true }).click();
  await page.getByRole("button", { name: "Start arena", exact: true }).click();
  await page.getByRole("button", { name: "Shoot", exact: true }).click();
  await expect(page.locator(".doom-stats > div").last()).toContainText("100%");
  await page.getByRole("button", { name: "Pause arena", exact: true }).click();
});

test("Doom pauses on provider failure without silently retrying", async ({
  page,
}) => {
  let calls = 0;
  let submittedTick = 0;
  await page.route("**/api/run", async (route) => {
    submittedTick = route.request().postDataJSON().state.frames.at(-1).tick;
    calls++;
    await route.fulfill({
      status: 402,
      json: {
        error:
          "TypeSafe returned HTTP 402. Check your API configuration or try again.",
      },
    });
  });
  await page.goto("/simulations/doom");
  await page.getByRole("radio", { name: "Jev control", exact: true }).click();
  await page.getByRole("button", { name: "Start arena", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("402");
  await expect(page.getByTestId("doom-tick")).toHaveText(String(submittedTick));
  await expect(
    page.getByRole("button", { name: "Start arena", exact: true }),
  ).toBeVisible();
  const tick = await page.getByTestId("doom-tick").innerText();
  await page.waitForTimeout(1400);
  await expect(page.getByTestId("doom-tick")).toHaveText(tick);
  expect(calls).toBe(1);
});

test("Doom discards an in-flight decision when controls change", async ({
  page,
}) => {
  let received = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/run", async (route) => {
    const p = route.request().postDataJSON();
    received = true;
    await gate;
    await route
      .fulfill({
        json: {
          answers: Object.fromEntries(
            Object.keys(p.questions).map((key) => [
              key,
              {
                type: "choice",
                choice: "shoot",
                confidence: 1,
                probabilities: Object.fromEntries(
                  DOOM_ACTIONS.map((a) => [a, a === "shoot" ? 1 : 0]),
                ),
              },
            ]),
          ),
        },
      })
      .catch(() => {}); // Browser may already have aborted this request.
  });
  await page.goto("/simulations/doom");
  await page.getByRole("radio", { name: "Jev control", exact: true }).click();
  await page.getByRole("button", { name: "Start arena", exact: true }).click();
  await expect.poll(() => received).toBe(true);
  await page.getByRole("radio", { name: "Human control", exact: true }).click();
  release();
  await page.waitForTimeout(450);
  await expect(page.getByTestId("doom-tick")).toHaveText("0");
  await expect(page.locator(".doom-current-action strong")).toHaveText("Idle");
  await expect(page.locator(".doom-trace > summary")).toContainText(
    "0 batches",
  );
});

test("Doom fullscreen keeps controls reachable and exits without resetting", async ({
  page,
}) => {
  await page.goto("/simulations/doom");
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect(page.locator(".doom-arena-panel")).toHaveClass(
    /doom-fullscreen/,
  );
  await page.getByRole("button", { name: "Start arena", exact: true }).click();
  await page.getByRole("button", { name: "Shoot", exact: true }).click();
  await expect(page.locator(".doom-screen-hud")).toContainText("31");
  await page.getByRole("button", { name: "Pause arena", exact: true }).click();
  const tick = await page.getByTestId("doom-tick").innerText();
  await page
    .getByRole("button", { name: "Exit fullscreen", exact: true })
    .click();
  await expect(page.locator(".doom-arena-panel")).not.toHaveClass(
    /doom-fullscreen/,
  );
  await expect(page.getByTestId("doom-tick")).toHaveText(tick);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Doom fullscreen fallback supports Escape", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(document, "fullscreenEnabled", {
      value: false,
      configurable: true,
    }),
  );
  await page.goto("/simulations/doom");
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect(page.locator(".doom-arena-panel")).toHaveClass(
    /doom-fullscreen/,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".doom-arena-panel")).not.toHaveClass(
    /doom-fullscreen/,
  );
  await expect(
    page.getByRole("button", { name: "Fullscreen", exact: true }),
  ).toBeFocused();
});

test("Jev moves on the map, turns once, and holds aim while awaiting its next choice", async ({
  page,
}) => {
  let calls = 0;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/run", async (route) => {
    const payload = route.request().postDataJSON();
    const n = ++calls;
    if (n >= 3) await waiting;
    else await new Promise((resolve) => setTimeout(resolve, 700));
    const choice = n === 1 ? "move_forward" : n === 2 ? "turn_right" : "idle";
    await route
      .fulfill({
        json: {
          answers: Object.fromEntries(
            Object.keys(payload.questions).map((key) => [
              key,
              {
                type: "choice",
                choice,
                confidence: 0.99,
                probabilities: Object.fromEntries(
                  DOOM_ACTIONS.map((action) => [
                    action,
                    action === choice ? 1 : 0,
                  ]),
                ),
              },
            ]),
          ),
        },
      })
      .catch(() => {});
  });
  await page.goto("/simulations/doom");
  const viewport = page.locator(".doom-viewport");
  const x = Number(await viewport.getAttribute("data-player-x"));
  await page.getByRole("radio", { name: "Jev control", exact: true }).click();
  await page.getByRole("button", { name: "Start arena", exact: true }).click();
  await expect.poll(() => calls).toBeGreaterThanOrEqual(3);
  expect(Number(await viewport.getAttribute("data-player-x"))).toBeGreaterThan(
    x,
  );
  const angle = Number(await viewport.getAttribute("data-player-angle"));
  expect(angle).toBeCloseTo(Math.PI / 8);
  const tick = await page.getByTestId("doom-tick").textContent();
  await page.waitForTimeout(700);
  await expect(page.getByTestId("doom-tick")).toHaveText(tick!);
  expect(Number(await viewport.getAttribute("data-player-angle"))).toBe(angle);
  await page.getByRole("button", { name: "Pause arena", exact: true }).click();
  release();
});
