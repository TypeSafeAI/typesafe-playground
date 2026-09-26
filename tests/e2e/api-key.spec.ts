import { test, expect } from "@playwright/test";
test("personal key is masked, persists, overrides all transports, and can be removed", async ({
  page,
}) => {
  const key = "personal-test-key";
  const headers: (string | undefined)[] = [];
  await page.route("**/api/run", async (route) => {
    headers.push(route.request().headers()["x-typesafe-api-key"]);
    expect(route.request().postData()).not.toContain(key);
    await route.fulfill({
      status: 502,
      json: { error: "Test provider unavailable" },
    });
  });
  await page.route("**/api/langchain-route", async (route) => {
    headers.push(route.request().headers()["x-typesafe-api-key"]);
    await route.fulfill({
      status: 502,
      json: { error: "Test provider unavailable" },
    });
  });
  await page.goto("/simulations/doom");
  await page
    .getByRole("button", { name: "API key settings", exact: true })
    .click();
  await page.getByLabel("API key", { exact: true }).fill(key);
  await expect(page.getByLabel("API key", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await page.getByRole("button", { name: "Save key", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "API key settings", exact: true })
    .click();
  await expect(page.getByLabel("Replace API key")).toHaveValue("");
  await expect(page.locator("body")).not.toContainText(key);
  await page.getByRole("button", { name: "Close API key settings" }).click();
  await page.getByRole("radio", { name: "Jev control", exact: true }).click();
  await page.getByRole("button", { name: "Start arena", exact: true }).click();
  await expect.poll(() => headers.length, { timeout: 15000 }).toBe(1);
  await page.goto("/language/extraction");
  await page
    .getByRole("button", { name: "Run extraction", exact: true })
    .click();
  await expect.poll(() => headers.length).toBeGreaterThan(1);
  await page.goto("/agents/langchain");
  await page
    .getByRole("button", { name: "Invoke LangChain tool", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Test provider unavailable",
  );
  expect(headers.every((h) => h === key)).toBe(true);
  await page
    .getByRole("button", { name: "API key settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove override", exact: true })
    .click();
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Close API key settings" }).click();
  await page.goto("/simulations/doom");
  await page.getByRole("radio", { name: "Jev control", exact: true }).click();
  const count = headers.length;
  await page.getByRole("button", { name: "Start arena", exact: true }).click();
  await expect.poll(() => headers.length, { timeout: 15000 }).toBe(count + 1);
  expect(headers.at(-1)).toBeUndefined();
});
