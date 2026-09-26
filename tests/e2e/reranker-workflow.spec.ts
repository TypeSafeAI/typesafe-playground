import { test, expect } from "@playwright/test";
import { WORKFLOW_EXAMPLES } from "../../lib/workflow-examples";
for (const example of WORKFLOW_EXAMPLES.slice(1)) {
  test(
    "workflow example: " + example.name + " asks for evidence then routes",
    async ({ page }) => {
      let calls = 0;
      await page.route("**/api/run", async (route) => {
        const p = route.request().postDataJSON();
        calls++;
        expect(p.state.rules.map((r: { id: string }) => r.id)).toEqual(
          example.rules.map((r) => r.id),
        );
        expect(p.questions.route.criteria.need_information).toBeTruthy();
        if (calls === 2)
          expect(p.state.conversation.at(-1).content).toBe(example.followup);
        await route.fulfill({
          json: {
            answers: {
              route: {
                type: "choice",
                choice: calls === 1 ? "need_information" : example.expectedRule,
              },
              supported: { type: "noul", noul: calls === 1 ? 0.1 : 0.96 },
              missing: { type: "choice", choice: "other" },
            },
          },
        });
      });
      await page.goto("/agents/workflow");
      await page.getByLabel("Example playbook").selectOption(example.id);
      await page
        .getByRole("button", { name: example.starters[0].label })
        .click();
      await expect(page.getByRole("log")).toContainText(example.question!);
      await expect(page.getByLabel("Example playbook")).toBeDisabled();
      await page.getByLabel("Describe the case").fill(example.followup);
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .click();
      await expect(page.locator(".recommendation")).toContainText(
        example.rules.find((r) => r.id === example.expectedRule)!.action,
      );
      expect(calls).toBe(2);
      await page.getByRole("button", { name: "New case", exact: true }).click();
      await expect(page.getByLabel("Example playbook")).toBeEnabled();
      await expect(page.locator(".recommendation")).toHaveCount(0);
    },
  );
}
test("reranker compares supplied candidates, inspects evidence and invalidates stale runs", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/run", async (route) => {
    const p = route.request().postDataJSON();
    calls++;
    expect(p.state.query).toBe("where is authentication handled?");
    expect(p.state.candidates.length).toBeLessThanOrEqual(10);
    await route.fulfill({
      json: {
        answers: Object.fromEntries(
          Object.keys(p.questions).map((k, i) => [
            k,
            {
              type: "choice",
              choice: i % 2 ? "direct" : "irrelevant",
              confidence: 0.95,
              probabilities: { [i % 2 ? "direct" : "irrelevant"]: 0.95 },
            },
          ]),
        ),
      },
    });
  });
  await page.goto("/language/reranker");
  await page.getByLabel("Top-K candidates", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Compare both", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Jev reranked" }).locator("li"),
  ).toHaveCount(20);
  await expect(
    page.getByRole("region", { name: "Baseline · lexical mock" }).locator("li"),
  ).toHaveCount(20);
  await expect(
    page.getByRole("region", { name: "Comparison metrics" }),
  ).toContainText("2");
  expect(calls).toBe(2);
  await page
    .getByRole("region", { name: "Jev reranked" })
    .locator(".rank-id")
    .first()
    .click();
  await expect(
    page.getByRole("region", { name: "Candidate inspection" }),
  ).toContainText("Vector rank");
  await page.getByLabel("Search query").fill("billing");
  await expect(
    page.getByRole("region", { name: "Jev reranked" }).locator("li"),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("reranker failed classifications remain unscored", async ({ page }) => {
  await page.route("**/api/run", (r) =>
    r.fulfill({ status: 429, json: { error: "Rate limit reached" } }),
  );
  await page.goto("/language/reranker");
  await page.getByLabel("Top-K candidates", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Compare both", exact: true }).click();
  await expect(
    page.getByText("Some candidates are unscored.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Jev reranked" }).locator("li"),
  ).toHaveCount(20);
  await expect(
    page.getByRole("region", { name: "Jev reranked" }),
  ).toContainText("Unscored");
});
