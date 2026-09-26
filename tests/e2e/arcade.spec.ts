import { test, expect, type Page } from "@playwright/test";

/** A well-formed Jev answer that picks the first offered action. */
function answerFirst(payload: any) {
  const offered = Object.keys(payload.questions.action.criteria);
  const probabilities = Object.fromEntries(
    offered.map((a, i) => [a, i === 0 ? 0.7 : 0.3 / (offered.length - 1)]),
  );
  return {
    answers: {
      action: {
        type: "choice",
        choice: offered[0],
        confidence: 0.8,
        probabilities,
      },
    },
    usage: { input_tokens: 700, output_tokens: 40 },
  };
}

async function mockHealth(page: Page, configured: boolean) {
  await page.route("**/api/health", (r) => r.fulfill({ json: { configured } }));
}

test("the scripted demo plays locally with no model calls", async ({
  page,
}) => {
  await mockHealth(page, false);
  let calls = 0;
  await page.route("**/api/run", (r) => {
    calls++;
    return r.fulfill({ status: 500, json: { error: "unexpected" } });
  });
  await page.goto("/arcade/meteor-dodge");
  await expect(page.getByLabel("Player")).toHaveValue("scripted");
  await page.getByLabel("Speed").selectOption("fast");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("arcade-score")).not.toHaveText("0");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator(".arcade-log .source-scripted").first()).toHaveText(
    "Scripted rule",
  );
  expect(calls).toBe(0);
  await expect(
    page.getByRole("button", { name: "Open API usage dashboard" }),
  ).toContainText("0 calls");
});

test("live Jev asks one closed-set question per move over legal actions only", async ({
  page,
}) => {
  await mockHealth(page, true);
  const payloads: any[] = [];
  await page.route("**/api/run", async (route) => {
    const payload = route.request().postDataJSON();
    payloads.push(payload);
    await route.fulfill({ json: answerFirst(payload) });
  });
  await page.goto("/arcade/breakout");
  await page.getByLabel("Player").selectOption("jev");
  await page.getByRole("button", { name: "One move", exact: true }).click();
  await expect(page.locator(".arcade-log li")).toHaveCount(1);
  await page.getByRole("button", { name: "One move", exact: true }).click();
  await expect(page.locator(".arcade-log li")).toHaveCount(2);
  expect(payloads).toHaveLength(2);
  for (const payload of payloads) {
    expect(Object.keys(payload.questions)).toEqual(["action"]);
    expect(payload.questions.action.type).toBe("choice");
    expect(Object.keys(payload.questions.action.criteria).sort()).toEqual(
      Object.keys(payload.state.outcomes).sort(),
    );
  }
  await expect(page.locator(".arcade-decision .source-jev")).toHaveText(
    "Jev choice",
  );
  await expect(page.locator(".arcade-stats")).toContainText("Jev choices2");
  await expect(
    page.getByRole("button", { name: "Open API usage dashboard" }),
  ).toContainText("2 calls");
});

test("a malformed answer plays the fallback and is never counted as Jev's", async ({
  page,
}) => {
  await mockHealth(page, true);
  await page.route("**/api/run", (route) =>
    route.fulfill({
      json: { answers: { action: { type: "choice", choice: "teleport" } } },
    }),
  );
  await page.goto("/arcade/breakout");
  await page.getByLabel("Player").selectOption("jev");
  await page.getByRole("button", { name: "One move", exact: true }).click();
  await expect(page.locator(".arcade-decision .source-fallback")).toHaveText(
    "Fallback: invalid answer",
  );
  await expect(page.locator(".arcade-decision")).toContainText(
    "The safe fallback move was played.",
  );
  await expect(page.locator(".arcade-stats")).toContainText("Jev choices0");
  await expect(page.locator(".arcade-stats")).toContainText("Fallbacks1");
});

test("a provider error stops the run and shows the error", async ({ page }) => {
  await mockHealth(page, false);
  await page.route("**/api/run", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Set TYPESAFE_API_KEY on the server to run Jev." },
    }),
  );
  await page.goto("/arcade/snake");
  await page.getByLabel("Player").selectOption("jev");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator(".arcade-lab .error-note")).toContainText(
    "TYPESAFE_API_KEY",
  );
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".arcade-log li")).toHaveCount(0);
});

test("the same seed replays the same game, and the baseline is shown", async ({
  page,
}) => {
  await mockHealth(page, false);
  await page.goto("/arcade/snake");
  const board = page.locator(".arcade-board");
  const start = await board.getAttribute("aria-label");
  await page.getByLabel("Seed").fill("42");
  const seeded = await board.getAttribute("aria-label");
  expect(seeded).not.toBe(start);
  await page.getByLabel("Seed").fill("1");
  await expect(board).toHaveAttribute("aria-label", start!);
  await expect(page.locator(".arcade-compare")).toContainText(
    "Random baseline, this seed",
  );
});

test("keyboard play steers from the focused board", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "needs a physical keyboard");
  await mockHealth(page, false);
  await page.goto("/arcade/snake");
  await page.getByLabel("Player").selectOption("human");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator(".arcade-stage")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator(".arcade-log .source-human").first()).toBeVisible();
  await expect
    .poll(async () => page.locator(".arcade-log-action").allTextContents())
    .toContain("Up");
  // Heading up soon reaches the wall and ends the game, so pause only if the
  // run is still going.
  const pause = page.getByRole("button", { name: "Pause", exact: true });
  if (await pause.isVisible()) await pause.click().catch(() => {});
});
