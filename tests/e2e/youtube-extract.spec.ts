import { test, expect } from "@playwright/test";
const transcript = {
  videoId: "abcdefghijk",
  title: "Synthetic water lesson",
  language: "en",
  automatic: false,
  lines: [
    { text: "Um, Water stores heat.", start: 0, duration: 2 },
    { text: "Ice melts slowly.", start: 4, duration: 2 },
    { text: "Water stores heat.", start: 8, duration: 2 },
    { text: "Clouds reflect sunlight.", start: 12, duration: 2 },
  ],
};
test("source-only extract, live metrics, local length changes, raw evidence and saved draft", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/youtube-transcript", (r) =>
    r.fulfill({ json: transcript }),
  );
  await page.route("**/api/run", async (r) => {
    const i = calls++;
    const body = r.request().postDataJSON();
    expect(body.questions.relevance.type).toBe("score");
    expect(body.questions.key_claim.type).toBe("choice");
    await r.fulfill({
      json: {
        answers: {
          relevance: { type: "score", score: [0.7, 0.8, 0.9, 0.85][i] },
          key_claim: { type: "choice", choice: "yes", confidence: 0.9 },
        },
        _playgroundUsage: {
          inputTokens: 100,
          outputTokens: 10,
          attempted: true,
          status: 200,
        },
      },
    });
  });
  await page.goto("/youtube-extract");
  await page.getByLabel("YouTube URL").fill("https://youtu.be/abcdefghijk");
  await page.getByRole("button", { name: "Create extract · Live Jev" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Step 3 of 3" }),
  ).toBeVisible();
  await expect(page.getByTestId("extract-text")).toHaveText(
    "Water stores heat.",
  );
  await expect(page.getByTestId("extract-calls")).toHaveText("4");
  const slider = page.getByLabel("Extract length");
  await slider.focus();
  await slider.press("End");
  await expect(page.getByTestId("extract-text")).toHaveText(
    "Ice melts slowly. Water stores heat. Clouds reflect sunlight.",
  );
  expect(calls).toBe(4);
  await page.getByLabel("Show raw scored chunks").check();
  await expect(
    page.getByRole("heading", { name: "0:00 · duplicate" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "0:08 · View source" }),
  ).toHaveAttribute("href", "https://www.youtube.com/watch?v=abcdefghijk&t=8s");
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (t) => document.documentElement.setAttribute("data-theme", t),
      theme,
    );
    for (const size of [
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(size);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  await page.screenshot({
    path: test.info().outputPath("extract-narrow.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByLabel("YouTube URL")).toHaveValue(
    "https://youtu.be/abcdefghijk",
  );
  await expect(slider).toHaveValue("100");
});
test("caption failure makes no Jev calls; malformed scoring stays incomplete", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/youtube-transcript", (r) =>
    r.fulfill({ status: 502, json: { error: "Captions unavailable." } }),
  );
  await page.route("**/api/run", (r) => {
    calls++;
    return r.fulfill({ json: { answers: {} } });
  });
  await page.goto("/youtube-extract");
  await page.getByLabel("YouTube URL").fill("https://youtu.be/abcdefghijk");
  await page.getByRole("button", { name: "Create extract · Live Jev" }).click();
  await expect(page.locator(".youtube-extract-lab [role=alert]")).toContainText(
    "Captions unavailable",
  );
  expect(calls).toBe(0);
  await page.route("**/api/youtube-transcript", (r) =>
    r.fulfill({ json: transcript }),
  );
  await page.getByRole("button", { name: "Create extract · Live Jev" }).click();
  await expect(page.locator(".youtube-extract-lab [role=alert]")).toContainText(
    "incomplete scoring",
  );
  await expect(page.getByTestId("extract-text")).toHaveText(
    "No eligible chunks selected.",
  );
  expect(calls).toBe(1);
});
test("stop prevents queued scoring and preserves unknown cost", async ({
  page,
}) => {
  let calls = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/api/youtube-transcript", (r) =>
    r.fulfill({ json: transcript }),
  );
  await page.route("**/api/run", async (r) => {
    calls++;
    await gate;
    await r
      .fulfill({
        json: {
          answers: {
            relevance: { type: "score", score: 1 },
            key_claim: { type: "choice", choice: "yes", confidence: 1 },
          },
        },
      })
      .catch(() => {});
  });
  await page.goto("/youtube-extract");
  await page.getByLabel("YouTube URL").fill("https://youtu.be/abcdefghijk");
  await page.getByRole("button", { name: "Create extract · Live Jev" }).click();
  await expect(page.getByTestId("extract-calls")).toHaveText("1");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  release();
  await expect(
    page.getByText("Cancelled · partial results only"),
  ).toBeVisible();
  expect(calls).toBe(1);
  await expect(page.getByTestId("extract-text")).toHaveText(
    "No eligible chunks selected.",
  );
  await expect(
    page.getByText("1 calls with unknown usage", { exact: false }),
  ).toBeVisible();
});

test("a key change cancels old scoring before its response can select text", async ({
  page,
}) => {
  let calls = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/api/youtube-transcript", (r) =>
    r.fulfill({ json: transcript }),
  );
  await page.route("**/api/run", async (r) => {
    calls++;
    await gate;
    await r
      .fulfill({
        json: {
          answers: {
            relevance: { type: "score", score: 1 },
            key_claim: { type: "choice", choice: "yes", confidence: 1 },
          },
        },
      })
      .catch(() => {});
  });
  await page.goto("/youtube-extract");
  await page.getByLabel("YouTube URL").fill("https://youtu.be/abcdefghijk");
  await page.getByRole("button", { name: "Create extract · Live Jev" }).click();
  await expect(page.getByTestId("extract-calls")).toHaveText("1");
  await page.evaluate(() => {
    localStorage.setItem("typesafe-api-key-revision", "changed-test");
    window.dispatchEvent(new Event("typesafe-api-key-change"));
  });
  release();
  await expect(
    page.getByText("Cancelled · partial results only"),
  ).toBeVisible();
  expect(calls).toBe(1);
  await expect(page.getByTestId("extract-text")).toHaveText(
    "No eligible chunks selected.",
  );
});
