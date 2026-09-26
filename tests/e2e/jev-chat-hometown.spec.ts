import { test, expect } from "@playwright/test";

for (const engine of ["compose", "baseline"]) {
  for (const mode of ["demo", "live"]) {
    test(`Houston preference is explicit and saved in ${engine} ${mode}`, async ({
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
          json: { error: "Unexpected provider call." },
        });
      });
      await page.goto("/language/jev-chat");
      await page.getByLabel("Response engine").selectOption(engine);
      await page.getByLabel("Chat mode").selectOption(mode);
      if (engine === "compose")
        await page.getByLabel("Chat personality").selectOption("professional");
      await page
        .getByLabel("Message Jev")
        .fill("Is Dallas better than Houston?");
      await page.getByLabel("Message Jev").press("Enter");
      const reply = page.locator(".jc-assistant").last();
      await expect(reply.locator(".jc-message-text")).toContainText(
        "Houston > Dallas. Always.",
      );
      await expect(reply.locator(".jc-message-author")).toContainText(
        `Hometown preference · ${mode} mode`,
      );
      await reply
        .getByText("How this response was composed", { exact: true })
        .click();
      await expect(reply).toContainText("0 · scripted personality");
      await expect(reply).toContainText(
        "No Jev request, model assessment, or factual city ranking was used.",
      );
      await page.reload();
      await expect(reply.locator(".jc-message-text")).toContainText(
        "Houston > Dallas. Always.",
      );
      await expect(page.getByLabel("Response engine")).toHaveValue(engine);
      expect(calls).toBe(0);
    });
  }
}
