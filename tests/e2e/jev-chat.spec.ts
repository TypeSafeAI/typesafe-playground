import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/health", (r) =>
    r.fulfill({ json: { configured: false } }),
  );
  await page.route("**/api/run", (r) =>
    r.fulfill({ status: 500, json: { error: "Unconfigured test mock." } }),
  );
});

test("local conversation, guide, history, drafts, source notes, and responsive themes", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/run", (r) => {
    calls++;
    return r.fulfill({ json: {} });
  });
  await page.goto("/language/jev-chat");
  await page.getByLabel("Response engine").selectOption("baseline");
  await expect(
    page.getByRole("heading", { name: "Jev Chat", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /A conversation with context/ }),
  ).toBeInViewport();
  await page.screenshot({
    path: test.info().outputPath("chat-welcome.png"),
    fullPage: true,
  });
  await page.getByLabel("Message Jev").fill("How does Jev work?");
  await page.getByLabel("Message Jev").press("Enter");
  await expect(page.locator(".jc-assistant")).toContainText(
    "No generative language model",
  );
  await page.getByText("Decision details", { exact: true }).click();
  await expect(page.locator(".jc-decision")).toContainText("Not measured");
  await page.getByLabel("Message Jev").fill("A saved draft");
  await page.reload();
  await expect(page.getByLabel("Message Jev")).toHaveValue("A saved draft");
  await expect(page.locator(".jc-assistant")).toHaveCount(1);
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export conversation" }).click();
  expect((await exported).suggestedFilename()).toBe("jev-chat.json");
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Understand the choice." }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  if (test.info().project.name === "mobile")
    await page.getByRole("button", { name: "Conversation history" }).click();
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await page.getByRole("button", { name: "Your notes", exact: true }).click();
  await page
    .getByLabel("Source material")
    .fill(
      "Returns are accepted within 14 days.\n\nSupport opens at 10:00 UTC.",
    );
  await page.getByRole("button", { name: "Close guide panel" }).click();
  await page.getByLabel("Message Jev").fill("What about returns?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".jc-assistant .jc-message-text")).toHaveText(
    "Returns are accepted within 14 days.",
  );
  await page.getByText("Decision details", { exact: true }).click();
  await expect(page.locator(".jc-decision")).toContainText(
    "Your notes · paragraph 1",
  );
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
      await expect(page.getByLabel("Message Jev")).toBeInViewport();
      await page.screenshot({
        path: test.info().outputPath(`chat-${theme}-${size.width}.png`),
        fullPage: true,
      });
    }
  }
  expect(calls).toBe(0);
});

test("live closed choices, uncertain fallback, failure retry and no silent demo", async ({
  page,
}) => {
  let requestCount = 0;
  await page.route("**/api/run", (r) => {
    const body = r.request().postDataJSON();
    expect(body.questions.reply.type).toBe("choice");
    expect(body.state.conversation.at(-1).role).toBe("user");
    requestCount++;
    if (requestCount === 1)
      return r.fulfill({
        json: {
          answers: {
            reply: { type: "choice", choice: "about", confidence: 0.95 },
          },
        },
      });
    if (requestCount === 2)
      return r.fulfill({
        json: {
          answers: {
            reply: { type: "choice", choice: "memory", confidence: 0.4 },
          },
        },
      });
    if (requestCount === 3)
      return r.fulfill({
        status: 503,
        json: { error: "Provider unavailable. Retry later." },
      });
    expect(
      body.state.conversation.filter(
        (m: { text: string }) => m.text === "What happens to my data?",
      ),
    ).toHaveLength(1);
    return r.fulfill({
      json: {
        answers: {
          reply: { type: "choice", choice: "privacy", confidence: 0.96 },
        },
      },
    });
  });
  await page.goto("/language/jev-chat");
  await page.getByLabel("Response engine").selectOption("baseline");
  await page.getByLabel("Chat mode").selectOption("live");
  await page.getByLabel("Message Jev").fill("How does Jev work?");
  await page.getByLabel("Message Jev").press("Enter");
  await expect(page.locator(".jc-assistant")).toContainText("Live Jev");
  await page
    .getByLabel("Message Jev")
    .fill("Can you remember our conversation?");
  await page.getByLabel("Message Jev").press("Enter");
  await expect(page.locator(".jc-assistant").last()).toContainText(
    "Needs context",
  );
  await page.getByLabel("Message Jev").fill("What happens to my data?");
  await page.getByLabel("Message Jev").press("Enter");
  await expect(page.locator(".jc-alert")).toContainText("Provider unavailable");
  await expect(page.locator(".jc-assistant")).toHaveCount(2);
  await page.getByRole("button", { name: "Retry selection" }).click();
  await expect(page.locator(".jc-assistant")).toHaveCount(3);
  await expect(page.locator(".jc-assistant").last()).toContainText(
    "Local demo mode stays in this browser",
  );
  await expect(page.locator(".jc-alert")).toHaveCount(0);
  expect(requestCount).toBe(4);
});

test("stop and key changes discard delayed answers; failed messages remain editable", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  await page.route("**/api/run", async (r) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await r
      .fulfill({
        json: {
          answers: {
            reply: { type: "choice", choice: "about", confidence: 0.99 },
          },
        },
      })
      .catch(() => {});
  });
  await page.goto("/language/jev-chat");
  await page.getByLabel("Response engine").selectOption("baseline");
  await page.getByLabel("Chat mode").selectOption("live");
  await page.getByLabel("Message Jev").fill("How does Jev work?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByRole("button", { name: "Stop selection" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop selection" }).click();
  await expect(
    page.getByRole("button", { name: "Edit message" }),
  ).toBeVisible();
  release?.();
  await expect(page.locator(".jc-assistant")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit message" }).click();
  await expect(page.getByLabel("Message Jev")).toHaveValue(
    "How does Jev work?",
  );
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByRole("button", { name: "Stop selection" }),
  ).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem("typesafe-api-key-revision", "new-revision");
    window.dispatchEvent(new Event("typesafe-api-key-change"));
  });
  await expect(
    page.getByRole("button", { name: "Retry selection" }),
  ).toBeVisible();
  release?.();
  await expect(page.locator(".jc-assistant")).toHaveCount(0);
});
