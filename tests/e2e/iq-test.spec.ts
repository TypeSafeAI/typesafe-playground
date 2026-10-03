import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { IQ_QUESTIONS } from "../../lib/iq-test";

async function open(page: Page) {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { configured: true } }),
  );
  await page.goto("/simulations/iq-test");
}
// A full run includes a two-second reading pause for each question.
const completeRunTimeout = IQ_QUESTIONS.length * 2000 + 20000;
const start = (page: Page) =>
  page.getByRole("button", { name: "Run test", exact: true }).click();
function answer(choice: string) {
  return {
    answers: {
      answer: {
        type: "choice",
        choice,
        confidence: 0.8,
        probabilities: Object.fromEntries(
          ["a", "b", "c", "d"].map((key) => [key, key === choice ? 0.7 : 0.1]),
        ),
      },
    },
    usage: { input_tokens: 100, output_tokens: 10 },
  };
}

test("local demo scores the answer sheet without any provider calls", async ({
  page,
}, info) => {
  test.setTimeout(completeRunTimeout + 15000);
  let calls = 0;
  await page.route("**/api/run", (route) => {
    calls++;
    return route.abort();
  });
  await open(page);
  await expect(
    page.getByRole("heading", { name: "Jev takes an IQ-style test" }),
  ).toBeVisible();
  await expect(page.getByLabel("Run mode")).toHaveValue("demo");
  await start(page);
  await expect(page.getByTestId("iq-run-status")).toHaveText(
    "Complete · Local demo",
    { timeout: completeRunTimeout },
  );
  await expect(page.getByTestId("iq-score")).toContainText("6 / 24");
  await expect(page.getByTestId("iq-estimate")).toContainText("78");
  await expect(page.getByTestId("iq-estimate")).toContainText(
    "Uncalibrated heuristic",
  );
  expect(calls).toBe(0);
  await expect(
    page.getByText("Not a standardized IQ score.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Question 1: Growing gaps/ }).click();
  await expect(page.getByText("Selected: A · 36")).toBeVisible();
  await page
    .getByText("Checked answer and explanation", { exact: true })
    .click();
  await expect(
    page.getByText(IQ_QUESTIONS[0].explanation, { exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloaded = await download;
  expect(downloaded.suggestedFilename()).toBe("jev-iq-test.json");
  const report = JSON.parse(await readFile((await downloaded.path())!, "utf8"));
  expect(report.version).toBe("reasoning-v2");
  expect(report.execution).toBe("local-demo");
  expect(report.status).toBe("complete");
  expect(report.summary.correct).toBe(6);
  expect(report.summary.iqEstimate).toMatchObject({
    value: 78,
    method: "assumed-reference-v2",
    calibration: "uncalibrated",
    assumedRawMean: 12,
    assumedRawStandardDeviation: 4,
  });
  expect(
    report.summary.categories.map((category: any) => category.percentage),
  ).toEqual([25, 25, 25]);
  expect(report.results).toHaveLength(24);
  expect(report.requestedModel).toBeNull();
  expect(JSON.stringify(report)).not.toMatch(/api.key|authorization|headers/i);
  await page.locator(".iq-lab").evaluate((element) => element.scrollTo(0, 0));
  await page.screenshot({ path: `/tmp/typesafe-iq-${info.project.name}.png` });
});

test("live mocked run grades checked answers and excludes the key from requests", async ({
  page,
}, info) => {
  test.setTimeout(completeRunTimeout + 15000);
  const payloads: any[] = [];
  await page.route("**/api/run", (route) => {
    const payload = route.request().postDataJSON();
    const question = IQ_QUESTIONS[payloads.length];
    payloads.push(payload);
    return route.fulfill({ json: answer(question.expected) });
  });
  await open(page);
  await page.getByLabel("Run mode").selectOption("live");
  await start(page);
  await expect(page.getByTestId("iq-run-status")).toHaveText(
    "Complete · Live Jev",
    { timeout: completeRunTimeout },
  );
  const final = page.getByRole("region", {
    name: "Final IQ-style test result",
  });
  await expect(final).toBeInViewport();
  await expect(final).toBeFocused();
  await expect(final).toContainText("24 / 24");
  await expect(final.getByTestId("iq-estimate")).toContainText("145");
  await expect(final.getByTestId("iq-estimate")).toContainText(
    "Uncalibrated heuristic",
  );
  if (info.project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 568 });
  await final.evaluate((element) => element.scrollIntoView({ block: "start" }));
  await expect(final.getByTestId("iq-estimate")).toBeInViewport();
  await page.screenshot({
    path: `/tmp/typesafe-iq-estimate-${info.project.name}.png`,
  });
  await final
    .getByText("How this estimate is calculated", { exact: true })
    .click();
  await expect(final).toContainText("12 correct answers");
  await expect(final).toContainText("standard deviation of 4 answers");
  await expect(final.locator("code")).toHaveText(
    "round(100 + 15 × (correct − 12) / 4)",
  );
  expect(
    await page
      .locator(".iq-lab")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  for (const category of ["Numerical", "Logical", "Patterns"]) {
    const breakdown = final.getByRole("group", {
      name: `${category} breakdown`,
    });
    await expect(breakdown).toContainText("8 correct");
    await expect(breakdown).toContainText("0 incorrect");
    await expect(breakdown).toContainText("100%");
  }
  await page.screenshot({
    path: `/tmp/typesafe-iq-final-${info.project.name}.png`,
  });
  await expect(page.getByTestId("iq-score")).toContainText("24 / 24");
  expect(payloads).toHaveLength(24);
  payloads.forEach((payload, index) => {
    expect(payload.state).toEqual({
      prompt: IQ_QUESTIONS[index].prompt,
      assumption: IQ_QUESTIONS[index].assumption,
    });
    expect(JSON.stringify(payload)).not.toContain(
      IQ_QUESTIONS[index].explanation,
    );
  });
  await expect(
    page.getByRole("button", { name: "Open API usage dashboard" }),
  ).toContainText("24 calls");
  await page.reload();
  await expect(page.getByLabel("Run mode")).toHaveValue("live");
  await expect(page.getByTestId("iq-run-status")).toHaveText(
    "Ready · Live Jev",
  );
});

test("stopping during the final reading pause keeps the completed report visible", async ({
  page,
}) => {
  test.setTimeout(completeRunTimeout + 15000);
  await page.route("**/api/run", (route) =>
    route.fulfill({ json: answer(IQ_QUESTIONS[0].expected) }),
  );
  await open(page);
  await page.getByLabel("Run mode").selectOption("live");
  await start(page);
  await expect(page.getByTestId("iq-watch-status")).toContainText(
    "Results next",
    { timeout: completeRunTimeout },
  );
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByTestId("iq-run-status")).toHaveText(
    "Complete · Live Jev",
  );
  await expect(
    page.getByRole("region", { name: "Final IQ-style test result" }),
  ).toBeVisible();
});

test("follows each question and answer, with an option to inspect earlier answers", async ({
  page,
}, info) => {
  if (info.project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 568 });
  let calls = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let releaseThird!: () => void;
  const thirdPending = new Promise<void>((resolve) => {
    releaseThird = resolve;
  });
  await page.route("**/api/run", async (route) => {
    calls++;
    if (calls === 2) await pending;
    if (calls === 3) await thirdPending;
    await route.fulfill({ json: answer("b") }).catch(() => {});
  });
  await open(page);
  await page.getByLabel("Run mode").selectOption("live");
  await start(page);
  await expect(page.getByTestId("iq-watch-status")).toContainText(
    "Correct · B · 38",
  );
  await expect(
    page.getByRole("heading", { name: "One repeated rule", exact: true }),
  ).toBeInViewport();
  await expect(page.getByTestId("iq-watch-status")).toContainText(
    "Question 2 of 24",
  );
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: `/tmp/typesafe-iq-follow-${info.project.name}.png`,
  });
  await page.getByRole("button", { name: /Question 1: Growing gaps/ }).click();
  await expect(page.getByLabel("Follow current question")).not.toBeChecked();
  await expect(
    page.getByRole("heading", { name: "Growing gaps", exact: true }),
  ).toBeVisible();
  release();
  await expect.poll(() => calls).toBe(3);
  await expect(
    page.getByRole("heading", { name: "Growing gaps", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Follow current question").check();
  await expect(
    page.getByRole("heading", { name: "Two tracks", exact: true }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  releaseThird();
});

for (const malformed of [false, true])
  test(`${malformed ? "invalid answer" : "provider failure"} stops with an incomplete score`, async ({
    page,
  }) => {
    let calls = 0;
    await page.route("**/api/run", (route) => {
      calls++;
      return route.fulfill(
        malformed
          ? { json: { answers: { answer: { type: "choice", choice: "a" } } } }
          : { status: 503, json: { error: "Provider unavailable" } },
      );
    });
    await open(page);
    await page.getByLabel("Run mode").selectOption("live");
    await start(page);
    await expect(page.getByTestId("iq-run-status")).toHaveText(
      "Incomplete · Live Jev",
    );
    await expect(page.getByTestId("iq-score")).toContainText("No final score");
    await expect(page.getByTestId("iq-estimate")).toHaveCount(0);
    await expect(page.locator(".iq-lab [role=alert]")).toBeVisible();
    await expect(page.locator(".iq-answer-sheet")).toContainText(
      malformed ? "Invalid" : "Failed",
    );
    expect(calls).toBe(1);
  });

test("stop and reset discard a late response", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route("**/api/run", async (route) => {
    calls++;
    await pending;
    await route.fulfill({ json: answer("b") }).catch(() => {});
  });
  await open(page);
  await page.getByLabel("Run mode").selectOption("live");
  await start(page);
  await expect.poll(() => calls).toBe(1);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByTestId("iq-run-status")).toHaveText(
    "Stopped · Live Jev",
  );
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  release();
  await expect(page.getByTestId("iq-run-status")).toHaveText(
    "Ready · Live Jev",
  );
  await expect(page.getByTestId("iq-score")).toContainText("No final score");
  await expect(
    page.locator(".iq-answer-sheet .iq-status").filter({ hasText: "Not run" }),
  ).toHaveCount(24);
  expect(calls).toBe(1);
});

test("changing keys stops a live run before another question", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/run", async (route) => {
    calls++;
    // Trigger the same event as the shared key control, without a real key.
    await page.evaluate(() =>
      window.dispatchEvent(new Event("typesafe-api-key-change")),
    );
    await route.fulfill({ json: answer("b") }).catch(() => {});
  });
  await open(page);
  await page.getByLabel("Run mode").selectOption("live");
  await start(page);
  await expect(page.getByTestId("iq-run-status")).toHaveText(
    "Stopped · Live Jev",
  );
  await expect(
    page.getByText("API key changed. Start a new run with the selected key."),
  ).toBeVisible();
  expect(calls).toBe(1);
});

test("hiding the tab stops after the current question without sending another", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/run", async (route) => {
    calls++;
    await route.fulfill({ json: answer("b") });
  });
  await open(page);
  await page.getByLabel("Run mode").selectOption("live");
  await start(page);
  await expect(page.getByTestId("iq-score")).toContainText("1 of 24 answered");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByTestId("iq-run-status")).toHaveText(
    "Stopped · Live Jev",
  );
  await expect(
    page.getByText(
      "Stopped because this tab was hidden. Start a new run when ready.",
    ),
  ).toBeVisible();
  expect(calls).toBe(1);
});

test("keyboard inspection and both themes fit short and narrow screens", async ({
  page,
}) => {
  await open(page);
  const workspace = page.getByRole("region", {
    name: "IQ-style test workspace",
  });
  await expect(workspace).toHaveAttribute("tabindex", "0");
  await workspace.focus();
  await expect(workspace).toBeFocused();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    for (const size of [
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(size);
      const question = page.getByRole("button", {
        name: /Question 9: Different bits/,
      });
      await question.focus();
      await question.press("Enter");
      await expect(
        page.getByRole("heading", { name: "Different bits", exact: true }),
      ).toBeVisible();
      await expect(question).toHaveAttribute("aria-pressed", "true");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const reveal = page.getByText("Checked answer and explanation", {
        exact: true,
      });
      await reveal.focus();
      await reveal.press("Enter");
      await expect(
        page.getByText(IQ_QUESTIONS[8].explanation, { exact: true }),
      ).toBeVisible();
      await reveal.press("Enter");
      await page
        .getByRole("button", { name: /Question 24: An ordered operator/ })
        .click();
      await expect(
        page.getByRole("heading", { name: "An ordered operator", exact: true }),
      ).toBeVisible();
      if (theme === "dark" && size.width === 1280)
        await page.screenshot({ path: "/tmp/typesafe-iq-dark-question.png" });
      if (theme === "dark" && size.width === 320)
        await page.screenshot({ path: "/tmp/typesafe-iq-dark-narrow.png" });
    }
  }
});
