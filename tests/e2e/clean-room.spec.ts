import { test, expect, devices } from "@playwright/test";
import { gunzipSync } from "node:zlib";
for (const [name, device] of [
  ["desktop", devices["Desktop Chrome"]],
  ["mobile", devices["iPhone 13"]],
] as const) {
  test.describe(name, () => {
    // Browser selection is worker-scoped and comes from the project; retain
    // each device's context options here, including touch and mobile layout.
    const { defaultBrowserType, ...contextOptions } = device;
    test.use(contextOptions);
    for (const title of [
      "Searchable catalog",
      "Contacts CRUD",
      "Support ticket",
    ])
      test(`clean room demo: ${title}`, async ({ page }) => {
        test.setTimeout(120000);
        let jobId: string | undefined;
        try {
          await page.goto("/agents/clean-room");
          await page.getByRole("button", { name: title, exact: true }).click();
          await expect(page.getByLabel("Rebuild context")).not.toBeEmpty();
          const started = page.waitForResponse(
            (response) =>
              response.url().endsWith("/api/clean-room") &&
              response.request().method() === "POST",
          );
          await page
            .getByRole("button", { name: "Run local demo", exact: true })
            .click();
          const response = await started;
          const body = await response.json();
          jobId = body.id;
          expect(response.status(), JSON.stringify(body)).toBe(202);
          await expect(page.getByRole("status")).toContainText(
            "Verification passed",
            { timeout: 90000 },
          );
          const archive = await page.request.get(
            (await page
              .getByRole("link", {
                name: "Download app + evidence",
                exact: true,
              })
              .getAttribute("href")) as string,
          );
          expect(archive.ok()).toBeTruthy();
          const exported = gunzipSync(await archive.body()).toString();
          expect(exported).toContain("app/server.mjs");
          expect(exported).toContain("endpoints.json");
          expect(exported).toContain("verification.json");
          const clone = page.getByRole("link", {
            name: "Open rebuilt app",
            exact: true,
          });
          await expect(clone).toBeVisible();
          const popupPromise = page.waitForEvent("popup");
          await clone.click();
          const popup = await popupPromise;
          await expect(popup.locator("h1")).toBeVisible();
          if (title === "Searchable catalog") {
            await popup
              .getByRole("textbox", { name: "Search products" })
              .fill("Orbit");
            await popup
              .getByRole("button", { name: "Search", exact: true })
              .click();
            await expect(popup.getByRole("listitem")).toHaveCount(1);
            await expect(popup.getByText("Orbit pencil")).toBeVisible();
          } else if (title === "Support ticket") {
            await popup
              .getByRole("textbox", { name: "Email", exact: true })
              .fill("demo@example.test");
            await popup
              .getByRole("textbox", { name: "Message", exact: true })
              .fill("A new request");
            await popup.getByRole("button", { name: "Send ticket" }).click();
            await expect(popup.getByText("S-101")).toBeVisible();
          } else {
            await popup
              .getByRole("textbox", { name: "New contact name" })
              .fill("Val");
            await popup.getByRole("button", { name: "Add contact" }).click();
            await expect(popup.getByText("Val", { exact: true })).toBeVisible();
          }
          await popup.close();
          await page
            .getByRole("button", { name: "Close demo servers", exact: true })
            .click();
        } finally {
          if (jobId) {
            await expect
              .poll(
                async () => {
                  const response = await page.request.get(
                    `/api/clean-room?id=${jobId}`,
                  );
                  return (await response.json()).status;
                },
                { timeout: 90000 },
              )
              .not.toBe("running");
            const closed = await page.request.delete(
              `/api/clean-room?id=${jobId}`,
            );
            expect(closed.ok()).toBeTruthy();
            expect((await closed.json()).status).toBe("closed");
          }
        }
      });
  });
}
