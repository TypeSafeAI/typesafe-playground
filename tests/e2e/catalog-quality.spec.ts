import { test, expect } from "@playwright/test";
import catalog from "../../web/catalog.json";

// Exercise every authored input through the real editor and result renderer.
// Synthetic transport responses prove UI behavior, never model correctness.
for (const pack of catalog.packs) {
  test(`catalog pack ${pack.id}: all examples and comparisons`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    let fail = false;
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/run", async (route) => {
      if (fail)
        return route.fulfill({
          status: 503,
          json: { error: "Offline audit: provider unavailable" },
        });
      const payload = route.request().postDataJSON();
      const answers = Object.fromEntries(
        Object.entries(payload.questions).map(([id, value]) => {
          const q = value as {
            type: string;
            criteria?: Record<string, string> | string[];
          };
          const choice =
            q.type === "choice" ? Object.keys(q.criteria!)[0] : undefined;
          return [
            id,
            {
              type: q.type,
              ...(q.type === "choice"
                ? { choice, probabilities: { [choice!]: 0.91 } }
                : q.type === "noul"
                  ? { noul: 0.75 }
                  : { score: 0.5 }),
              confidence: 0.91,
            },
          ];
        }),
      );
      await route.fulfill({ json: { answers } });
    });
    await page.goto("/language/examples");
    for (const example of pack.examples) {
      const browse = page.getByRole("button", {
        name: "Browse examples",
        exact: true,
      });
      if (await browse.isVisible()) await browse.click();
      await page
        .getByLabel("Search examples", { exact: true })
        .fill(example.title);
      await page
        .locator(".example-item")
        .filter({ has: page.locator("strong", { hasText: example.title }) })
        .click();
      await expect(page.locator(".experiment-panel h1")).toHaveText(
        example.title,
      );
      await expect(page.locator("#example-state")).not.toHaveValue("");
      const comparison = page.getByRole("button", {
        name: "Compare A/B",
        exact: true,
      });
      const paired = (await comparison.count()) > 0;
      await (
        paired
          ? comparison
          : page.getByRole("button", { name: "Run example", exact: true })
      ).click();
      await expect(page.locator(".example-result")).toHaveCount(paired ? 2 : 1);
      await expect(page.locator(".answer-card").first()).toBeVisible();
      await expect(page.locator('.example-results [role="alert"]')).toHaveCount(
        0,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        example.id,
      ).toBe(true);
    }
    await page.screenshot({ path: info.outputPath(`${pack.id}-results.png`) });
    fail = true;
    await page
      .getByRole("button", { name: "Run example", exact: true })
      .click();
    await expect(page.locator('.example-results [role="alert"]')).toContainText(
      "Offline audit",
    );
    await expect(page.locator(".answer-card")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
