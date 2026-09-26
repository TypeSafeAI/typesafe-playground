import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("sharing preserves the existing home generator without evaluation calls", async ({ page, request }, testInfo) => {
  const evaluationAttempts: string[] = [];
  await page.route("**/api/**", async (route) => {
    const method = route.request().method();
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      evaluationAttempts.push(new URL(route.request().url()).pathname);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  const og = page.locator('meta[property="og:image"]').first();
  const twitter = page.locator('meta[name="twitter:image"]').first();
  for (const [name, meta] of [["og", og], ["twitter", twitter]] as const) {
    await expect(meta).toHaveAttribute("content", /\/opengraph-image/);
    const url = new URL((await meta.getAttribute("content"))!);
    expect(url.origin).toBe("https://jev.works");
    const response = await request.get(url.pathname + url.search);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    const bytes = await response.body();
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
    const path = testInfo.outputPath(`home-${name}.png`);
    await writeFile(path, bytes);
    await testInfo.attach(name, { path, contentType: "image/png" });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath("playground-overview.png"), animations: "disabled" });
  expect(evaluationAttempts).toEqual([]);
  const provenance = testInfo.outputPath("provenance.json");
  await writeFile(provenance, JSON.stringify({
    commit: process.env.GITHUB_SHA ?? "local-unrecorded", route: "/",
    project: testInfo.project.name, viewport: page.viewportSize(),
    mode: "browse-only; non-read API methods blocked", evaluationAttempts,
    environment: "local Playwright server, not production"
  }, null, 2));
  await testInfo.attach("capture provenance", { path: provenance, contentType: "application/json" });
});
