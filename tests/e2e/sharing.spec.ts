import { expect, test } from "@playwright/test";

test("sharing images resolve in this build without model calls", async ({ page, request }, testInfo) => {
  await page.goto("/");
  const og = page.locator('meta[property="og:image"]').first();
  const twitter = page.locator('meta[name="twitter:image"]').first();
  await expect(og).toHaveAttribute("content", /^https:\/\/jev\.works\//);
  await expect(twitter).toHaveAttribute("content", /\/og\.png/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  const url = new URL((await og.getAttribute("content"))!);
  const response = await request.get(url.pathname + url.search);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/");
  expect((await response.body()).length).toBeGreaterThan(1024);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath("playground-overview.png"), animations: "disabled" });
  await testInfo.attach("provenance.json", {
    body: Buffer.from(JSON.stringify({ commit: process.env.GITHUB_SHA ?? "local-unrecorded", route: "/", project: testInfo.project.name, viewport: page.viewportSize(), mode: "browse-only, no model evaluation", environment: "local Playwright server, not production" }, null, 2)),
    contentType: "application/json",
  });
});
