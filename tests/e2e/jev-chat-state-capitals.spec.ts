import { test, expect } from "@playwright/test";

for (const engine of ["compose", "baseline"]) {
  for (const mode of ["demo", "live"]) {
    test(`state capitals work and persist in ${engine} ${mode}`, async ({
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
      await page.goto("/jev-chat");
      await page.getByLabel("Response engine").selectOption(engine);
      await page.getByLabel("Chat mode").selectOption(mode);
      if (engine === "compose")
        await page.getByLabel("Chat personality").selectOption("playful");
      await page
        .getByLabel("Message Jev")
        .fill("Is Houston the capital of Texas?");
      await page.getByLabel("Message Jev").press("Enter");
      const reply = page.locator(".jc-assistant").last();
      await expect(reply.locator(".jc-message-text")).toHaveText(
        "No. The capital of Texas is Austin.",
      );
      await expect(reply.locator(".jc-message-author")).toContainText(
        `Built-in knowledge · ${mode} mode`,
      );
      await reply
        .getByText("How this response was composed", { exact: true })
        .click();
      await expect(
        reply.getByRole("link", { name: "State-capital reference" }),
      ).toHaveAttribute("href", "https://www.50states.com/tools/thelist.htm");
      await expect(reply).toContainText("0 · built-in knowledge");
      await page
        .getByRole("button", {
          name: "List all 50 state capitals",
          exact: true,
        })
        .click();
      await page.getByLabel("Message Jev").press("Enter");
      await expect(reply.locator(".jc-message-text")).toContainText(
        "Wyoming — Cheyenne",
      );
      const text = await reply.locator(".jc-message-text").innerText();
      expect(
        text.split("\n").filter((line) => line.includes(" — ")),
      ).toHaveLength(50);
      await page.reload();
      await expect(reply.locator(".jc-message-text")).toContainText(
        "New York — Albany",
      );
      await expect(page.getByLabel("Response engine")).toHaveValue(engine);
      expect(calls).toBe(0);
    });
  }
}
