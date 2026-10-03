import { test, expect } from "@playwright/test";

const path = "/simulations/trolley-problems";
const answer = (choice = "pull") => ({
  answers: {
    action: {
      type: "choice",
      choice,
      confidence: 0.8,
      probabilities: { pull: 0.8, stay: 0.2 },
    },
  },
});

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { configured: true } }),
  );
  await page.route("**/api/run", () => {
    throw Error("Unexpected Jev request; tests must mock each run.");
  });
});

test("human choices animate both routes without calling Jev, including uncertain outcomes", async ({
  page,
}) => {
  await page.goto(path);
  const scene = page.getByRole("img", { name: /trolley scene/ });
  await expect(scene).toHaveAttribute("data-action", "ready");
  await page
    .getByRole("button", { name: "Pull the lever", exact: true })
    .click();
  await expect(scene).toHaveAttribute("data-action", "pull");
  await expect(page.getByLabel("Hypothetical outcome")).toContainText(
    "Human choice",
  );
  await expect(page.getByLabel("Hypothetical outcome")).toContainText(
    "One person dies; five survive",
  );
  await expect(page.getByLabel("Jev choice probabilities")).toContainText(
    "Awaiting Jev",
  );
  await page.getByRole("button", { name: "Do nothing", exact: true }).click();
  await expect(scene).toHaveAttribute("data-action", "stay");
  await page.getByLabel("Trolley scenario").selectOption("7");
  await page
    .getByRole("button", { name: "Pull the lever", exact: true })
    .click();
  await expect(page.getByLabel("Hypothetical outcome")).toContainText(
    "outcome remains unknown",
  );
  await expect(
    page
      .getByRole("region", { name: "Recent trolley decisions" })
      .locator("li"),
  ).toHaveCount(3);
});

test("Jev uses the real API adapter and applies the provider choice with its distribution", async ({
  page,
}) => {
  const requests: unknown[] = [];
  await page.route("**/api/run", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: answer("stay") });
  });
  await page.goto(path);
  await page.getByLabel("Trolley scenario").selectOption("4");
  await page
    .getByRole("button", { name: "Let Jev decide", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: /trolley scene/ }),
  ).toHaveAttribute("data-action", "stay");
  await expect(page.getByLabel("Hypothetical outcome")).toContainText(
    "Jev choice",
  );
  await expect(page.getByLabel("Hypothetical outcome")).toContainText(
    "human survives",
  );
  await expect(page.getByLabel("Jev choice probabilities")).toContainText(
    "80.0%",
  );
  await expect(page.getByLabel("Jev choice probabilities")).toContainText(
    "20.0%",
  );
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    model: "jev-latest",
    state: { scenario_id: "robots-or-human" },
    questions: {
      action: {
        type: "choice",
        criteria: { pull: expect.any(String), stay: expect.any(String) },
      },
    },
  });
  expect(JSON.stringify(requests[0])).toContain("non-sentient");
  await expect(
    page.getByRole("button", { name: "Let Jev decide", exact: true }),
  ).toBeEnabled();
  await page.waitForTimeout(200);
  expect(requests).toHaveLength(1);
});

for (const failure of ["provider", "invalid", "incomplete"]) {
  test(`${failure} response stops with no local fallback or invented probabilities`, async ({
    page,
  }) => {
    let requests = 0;
    await page.route("**/api/run", (route) => {
      requests++;
      return failure === "provider"
        ? route.fulfill({ status: 503, json: { error: "Unavailable" } })
        : route.fulfill({
            json:
              failure === "invalid"
                ? answer("invented")
                : {
                    answers: {
                      action: {
                        ...answer().answers.action,
                        probabilities: { pull: 1 },
                      },
                    },
                  },
          });
    });
    await page.goto(path);
    await page.getByRole("button", { name: "Run all 12", exact: true }).click();
    await expect(
      page.locator(".trolley-console").getByRole("alert"),
    ).toContainText("No replacement action");
    await expect(
      page.getByRole("img", { name: /trolley scene/ }),
    ).toHaveAttribute("data-action", "ready");
    await expect(page.getByLabel("Jev choice probabilities")).toContainText(
      "Awaiting Jev",
    );
    await expect(
      page
        .getByRole("region", { name: "Recent trolley decisions" })
        .locator("li"),
    ).toHaveCount(0);
    expect(requests).toBe(1);
  });
}

for (const change of [
  "pause",
  "scenario",
  "reset",
  "hidden",
  "key",
  "navigate",
]) {
  test(`${change} discards a late response and stops the batch`, async ({
    page,
  }) => {
    let requests = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/run", async (route) => {
      requests++;
      await pending;
      await route.fulfill({ json: answer() }).catch(() => {});
    });
    await page.goto(path);
    await page.getByRole("button", { name: "Run all 12", exact: true }).click();
    await expect.poll(() => requests).toBe(1);
    if (change === "pause")
      await page.getByRole("button", { name: "Pause", exact: true }).click();
    if (change === "scenario")
      await page.getByLabel("Trolley scenario").selectOption("4");
    if (change === "reset")
      await page.getByRole("button", { name: "Reset trolley session" }).click();
    if (change === "hidden")
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          get: () => true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    if (change === "key")
      await page.evaluate(() => {
        localStorage.setItem(
          "typesafe-api-key-revision",
          "synthetic-new-revision",
        );
        window.dispatchEvent(new Event("typesafe-api-key-change"));
      });
    if (change === "navigate") await page.goto("/simulations");
    release();
    await page.waitForTimeout(250);
    expect(requests).toBe(1);
    if (change !== "navigate") {
      await expect(
        page.getByRole("img", { name: /trolley scene/ }),
      ).toHaveAttribute("data-action", "ready");
      await expect(
        page
          .getByRole("region", { name: "Recent trolley decisions" })
          .locator("li"),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Pause", exact: true }),
      ).toBeDisabled();
    }
  });
}

test("run all completes exactly twelve decisions and exports source-labeled receipts", async ({
  page,
}) => {
  test.setTimeout(45_000); // Twelve deliberate 1.8s reading holds, plus network/UI overhead.
  const ids: string[] = [];
  await page.route("**/api/run", (route) => {
    ids.push(route.request().postDataJSON().state.scenario_id);
    return route.fulfill({ json: answer() });
  });
  await page.goto(path);
  await page.getByLabel("Trolley scenario").selectOption("4");
  await page.getByRole("button", { name: "Run all 12", exact: true }).click();
  await expect(page.locator(".trolley-status")).toContainText(
    "All twelve scenarios complete",
    { timeout: 35_000 },
  );
  expect(ids).toHaveLength(12);
  expect(new Set(ids).size).toBe(12);
  expect(ids[0]).toBe("classic-switch");
  expect(ids[11]).toBe("empty-tracks");
  await expect(
    page
      .getByRole("region", { name: "Recent trolley decisions" })
      .locator("li"),
  ).toHaveCount(12);
  await expect(page.locator(".trolley-status")).toContainText(
    "12 / 12 decisions",
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  expect(exported.decisions).toHaveLength(12);
  expect(
    exported.decisions.every(
      (entry: { source: string }) => entry.source === "jev",
    ),
  ).toBe(true);
  expect(JSON.stringify(exported)).not.toMatch(
    /api.key|authorization|correctness_score/i,
  );
});

test("deadline stops a stalled request", async ({ page }) => {
  await page.goto(path);
  await page.clock.install();
  let requested = false;
  await page.route("**/api/run", () => {
    requested = true;
  });
  await page
    .getByRole("button", { name: "Let Jev decide", exact: true })
    .click();
  await expect.poll(() => requested).toBe(true);
  await page.clock.runFor(45_100);
  await expect(
    page.locator(".trolley-console").getByRole("alert"),
  ).toContainText("No replacement action");
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeDisabled();
});

test("keyboard, reduced motion, themes and narrow reflow retain the controls", async ({
  page,
}) => {
  await page.goto(path);
  const human = page.getByRole("button", {
    name: "Pull the lever",
    exact: true,
  });
  await human.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Hypothetical outcome")).toContainText(
    "Human choice",
  );
  await expect(page.locator(".trolley-tram")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(page.locator(".trolley-tram")).toHaveCSS(
    "offset-distance",
    "100%",
  );
  const guide = page.getByRole("button", {
    name: "Workspace guide",
    exact: true,
  });
  await guide.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Trolley problems");
  await page.keyboard.press("Escape");
  await expect(guide).toBeFocused();
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  for (const size of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".trolley-lab")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await human.scrollIntoViewIfNeeded();
    await expect(human).toBeInViewport();
    const live = page.getByRole("button", {
      name: "Let Jev decide",
      exact: true,
    });
    await live.scrollIntoViewIfNeeded();
    await expect(live).toBeInViewport();
  }
});

test("all twelve scenes and outcomes fit the desktop task viewport", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Desktop fit; mobile reflow is checked separately.",
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(path);
  for (let index = 0; index < 12; index++) {
    await page.getByLabel("Trolley scenario").selectOption(String(index));
    await page
      .getByRole("button", { name: "Pull the lever", exact: true })
      .click();
    await expect(page.getByLabel("Hypothetical outcome")).toBeInViewport({
      ratio: 1,
    });
    expect(
      await page
        .locator(".trolley-stage")
        .evaluate((element) => element.scrollHeight - element.clientHeight),
    ).toBeLessThanOrEqual(1);
    expect(
      await page
        .locator(".trolley-console")
        .evaluate((element) => element.scrollHeight - element.clientHeight),
    ).toBeLessThanOrEqual(1);
    expect(
      await page.locator(".trolley-track-label").evaluateAll((labels) =>
        labels.every((label) => {
          const bounds = (label as SVGGraphicsElement).getBBox();
          return bounds.x >= 0 && bounds.x + bounds.width <= 720;
        }),
      ),
    ).toBe(true);
  }
});

test("the trolley visibly travels along the selected track when motion is enabled", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(path);
  for (const action of ["Pull the lever", "Do nothing"]) {
    await page.getByRole("button", { name: action, exact: true }).click();
    const tram = page.locator(".trolley-tram");
    await expect(tram).toHaveCSS("animation-name", "trolley-travel");
    const initial = await tram.boundingBox();
    await expect(tram).toHaveCSS("offset-distance", "100%");
    const final = await tram.boundingBox();
    expect(final!.x).toBeGreaterThan(initial!.x + 40);
    if (action === "Pull the lever")
      expect(final!.y).toBeLessThan(initial!.y - 10);
  }
});
