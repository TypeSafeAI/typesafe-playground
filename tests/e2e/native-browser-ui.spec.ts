import { test, expect } from "@playwright/test";

test("native workspace retains source labels and fits short, wide and narrow screens", async ({
  page,
}) => {
  await page.goto("/agents/jev-browser-agent/native");
  for (const [width, height] of [
    [1920, 1080],
    [1280, 720],
    [390, 844],
    [320, 568],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(
      page.getByText("Synthetic task · live Jev decisions", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width > 900) {
      const composer = await page.locator(".native-composer").boundingBox();
      expect(composer!.y + composer!.height).toBeLessThanOrEqual(height);
    }
  }
});

test("native workspace labels synthetic benchmarks and keeps a custom Newegg goal separate", async ({
  page,
}) => {
  await page.goto("/agents/jev-browser-agent/native");
  await expect(
    page.getByRole("heading", { name: "One goal. Fewer round trips." }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Goal", exact: true }),
  ).toHaveAttribute("readonly");
  await page
    .getByRole("combobox", { name: "Task", exact: true })
    .selectOption("newegg");
  const goal = 'Search Newegg for "RTX 5070 Ti" and show results.';
  await page.getByRole("textbox", { name: "Goal", exact: true }).fill(goal);
  await page.getByLabel("Required confirmation text").fill("RTX 5070 Ti");
  let submitted: unknown;
  await page.route("**/api/native-browser", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({
      status: 400,
      json: { error: "Fixture: browser unavailable" },
    });
  });
  await page.getByRole("button", { name: "Run with Jev" }).click();
  await expect(
    page
      .getByRole("complementary", { name: "Native run inspector" })
      .getByRole("alert"),
  ).toHaveText("Fixture: browser unavailable");
  expect(submitted).toEqual({
    task: "newegg",
    goal,
    expected: { fields: {}, text: ["RTX 5070 Ti"] },
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("provider failure remains failed with unknown tokens and an exportable report", async ({
  page,
}) => {
  const report = {
    goal: "Synthetic PC task",
    status: "failed",
    reason: "TypeSafe HTTP 402",
    verification: { passed: false, summary: "Not checked" },
    snapshot: null,
    traces: [
      {
        cycle: 1,
        request: { model: "jev-latest", state: {}, questions: {} },
        response: null,
        usage: { inputTokens: null, outputTokens: null },
        providerUsage: {
          inputTokens: null,
          outputTokens: null,
          attempted: true,
          status: 402,
          retryAt: null,
        },
        settled: true,
        executed: 0,
        requestCharacters: 80,
        fullStateCharacters: 100,
        latencyMs: 15,
        results: [],
        error: "HTTP 402",
      },
    ],
  };
  await page.route("**/api/native-browser**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/run"))
      await route.fulfill({ json: { report } });
    else if (route.request().method() === "POST")
      await route.fulfill({
        json: {
          id: "fixture",
          expected: { fields: {}, text: ["PC draft saved"] },
        },
      });
    else await route.fulfill({ json: { report, phase: "Stopped" } });
  });
  await page.goto("/agents/jev-browser-agent/native");
  await page.getByRole("button", { name: "Run with Jev" }).click();
  await expect(
    page.getByText("TypeSafe HTTP 402", { exact: true }),
  ).toBeVisible();
  const tokens = page
    .locator(".native-metrics > div")
    .filter({ has: page.locator("dt", { hasText: /^Output tokens$/ }) });
  await expect(tokens.locator("dd")).toHaveText("—");
  await page.getByRole("button", { name: "Copy debug report" }).click();
  await expect(
    page.getByRole("textbox", { name: "Debug report text" }),
  ).toContainText('"status": "failed"');
  const saved = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("typesafe-session-usage-v1") || "{}"),
  );
  expect(saved.entries).toHaveLength(1);
  expect(saved.block.kind).toBe("billing");
  await page
    .getByRole("button", { name: "API key settings", exact: true })
    .click();
  const keyDialog = page.getByRole("dialog", { name: "Your TypeSafe API key" });
  await keyDialog
    .getByLabel("API key", { exact: true })
    .fill("synthetic-native-test-key");
  await keyDialog.getByRole("button", { name: "Save key" }).click();
  const refreshed = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("typesafe-session-usage-v1") || "{}"),
  );
  expect(refreshed.block).toBeNull();
  const retried = page.waitForRequest((request) =>
    request.url().endsWith("/api/native-browser/run"),
  );
  await page.getByRole("button", { name: "Run with Jev" }).click();
  expect((await retried).headers()["x-typesafe-api-key"]).toBe(
    "synthetic-native-test-key",
  );
});
