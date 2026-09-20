import { test, expect } from "@playwright/test";

test("personality changes future replies, survives reload, and carries into a new chat", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { configured: false } }),
  );
  await page.route("**/api/run", (route) => {
    calls++;
    return route.fulfill({
      status: 500,
      json: { error: "Unexpected live request." },
    });
  });
  await page.goto("/jev-chat");
  const personality = page.getByRole("combobox", { name: "Chat personality" });
  await expect(personality).toHaveValue("default");
  await page.getByLabel("Response detail").focus();
  await page.keyboard.press("Tab");
  await expect(personality).toBeFocused();
  await personality.selectOption("friendly");
  await page.getByLabel("Message Jev").fill("hello");
  await page.getByLabel("Message Jev").press("Enter");
  const replies = page.locator(".jc-assistant .jc-message-text");
  await expect(replies.first()).toContainText("Hi! Good to have you here.");
  await personality.selectOption("playful");
  await page.getByLabel("Message Jev").fill("hello");
  await page.getByLabel("Message Jev").press("Enter");
  await expect(replies.last()).toContainText("Hey there!");
  await page.getByLabel("Message Jev").fill("Keep my draft");
  await page.reload();
  await expect(personality).toHaveValue("playful");
  await expect(replies).toHaveCount(2);
  await expect(replies.first()).toContainText("Hi! Good to have you here.");
  await expect(page.getByLabel("Message Jev")).toHaveValue("Keep my draft");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("jev-chat-sessions-v1")!),
  );
  expect(saved[0].personality).toBe("playful");
  expect(saved[0].messages[1].engineResult.trace.personality).toBe("friendly");
  expect(saved[0].messages[3].engineResult.trace.personality).toBe("playful");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const size of [
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(size);
      await expect(personality).toBeInViewport({ ratio: 1 });
      await expect(page.getByLabel("Message Jev")).toBeInViewport({ ratio: 1 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (await page.locator(".jc-scroll").boundingBox())!.height,
      ).toBeGreaterThanOrEqual(160);
      await page.screenshot({
        path: test.info().outputPath(`personality-${theme}-${size.width}.png`),
        fullPage: true,
      });
    }
  }
  await page
    .getByRole("button", { name: "Conversation history", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(personality).toHaveValue("playful");
  await page.getByLabel("Response engine").selectOption("baseline");
  await expect(personality).toHaveCount(0);
  expect(calls).toBe(0);
});
