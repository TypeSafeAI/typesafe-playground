import { test, expect } from "@playwright/test";

test("prose keeps source text literal, accessible, and identical to the verified reply", async ({
  page,
}) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { configured: false } }),
  );
  await page.route("**/api/run", (route) =>
    route.fulfill({
      status: 500,
      json: { error: "No live calls in this test." },
    }),
  );
  await page.goto("/language/jev-chat");
  await page.getByRole("button", { name: "Your notes", exact: true }).click();
  const notes = [
    "The sample label reads <img src=x onerror=alert(1)>; this is literal source text.",
    "The archive opens at 10:00 UTC.\nKeep the original line break.",
  ];
  await page.getByLabel("Source material").fill(notes.join("\n\n"));
  await page.getByRole("button", { name: "Close guide panel" }).click();
  await page.getByLabel("Message Jev").fill("Summarize my notes.");
  await page.getByLabel("Message Jev").press("Enter");
  const prose = page.locator(".jc-assistant .jc-message-text");
  await expect(prose.locator("blockquote")).toHaveCount(2);
  for (const [index, note] of notes.entries()) {
    const quote = prose.getByRole("blockquote", {
      name: `Your notes · paragraph ${index + 1}`,
    });
    expect(await quote.textContent()).toBe(note);
  }
  await expect(prose.locator("img, script, a")).toHaveCount(0);
  const savedText = await page.evaluate(() => {
    const chats = JSON.parse(localStorage.getItem("jev-chat-sessions-v1")!);
    return chats[0].messages.at(-1).engineResult.text;
  });
  expect(await prose.textContent()).toBe(savedText);
  await page
    .getByText("How this response was composed", { exact: true })
    .click();
  await page.getByRole("button", { name: "Verify content" }).click();
  await expect(
    page.getByText("Content integrity verified", { exact: true }),
  ).toBeVisible();
  await page
    .getByText("How this response was composed", { exact: true })
    .click();
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
      await prose.scrollIntoViewIfNeeded();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(page.getByLabel("Message Jev")).toBeInViewport({ ratio: 1 });
      await page.screenshot({
        path: test.info().outputPath(`prose-${theme}-${size.width}.png`),
        fullPage: true,
      });
    }
  }
});
