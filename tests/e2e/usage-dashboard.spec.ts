import { test, expect } from "@playwright/test";
test("all extraction calls appear once with reported tokens, visible cost and pricing provenance", async ({
  page,
}) => {
  await page.route("**/api/run", async (route) => {
    const payload = route.request().postDataJSON();
    const choice = Object.keys(payload.questions.extraction.criteria)[0];
    await route.fulfill({
      json: {
        answers: { extraction: { choice, probabilities: { [choice]: 0.99 } } },
        usage: { input_tokens: 100, output_tokens: 12 },
      },
    });
  });
  await page.goto("/extraction");
  await page
    .getByRole("button", { name: "Run extraction", exact: true })
    .click();
  const badge = page.getByRole("button", { name: "Open API usage dashboard" });
  await expect(badge).toContainText("4 calls");
  // Header total is input + output: 4 × (100 + 12). Cost stays input-only.
  await expect(badge).toContainText("448 tokens");
  await expect(badge).toContainText("$0.000017");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await badge.click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("link", { name: "Source: TypeSafe public pricing" }),
  ).toHaveAttribute("href", "https://typesafe.ai/");
  await expect(dialog).toContainText("input tokens × $42 ÷ 1,000,000,000");
  await expect(
    dialog.locator(".usage-metrics > div", { hasText: "Input tokens" }),
  ).toContainText("400");
  await expect(
    dialog.locator(".usage-metrics > div", { hasText: "Output tokens" }),
  ).toContainText("48");
  await expect(dialog.locator("tbody tr")).toHaveCount(4);
  await page.getByRole("button", { name: "Close usage dashboard" }).click();
  await page.reload();
  await expect(badge).toContainText("4 calls");
  await page.goto("/reranker");
  await expect(badge).toContainText("448 tokens");
});
test("429 pauses live runs across pages and survives reload; a replacement key releases the block", async ({
  page,
}) => {
  await page.route("**/api/run", (route) =>
    route.fulfill({
      status: 429,
      json: {
        error: "Rate limit reached",
        _playgroundUsage: {
          attempted: true,
          status: 429,
          retryAt: null,
          inputTokens: null,
          outputTokens: null,
        },
      },
    }),
  );
  await page.goto("/extraction");
  await page
    .getByRole("button", { name: "Run extraction", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open API usage dashboard" }),
  ).toContainText("Calls paused");
  await expect(
    page.getByRole("button", { name: "Run extraction", exact: true }),
  ).toBeDisabled();
  await page.goto("/reranker");
  await expect(
    page.getByRole("button", { name: "Rerank with Jev", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Rerank with baseline reranker",
      exact: true,
    }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Rerank with Jev", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Open API usage dashboard" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "The API did not provide a reset time",
  );
  await page.getByRole("button", { name: "Close usage dashboard" }).click();
  await page
    .getByRole("button", { name: "API key settings", exact: true })
    .click();
  await page
    .getByLabel("API key", { exact: true })
    .fill("test-usage-replacement-key");
  await page.getByRole("button", { name: "Save key", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Rerank with Jev", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("body")).not.toContainText(
    "test-usage-replacement-key",
  );
});
test("navigation collapse persists and mobile drawer closes on navigation and Escape", async ({
  page,
}, info) => {
  await page.goto("/extraction");
  if (info.project.name === "desktop") {
    await page
      .getByRole("button", { name: "Collapse sidebar", exact: true })
      .click();
    await expect(page.locator(".dashboard-shell")).toHaveClass(/nav-collapsed/);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Expand sidebar", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Expand sidebar", exact: true })
      .click();
  } else {
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Vector reranker", exact: true })
      .click();
    await expect(page).toHaveURL(/\/reranker$/);
    await expect(page.locator(".dashboard-shell")).not.toHaveClass(
      /nav-mobile-open/,
    );
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".dashboard-shell")).not.toHaveClass(
      /nav-mobile-open/,
    );
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open API usage dashboard" }).click();
  const box = await page.getByRole("dialog").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("mock invocations never transmit saved keys or count toward usage", async ({
  page,
}) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { configured: false } }),
  );
  let seen = false;
  await page.route("**/api/langchain-route", async (route) => {
    expect(route.request().headers()["x-typesafe-api-key"]).toBeUndefined();
    expect(route.request().postData()).not.toContain("mock-private-key");
    seen = true;
    await route.fulfill({
      status: 502,
      json: { error: "Synthetic mock response" },
    });
  });
  await page.goto("/langchain");
  await page
    .getByRole("button", { name: "API key settings", exact: true })
    .click();
  await page.getByLabel("API key", { exact: true }).fill("mock-private-key");
  await page.getByRole("button", { name: "Save key", exact: true }).click();
  await expect(page.locator(".connection")).toHaveText(
    "Personal key saved · unverified",
  );
  await expect(page.locator(".connection")).toHaveAttribute(
    "title",
    "Personal API key saved (not yet verified)",
  );
  await page
    .getByRole("button", { name: "Try mock invocation", exact: true })
    .click();
  await expect.poll(() => seen).toBe(true);
  await expect(
    page.getByRole("button", { name: "Open API usage dashboard" }),
  ).toContainText("0 calls");
});
