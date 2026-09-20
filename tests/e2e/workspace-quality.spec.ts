import { test, expect } from "@playwright/test";

test("workspace guide is keyboard accessible and returns focus when closed", async ({
  page,
}) => {
  await page.goto("/extraction");
  const help = page.getByRole("button", {
    name: "Workspace guide",
    exact: true,
  });
  await help.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Document extraction guide",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("source");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(help).toBeFocused();
});

test("router continues from the decision and distinguishes completion from a next step", async ({
  page,
}) => {
  await page.route("**/api/run", async (route) => {
    const body = route.request().postDataJSON();
    const choices = Object.keys(body.questions.next_node.criteria);
    const choice = choices.includes("ops_agent")
      ? "ops_agent"
      : "read_config_tool";
    await route.fulfill({
      json: {
        answers: {
          next_node: {
            type: "choice",
            choice,
            confidence: 0.95,
            probabilities: { [choice]: 0.96 },
          },
        },
      },
    });
  });
  await page.goto("/tool-router");
  await expect(
    page.getByRole("heading", {
      name: "See the decision, then follow the path",
    }),
  ).toBeVisible();
  await expect(page.locator(".router-step-log")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Run Routing Step", exact: true })
    .click();
  const results = page.locator("#router-results");
  await expect(
    results.getByRole("button", { name: "Continue routing", exact: true }),
  ).toBeVisible();
  await results
    .getByRole("button", { name: "Continue routing", exact: true })
    .click();
  await results
    .getByRole("button", { name: "Continue routing", exact: true })
    .click();
  await expect(results.getByRole("status")).toContainText("Path complete");
  await expect(
    results.getByRole("button", { name: "Continue routing", exact: true }),
  ).toHaveCount(0);
  await expect(results).toContainText("SIMULATED OUTPUT");
});

const routes = [
  "/",
  "/examples",
  "/conversation",
  "/extraction",
  "/gate",
  "/workflow",
  "/tool-router",
  "/langchain",
  "/pr-review",
  "/ast-governance",
  "/smt-solver",
  "/reranker",
  "/memes",
  "/chess",
  "/microduck",
  "/doom",
  "/clean-room",
  "/youtube-extract",
  "/jev-browser-agent",
];
for (const path of routes) {
  test(`quality audit ${path}: both themes, guide, and narrow viewport`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/run", (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Offline audit: provider unavailable" },
      }),
    );
    await page.addInitScript(() => {
      const key = "typesafe-playground-theme";
      if (!localStorage.getItem(key)) localStorage.setItem(key, "light");
    });
    for (const theme of ["light", "dark"]) {
      if (theme === "dark") {
        await page.evaluate(() =>
          localStorage.setItem("typesafe-playground-theme", "dark"),
        );
      }
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      {
        await page
          .getByRole("button", {
            name:
              path === "/jev-browser-agent"
                ? "Open browser guide"
                : "Workspace guide",
            exact: true,
          })
          .click();
        const guide = page.getByRole("dialog", { name: /guide$/ });
        await expect(guide).toBeVisible();
        await expect(guide.locator(".workspace-guide-steps > li")).toHaveCount(
          3,
        );
        for (const name of [
          "What you provide",
          "What happens",
          "What you get",
          "Try this",
          "Execution limits",
        ]) {
          await expect(
            guide.getByRole("heading", { name, exact: true }),
          ).toBeVisible();
        }
        expect(
          await guide.evaluate((el) => el.scrollWidth - el.clientWidth),
        ).toBe(0);
        await expect(
          guide.getByRole("button", { name: "Close workspace guide" }),
        ).toBeInViewport();
        await expect(
          guide.getByRole("button", { name: "Back to workspace" }),
        ).toBeInViewport();
        await page.screenshot({
          path: info.outputPath(
            `${path.slice(1) || "home"}-${theme}-guide.png`,
          ),
        });
        await page
          .getByRole("button", { name: "Back to workspace", exact: true })
          .click();
        await expect(guide).not.toBeVisible();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        path,
      ).toBe(true);
      for (const selector of [".workspace", ".page-heading"]) {
        for (const container of await page.locator(selector).all()) {
          expect(
            await container.evaluate((el) => ({
              overflow: el.scrollWidth - el.clientWidth,
              offset: el.scrollLeft,
            })),
            `${path} ${selector} ${theme}`,
          ).toEqual({ overflow: 0, offset: 0 });
        }
      }
      await page.screenshot({
        path: info.outputPath(`${path.slice(1) || "home"}-${theme}.png`),
      });
    }
    await page.setViewportSize({ width: 320, height: 568 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${path} short screen`,
    ).toBe(true);
    await expect(page.locator("h1")).toBeVisible();
    for (const container of await page
      .locator(".workspace, .page-heading")
      .all()) {
      expect(
        await container.evaluate((el) => el.scrollWidth - el.clientWidth),
        `${path} narrow workspace`,
      ).toBe(0);
    }
    expect(errors).toEqual([]);
  });
}

test("router can stop a request from the continuation control", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/run", async (route) => {
    calls++;
    if (calls === 1)
      await route.fulfill({
        json: {
          answers: {
            next_node: {
              type: "choice",
              choice: "ops_agent",
              confidence: 0.95,
              probabilities: { ops_agent: 0.96 },
            },
          },
        },
      });
    // Leave the continuation pending until the user cancels it.
  });
  await page.goto("/tool-router");
  await page
    .getByRole("button", { name: "Run Routing Step", exact: true })
    .click();
  const results = page.locator("#router-results");
  await results
    .getByRole("button", { name: "Continue routing", exact: true })
    .click();
  await results.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Stopped",
  );
  await expect(
    results.getByRole("button", { name: "Continue routing", exact: true }),
  ).toBeEnabled();
  await expect(results.locator(".router-step-log li")).toHaveCount(1);
});

test("router keeps the useful simulated tool output visible after completion", async ({
  page,
}) => {
  await page.goto("/tool-router");
  await page
    .getByRole("button", { name: "Run mock scenario", exact: true })
    .click();
  await expect(page.locator(".router-output")).toContainText(
    "rate_limit_per_minute = 60",
  );
  await expect(page.locator(".router-output")).toContainText(
    "seeded demo values",
  );
});

test("short landscape screens leave enough room to edit and scroll the source", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/extraction");
  const source = page.locator(".source-panel .panel-content");
  expect((await source.boundingBox())!.height).toBeGreaterThan(180);
  await page
    .getByRole("button", { name: "Run extraction", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Run extraction", exact: true }),
  ).toBeInViewport();
});

test("PR review starts with a clear task instead of empty result metrics", async ({
  page,
}) => {
  await page.goto("/pr-review");
  await expect(
    page.getByRole("heading", { name: "Inspect a diff to begin" }),
  ).toBeVisible();
  await expect(page.locator(".review-metrics")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Run mock demo", exact: true })
    .click();
  await expect(page.locator(".review-metrics")).toBeVisible();
  await expect(page.locator(".pr-verdict")).toContainText("human review");
});

test("workflow onboarding stays at the start of its scroll area", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/workflow");
  // Allow the existing smooth scroll to settle before checking the initial view.
  await page.waitForTimeout(400);
  expect(await page.locator(".chat-log").evaluate((el) => el.scrollTop)).toBe(
    0,
  );
  await expect(
    page.getByRole("heading", { name: "What happened?", exact: true }),
  ).toBeInViewport();
});

test("workspace breakdown explains inputs, decisions, results and limits", async ({
  page,
}) => {
  await page.goto("/extraction");
  await page
    .getByRole("button", { name: "Workspace guide", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Document extraction guide",
  });
  for (const name of [
    "What you provide",
    "What happens",
    "What you get",
    "Try this",
    "Execution limits",
  ]) {
    await expect(
      dialog.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  }
  await expect(dialog).toContainText("source candidates");
  await expect(dialog.locator(".workspace-guide-steps > li")).toHaveCount(3);
});

test("guide stays usable on narrow and short screens without running the model", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/run", (route) => {
    requests++;
    return route.abort();
  });
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/extraction");
    const source = page.locator(".source-panel textarea");
    const initial = await source.inputValue();
    const trigger = page.getByRole("button", {
      name: "Workspace guide",
      exact: true,
    });
    await trigger.click();
    const dialog = page.getByRole("dialog", {
      name: "Document extraction guide",
    });
    const close = dialog.getByRole("button", { name: "Close workspace guide" });
    const back = dialog.getByRole("button", { name: "Back to workspace" });
    await expect(close).toBeFocused();
    await expect(close).toBeInViewport();
    await expect(back).toBeInViewport();
    expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(
      0,
    );
    await page.keyboard.press("Tab");
    await expect(dialog.locator(".workspace-guide-body")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(back).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.locator(".workspace-guide-body")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(close).toBeFocused();
    await dialog
      .getByRole("heading", { name: "Execution limits" })
      .scrollIntoViewIfNeeded();
    await expect(close).toBeInViewport();
    await expect(back).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(source).toHaveValue(initial);
  }
  expect(requests).toBe(0);
});
