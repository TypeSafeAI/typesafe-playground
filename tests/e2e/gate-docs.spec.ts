import { test, expect } from "@playwright/test";
const docs = {
  sourceUrl: "https://docs.typesafe.ai/llms-full.txt",
  fetchedAt: "2026-09-16T12:00:00Z",
  mode: "full",
  pages: 12,
  snippets: [
    {
      id: "O1",
      title: "Rate limits",
      content: "Requests above the limit receive HTTP 429.",
      sourceUrl: "https://docs.typesafe.ai/api",
    },
  ],
};
test("official docs are checked before chat and expose a source-linked reply", async ({
  page,
}) => {
  const steps: string[] = [];
  await page.route("**/api/gate-docs", (route) => {
    steps.push("docs");
    return route.fulfill({ json: docs });
  });
  await page.route("**/api/run", (route) => {
    steps.push("jev");
    const body = route.request().postDataJSON();
    expect(body.state.history).toEqual([]);
    expect(body.state.documentation[0].sourceUrl).toBe(
      "https://docs.typesafe.ai/api",
    );
    return route.fulfill({
      json: {
        answers: {
          decision: {
            type: "choice",
            choice: "answerable_by_docs",
            confidence: 0.96,
          },
          evidence: { type: "choice", choice: "O1" },
        },
      },
    });
  });
  await page.goto("/gate");
  await page.getByRole("button", { name: "Run triage", exact: true }).click();
  await expect(page.locator(".gate-verdict")).toHaveAttribute(
    "data-outcome",
    "answerable_by_docs",
  );
  await expect(
    page.getByRole("link", { name: "Read the source documentation" }),
  ).toHaveAttribute("href", "https://docs.typesafe.ai/api");
  // The reply cites the same source, but as a named link rather than a bare
  // URL pasted into the prose, so the citation lives in the href now.
  await expect(
    page.locator(".suggested-reply").getByRole("link"),
  ).toHaveAttribute("href", "https://docs.typesafe.ai/api");
  expect(steps).toEqual(["docs", "jev"]);
});
test("an unsupported docs match falls through to community; retrieval failure makes no Jev call", async ({
  page,
}) => {
  let fail = false,
    calls = 0;
  await page.route("**/api/gate-docs", (route) =>
    route.fulfill(
      fail
        ? {
            status: 503,
            json: {
              error:
                "Official documentation could not be checked. Retry before routing this question.",
            },
          }
        : { json: docs },
    ),
  );
  await page.route("**/api/run", (route) => {
    calls++;
    const body = route.request().postDataJSON();
    const community = body.state.history.length > 0;
    return route.fulfill({
      json: {
        answers: {
          decision: {
            type: "choice",
            choice: community ? "already_answered" : "needs_human",
            confidence: 0.95,
          },
          evidence: {
            type: "choice",
            choice: community
              ? Object.keys(body.questions.evidence.criteria).find((id) =>
                  id.startsWith("M"),
                )
              : "none",
          },
        },
      },
    });
  });
  await page.goto("/gate");
  await page.getByRole("button", { name: "Run triage", exact: true }).click();
  await expect(page.locator(".gate-verdict")).toHaveAttribute(
    "data-outcome",
    "already_answered",
  );
  expect(calls).toBe(2);
  fail = true;
  await page.getByRole("button", { name: "Run triage", exact: true }).click();
  await expect(
    page.getByText(
      "Official documentation could not be checked. Retry before routing this question.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(calls).toBe(2);
});
