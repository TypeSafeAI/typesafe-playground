import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/gate-docs", (route) =>
    route.fulfill({
      json: {
        sourceUrl: "https://docs.typesafe.ai/llms-full.txt",
        fetchedAt: "2026-09-16T12:00:00Z",
        mode: "full",
        pages: 1,
        snippets: [],
      },
    }),
  );
  await page.route("**/api/health", (r) =>
    r.fulfill({ json: { ok: true, configured: true } }),
  );
});
test("all workspaces fit the viewport and navigate without runtime errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of [
    "/",
    "/examples",
    "/conversation",
    "/gate",
    "/chess",
    "/workflow",
    "/extraction",
    "/memes",
    "/microduck",
    "/pr-review",
    "/ast-governance",
    "/smt-solver",
    "/tool-router",
    "/langchain",
    "/jev-browser-agent",
    "/reranker",
    "/doom",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(errors).toEqual([]);
});
test("extraction sends closed sets and renders exact evidence", async ({
  page,
}) => {
  const fields: string[] = [];
  await page.route("**/api/run", async (route) => {
    const p = route.request().postDataJSON();
    fields.push(p.state.field);
    expect(p.questions.extraction.criteria.null).toBeTruthy();
    const choices = p.questions.extraction.criteria;
    const id = Object.keys(choices).find((k) => k !== "null")!;
    await route.fulfill({
      json: {
        answers: {
          extraction: {
            type: "choice",
            choice: id,
            probabilities: { [id]: 0.91 },
            confidence: 0.8,
          },
        },
      },
    });
  });
  await page.goto("/extraction");
  await page
    .getByRole("button", { name: "Run extraction", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  expect(fields.sort()).toEqual([
    "amount",
    "counterparty",
    "date",
    "document_type",
  ]);
  await expect(page.locator("blockquote")).toHaveCount(4);
  await expect(page.locator("tbody")).toContainText("Northstar Studio LLC");
  await expect(page.locator("tbody")).toContainText("91.0%");
  await page
    .getByLabel("Paste document text")
    .fill("No structured values are present here.");
  await page
    .getByRole("button", { name: "Run extraction", exact: true })
    .click();
  await expect(page.locator(".null-value")).toHaveCount(4);
  expect(fields).toHaveLength(4);
});
test("meme test displays classifications and preserves a clear failure state", async ({
  page,
}) => {
  await page.route("**/api/run", async (route) => {
    const p = route.request().postDataJSON();
    expect(Object.keys(p.questions)).toHaveLength(4);
    await route.fulfill({
      json: {
        answers: {
          lands: { type: "noul", noul: 0.84 },
          style: {
            type: "choice",
            choice: "relatable",
            probabilities: { relatable: 0.9 },
          },
          tone: {
            type: "choice",
            choice: "playful",
            probabilities: { playful: 0.8 },
          },
          confusion: {
            type: "choice",
            choice: "none",
            probabilities: { none: 0.7 },
          },
        },
      },
    });
  });
  await page.goto("/memes");
  await page
    .getByRole("button", {
      name: "Test meme",
      exact: true,
    })
    .click();
  await expect(page.locator(".meme-verdict")).toContainText("84.0%");
  await expect(page.locator(".classification").first()).toHaveText("relatable");
  await page.unroute("**/api/run");
  await page.route("**/api/run", (r) =>
    r.fulfill({
      status: 429,
      json: { error: "Rate limit reached. Try again." },
    }),
  );
  await page
    .getByRole("button", {
      name: "Test meme",
      exact: true,
    })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Rate limit reached",
  );
  await expect(page.locator(".meme-verdict")).toHaveCount(0);
});
test("workflow renders supported policy action without executing it", async ({
  page,
}) => {
  await page.route("**/api/run", (r) =>
    r.fulfill({
      json: {
        answers: {
          route: { type: "choice", choice: "delivery" },
          supported: { type: "noul", noul: 0.96 },
          missing: { type: "choice", choice: "other" },
        },
      },
    }),
  );
  await page.goto("/workflow");
  await page
    .getByRole("button", { name: /Delivery damage is confirmed/ })
    .click();
  await expect(page.locator(".recommendation")).toContainText(
    "Fine the delivery service and resend the item.",
  );
  await expect(
    page.getByText(
      "Recommendations only. No refunds, fines, or bans are executed.",
    ),
  ).toBeVisible();
});
test("conversation chooses winner and recomputes threshold without API calls", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/run", (r) => {
    calls++;
    const p = r.request().postDataJSON();
    return r.fulfill({
      json: {
        answers: {
          should_respond: {
            type: "noul",
            noul: p.state.messages.at(-1).speaker === "Tyler" ? 0.96 : 0.3,
          },
          frame: { type: "choice", choice: "request" },
        },
      },
    });
  });
  await page.goto("/conversation");
  await page.getByRole("button", { name: "Pick a recipient" }).click();
  await expect(page.locator(".winner-card")).toContainText("Tyler");
  await expect(page.locator(".winner-card .message-preview")).toHaveText(
    "Can you prototype the codebase search flow? I need exact context, line-by-line search, and AST support.",
  );
  await expect(page.locator(".ranked-message")).toHaveCount(2);
  await expect(
    page.locator(".ranked-message .message-preview").first(),
  ).toHaveText("Do they have a desktop app?");
  await page.getByRole("slider").fill("99");
  await expect(page.locator(".winner-card")).toContainText("No reply needed");
  expect(calls).toBe(3);
});
test("example edits persist across refresh", async ({ page }) => {
  await page.goto("/examples");
  await expect(page.locator(".connection")).toContainText("Jev connected");
  await page.locator("#example-state").fill("My saved example");
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("typesafe-playground-workspace-v2"),
      ),
    )
    .toContain("My saved example");
  await page.reload();
  await expect(page.locator("#example-state")).toHaveValue("My saved example");
});

for (const [width, height] of [
  [320, 568],
  [650, 700],
  [651, 700],
  [844, 390],
  [900, 700],
  [1024, 768],
  [1200, 800],
  [1440, 900],
  [2560, 1440],
]) {
  test(
    "responsive boundaries at " + width + "x" + height,
    async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "Viewport matrix runs once.");
      await page.setViewportSize({ width, height });
      for (const route of [
        "/",
        "/examples",
        "/conversation",
        "/gate",
        "/chess",
        "/workflow",
        "/extraction",
        "/memes",
        "/microduck",
        "/pr-review",
        "/ast-governance",
        "/smt-solver",
        "/tool-router",
        "/langchain",
        "/jev-browser-agent",
        "/reranker",
        "/doom",
      ]) {
        await page.goto(route);
        await expect(page.locator("h1")).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${route} at ${width}x${height}`,
        ).toBe(true);
        if (route === "/examples" && width > 650 && height < 600) {
          expect(
            (await page.locator(".example-list").boundingBox())!.height,
          ).toBeGreaterThan(60);
        }
        if (route === "/") continue;
        const action = page.getByRole("button", {
          name:
            route === "/examples"
              ? "Run example"
              : route === "/conversation"
                ? "Pick a recipient"
                : route === "/gate"
                  ? "Run triage"
                  : route === "/chess"
                    ? "One move"
                    : route === "/workflow"
                      ? "Send message"
                      : route === "/extraction"
                        ? "Run extraction"
                        : route === "/microduck"
                          ? "Step"
                          : route === "/pr-review"
                            ? "Review PR"
                            : route === "/ast-governance"
                              ? "Analyze changes"
                              : route === "/smt-solver"
                                ? "Run Check"
                                : route === "/tool-router"
                                  ? "Run Routing Step"
                                  : route === "/langchain"
                                    ? "Invoke LangChain tool"
                                    : route === "/jev-browser-agent"
                                      ? "Find PC parts"
                                      : route === "/reranker"
                                        ? "Compare both"
                                        : route === "/doom"
                                          ? "Start arena"
                                          : "Test meme",
          exact: true,
        });
        await action.scrollIntoViewIfNeeded();
        const bounds = await action.boundingBox();
        expect(bounds, `${route} action bounds`).not.toBeNull();
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
      }
    },
  );
}

test("meta meme, image URL OCR review, and GitHub link are usable", async ({
  page,
}) => {
  await page.goto("/memes");
  await expect(
    page.getByRole("link", { name: "View TypeSafe AI Playground on GitHub" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/TypeSafeAI/typesafe-playground",
  );
  await expect(page.getByRole("img", { name: /Meta meme:/ })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download meta meme" }),
  ).toHaveAttribute("href", "/memes/meta-meme.png");
  const image = await (await page.request.get("/memes/meta-meme.png")).body();
  await page.route("**/api/meme-image", (route) =>
    route.fulfill({ contentType: "image/png", body: image }),
  );
  await page.route(
    "https://cdn.jsdelivr.net/npm/tesseract.js@*/dist/worker.min.js",
    (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `let passes=0; self.onmessage=({data:m})=>self.postMessage({workerId:m.workerId,jobId:m.jobId,action:m.action,status:'resolve',data:m.action==='recognize'?(++passes===2?{text:'x'.repeat(8001),blocks:[]}:{text:'OCR meme caption\\nOCR punchline',blocks:[{paragraphs:[{lines:[{text:'OCR meme caption',confidence:95,bbox:{x0:20,y0:20,x1:400,y1:60}},{text:'OCR punchline',confidence:95,bbox:{x0:20,y0:800,x1:400,y1:840}}]}]}]}):{}});`,
      }),
  );
  let calls = 0;
  await page.route("**/api/run", (route) => {
    calls++;
    const p = route.request().postDataJSON();
    expect(p.state.imageText).toBe("Reviewed meme caption");
    expect(p.state.setup).toBe("OCR meme caption");
    expect(p.state.punchline).toBe("OCR punchline");
    return route.fulfill({
      json: { answers: { lands: { type: "noul", noul: 0.7 } } },
    });
  });
  await page
    .getByLabel("Image address URL")
    .fill("https://example.com/meme.png");
  await page.getByRole("button", { name: "Read image", exact: true }).click();
  await expect(page.getByLabel("Recognized image text")).toHaveValue(
    "OCR meme caption\n\nOCR punchline",
  );
  await expect(page.getByLabel("Setup / top text")).toHaveValue(
    "OCR meme caption",
  );
  await expect(page.getByLabel("Punchline / bottom text")).toHaveValue(
    "OCR punchline",
  );
  expect(calls).toBe(0);
  await page.getByLabel("Recognized image text").fill("Reviewed meme caption");
  await page
    .getByRole("button", {
      name: "Test meme",
      exact: true,
    })
    .click();
  await expect(page.locator(".meme-verdict")).toContainText("70.0%");
  expect(calls).toBe(1);
});

test("question JSON stays synchronized and protects concurrent edits", async ({
  page,
}) => {
  await page.goto("/examples");
  await page.locator(".question-edit").first().locator("summary").click();
  await page
    .locator(".question-edit")
    .first()
    .getByLabel("Instructions")
    .fill("Updated instruction");
  await page.getByText("Edit all questions as JSON", { exact: true }).click();
  await expect(page.getByLabel("Questions JSON")).toContainText(
    "Updated instruction",
  );
  await page
    .getByLabel("Questions JSON")
    .fill(
      '[{"id":"test","label":"Test","type":"noul","instructions":"Test question"}]',
    );
  await page
    .getByRole("button", { name: "Apply questions", exact: true })
    .click();
  await expect(page.locator(".run-readiness")).toContainText(
    "1 question · Run: 1 request",
  );
  await page.locator(".question-edit").first().locator("summary").click();
  await expect(
    page.getByRole("checkbox", { name: "Include question: Test", exact: true }),
  ).toBeChecked();
});

test("unreadable meme text does not report a successful extraction", async ({
  page,
}) => {
  await page.goto("/memes");
  const image = await (await page.request.get("/memes/meta-meme.png")).body();
  await page.route("**/api/meme-image", (route) =>
    route.fulfill({ contentType: "image/png", body: image }),
  );
  await page.route(
    "https://cdn.jsdelivr.net/npm/tesseract.js@*/dist/worker.min.js",
    (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `self.onmessage=({data:m})=>self.postMessage({workerId:m.workerId,jobId:m.jobId,action:m.action,status:'resolve',data:m.action==='recognize'?{text:'--',blocks:[{paragraphs:[{lines:[{text:'--',confidence:95,bbox:{x0:0,y0:0,x1:20,y1:20}}]}]}]}:{}});`,
      }),
  );
  await page
    .getByLabel("Image address URL")
    .fill("https://example.com/unreadable.png");
  await page.getByRole("button", { name: "Read image", exact: true }).click();
  await expect(page.locator(".ocr-status")).toContainText(
    "No caption detected",
  );
  await expect(page.getByLabel("Recognized image text")).toHaveValue("");
  await expect(page.getByLabel("Setup / top text")).toHaveValue("");
  await expect(page.getByLabel("Punchline / bottom text")).toHaveValue("");
});

test("examples expose question selection, validation, and reversible reset", async ({
  page,
}) => {
  await page.goto("/examples");
  const original = await page.locator("#example-state").inputValue();
  await page.locator("#example-state").fill("A changed draft");
  await expect(page.getByText("Edited draft", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset draft", exact: true }).click();
  await expect(page.locator("#example-state")).toHaveValue(original);
  await page.getByRole("button", { name: "Undo reset" }).click();
  await expect(page.locator("#example-state")).toHaveValue("A changed draft");
  for (const box of await page
    .getByRole("checkbox", { name: /^Include question:/ })
    .all())
    await box.uncheck();
  await expect(
    page.getByRole("button", { name: "Run example", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".run-readiness")).toContainText(
    "Select at least one question",
  );
  await page
    .getByRole("checkbox", { name: /^Include question:/ })
    .first()
    .check();
  await expect(
    page.getByRole("button", { name: "Run example", exact: true }),
  ).toBeEnabled();
});

test("example filters recover from empty results and preview the A/B change", async ({
  page,
}) => {
  await page.goto("/examples");
  const browse = page.getByRole("button", {
    name: "Browse examples",
    exact: true,
  });
  if (await browse.isVisible()) await browse.click();
  await page.getByLabel("Search examples").fill("no-such-example-123456");
  await expect(
    page.getByText("No matching examples.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.getByLabel("A/B comparisons only").check();
  await expect(page.locator(".example-item").first()).toContainText(
    "A/B comparison",
  );
  await page.locator(".example-item").first().click();
  await expect(page.locator(".comparison-preview")).toContainText(
    "Only this field changes",
  );
  await expect(page.locator(".run-readiness")).toContainText(
    "Run: 1 request · A/B: 2 requests",
  );
  await expect(
    page.getByRole("button", { name: "Compare A/B", exact: true }),
  ).toBeEnabled();
  await page.locator("#example-state").fill("{}");
  await expect(
    page.getByRole("button", { name: "Compare A/B", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Run example", exact: true }),
  ).toBeEnabled();
});

test("results rail toggles from its bottom edge and with the keyboard", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Full-height rail is a desktop layout.",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/examples");
  const rail = page.getByRole("button", {
    name: "Expand results",
    exact: true,
  });
  const bounds = (await rail.boundingBox())!;
  const panel = (await page.locator(".example-results").boundingBox())!;
  expect(Math.abs(bounds.height - panel.height)).toBeLessThanOrEqual(2);
  await rail.click({
    position: { x: bounds.width / 2, y: bounds.height - 20 },
  });
  const collapse = page.getByRole("button", {
    name: "Collapse results",
    exact: true,
  });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  const open = (await page.locator(".example-results").boundingBox())!;
  const setup = (await page.locator(".experiment-panel").boundingBox())!;
  expect(Math.abs(open.height - setup.height)).toBeLessThanOrEqual(2);
  await collapse.focus();
  await page.keyboard.press("Enter");
  await expect(rail).toHaveAttribute("aria-expanded", "false");
});

test("PR review demo preserves evidence, filters risks, and recalculates thresholds", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/run", (r) => {
    calls++;
    return r.abort();
  });
  await page.goto("/pr-review");
  await page
    .getByRole("button", { name: "Run mock demo", exact: true })
    .click();
  await expect(page.locator(".pr-verdict")).toContainText("block_candidate");
  await expect(
    page.getByText("Mock results — no Jev request was made.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Risk filter").selectOption("high");
  await expect(page.locator(".hunk-card")).toHaveCount(1);
  await expect(page.locator(".hunk-card")).toContainText("src/auth.ts");
  await page.locator(".hunk-card summary").click();
  await expect(page.locator(".diff-evidence")).toContainText(
    "+export function authenticate(token: string, bypass: boolean)",
  );
  await page.getByText("Advanced thresholds", { exact: true }).click();
  await page.getByLabel("High-risk threshold").fill("1");
  await expect(page.locator(".pr-verdict")).toContainText("needs_review");
  expect(calls).toBe(0);
});

test("PR review sends only closed decisions and rejects invented model labels", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/run", async (route) => {
    calls++;
    const p = route.request().postDataJSON();
    expect(p.state.hunk.diff).toContain("@@");
    expect(p.state.changedFiles.length).toBe(3);
    const answers = Object.fromEntries(
      Object.entries(p.questions).map(([id, q]: [string, any]) => {
        expect(q.type).toBe("choice");
        expect(q.criteria.unknown).toBeTruthy();
        expect(q.criteria.needs_human_review).toBeTruthy();
        const choice =
          id === "rule"
            ? "hunk_evidence"
            : id === "safe_change"
              ? "invented_label"
              : "not_applicable";
        return [
          id,
          {
            type: "choice",
            choice,
            confidence: 0.99,
            probabilities: { [choice]: 0.99 },
          },
        ];
      }),
    );
    await route.fulfill({ json: { answers } });
  });
  await page.goto("/pr-review");
  await page
    .getByRole("button", { name: "Run mock demo", exact: true })
    .click();
  await page.getByRole("button", { name: "Review PR", exact: true }).click();
  await expect(page.locator(".review-progress")).toContainText("3 of 3");
  await expect(page.locator(".pr-verdict")).toContainText("needs_review");
  await expect(page.locator(".hunk-card").first()).toContainText(
    "invalid closed-set answer",
  );
  expect(calls).toBe(3);
});

test("pasting a PR link needs just one review action", async ({ page }) => {
  let loads = 0;
  let reviews = 0;
  await page.route("**/api/pull-request", async (route) => {
    loads++;
    expect(route.request().postDataJSON().url).toBe(
      "https://github.com/example/repo/pull/42",
    );
    await route.fulfill({
      json: {
        title: "Fix typo",
        description: "Docs only",
        url: "https://github.com/example/repo/pull/42",
        headSha: "abc",
        baseSha: "def",
        diff: "",
        files: [
          {
            path: "README.md",
            hunks: [
              {
                id: "f0-h0",
                path: "README.md",
                header: "@@ -1 +1 @@",
                diff: "@@ -1 +1 @@\n-tyop\n+typo",
                oldStart: 1,
                newStart: 1,
                complete: true,
              },
            ],
          },
        ],
      },
    });
  });
  await page.route("**/api/run", async (route) => {
    reviews++;
    const p = route.request().postDataJSON();
    expect(p.state.pr.title).toBe("Fix typo");
    const answers = Object.fromEntries(
      Object.keys(p.questions).map((id) => {
        const choice =
          id === "rule"
            ? "hunk_evidence"
            : id === "safe_change"
              ? "safe_change"
              : "not_applicable";
        return [
          id,
          {
            type: "choice",
            choice,
            confidence: 0.99,
            probabilities: { [choice]: 0.99 },
          },
        ];
      }),
    );
    await route.fulfill({ json: { answers } });
  });
  await page.goto("/pr-review");
  await page
    .getByLabel("PR URL or diff")
    .fill("https://github.com/example/repo/pull/42");
  await page.getByRole("button", { name: "Review PR", exact: true }).click();
  await expect(page.locator(".pr-verdict")).toContainText("approve_candidate");
  expect(loads).toBe(1);
  expect(reviews).toBe(1);
  expect(
    (await page.locator(".workspace-topbar").boundingBox())!.height,
  ).toBeLessThanOrEqual(page.viewportSize()!.width <= 540 ? 100 : 60);
});

test("AST governance traces callers, preserves policy gates, and simulates cache reuse", async ({
  page,
}) => {
  await page.goto("/ast-governance");
  let requests = 0;
  await page.route("**/api/run", async (route) => {
    requests++;
    await route.abort();
  });
  await page.getByRole("button", { name: "Run mock demo" }).click();
  await expect(
    page.getByText("Human review required", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Not updated — verify compatibility", { exact: true }),
  ).toBeVisible();
  const graph = await page.locator(".impact-graph").boundingBox();
  const panel = await page.locator("#governance-results").boundingBox();
  expect(graph!.x + graph!.width).toBeLessThanOrEqual(panel!.x + panel!.width);
  await page
    .getByText("Why it matters & what to do", { exact: true })
    .first()
    .click();
  await expect(
    page.getByText(
      "Ask the responsible code owner to inspect the linked changes.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("possible_breaking_change", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("missing_test_coverage", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("rerun tests", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Simulate verified test run" })
    .click();
  await expect(page.getByText("skip tests", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Human review required", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Unified diff", { exact: true })
    .fill(
      "diff --git a/.env b/.env\n--- a/.env\n+++ b/.env\n@@ -1 +1 @@\n-KEY=old\n+KEY=new\n",
    );
  await page
    .getByRole("button", { name: "Analyze changes", exact: true })
    .click();
  await expect(
    page.getByText("Blocked by policy", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Classify with Jev" }),
  ).toBeDisabled();
  expect(requests).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("SMT uses real Z3, rejects invalid syntax, and defers to exact results on disagreement", async ({
  page,
}) => {
  await page.route("**/api/run", (r) =>
    r.fulfill({
      json: {
        answers: {
          outcome: {
            type: "choice",
            choice: "satisfiable",
            confidence: 0.99,
            probabilities: { satisfiable: 0.99 },
          },
        },
      },
    }),
  );
  await page.goto("/smt-solver");
  await page.getByRole("button", { name: "Run Check", exact: true }).click();
  await expect(page.locator(".compact-verdict h2")).toHaveText("unsatisfiable");
  await expect(page.getByText("Agreement: No", { exact: true })).toBeVisible();
  await expect(
    page.getByText("The methods disagree. Z3 is authoritative.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Constraints", { exact: true })
    .fill("x > 5; process.exit()");
  await page.getByRole("button", { name: "Run Check", exact: true }).click();
  await expect(page.locator(".error-note")).toContainText("Unsupported syntax");
  await expect(page.locator(".compact-verdict")).toHaveCount(0);
});
test("SMT decomposes independent groups and records measured benchmark rows", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/run", async (r) => {
    requests++;
    const p = r.request().postDataJSON();
    expect(Object.keys(p.questions.outcome.criteria)).toEqual([
      "satisfiable",
      "unsatisfiable",
      "needs_decomposition",
      "unknown",
    ]);
    await r.fulfill({
      json: {
        answers: {
          outcome: {
            type: "choice",
            choice: "satisfiable",
            confidence: 0.6,
            probabilities: { satisfiable: 0.9 },
          },
        },
      },
    });
  });
  await page.goto("/smt-solver");
  await page
    .getByRole("button", { name: "Team availability", exact: true })
    .click();
  await page.getByRole("button", { name: "Run Check", exact: true }).click();
  await expect(page.locator(".compact-verdict h2")).toHaveText("satisfiable");
  await expect(
    page.getByRole("heading", { name: "Independent groups · 4" }),
  ).toBeVisible();
  expect(requests).toBe(4);
  await expect(
    page.getByRole("heading", { name: "needs_decomposition", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run benchmark" }).click();
  await expect(page.getByText(/5\/5 cases completed/)).toBeVisible({
    timeout: 25000,
  });
  await expect(page.getByText(/5 abstentions or unknowns/)).toBeVisible();
  await page.locator(".solver-options > summary").click();
  await page.getByLabel("Full exact check required").check();
  await expect(
    page.getByText("No benchmark measurements yet.", { exact: false }),
  ).toBeVisible();
});

test("every workspace has a distinct branded OG and matching Twitter preview", async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name !== "desktop", "Metadata matrix runs once.");
  const images = new Set<string>();
  for (const path of [
    "/",
    "/examples",
    "/conversation",
    "/gate",
    "/chess",
    "/workflow",
    "/extraction",
    "/memes",
    "/microduck",
    "/pr-review",
    "/ast-governance",
    "/smt-solver",
    "/tool-router",
    "/langchain",
    "/jev-browser-agent",
    "/reranker",
    "/doom",
  ]) {
    await page.goto(path);
    const og = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    const twitter = await page
      .locator('meta[name="twitter:image"]')
      .getAttribute("content");
    expect(og).toBeTruthy();
    expect(twitter).toBe(og);
    expect(images.has(og!)).toBeFalsy();
    images.add(og!);
    expect(
      await page.locator('meta[property="og:title"]').getAttribute("content"),
    ).toContain("TypeSafe");
    const r = await request.get(new URL(og!).pathname);
    expect(r.ok()).toBeTruthy();
    expect(r.headers()["content-type"]).toContain("image/png");
    const bytes = await r.body();
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
  }
});

test("tool router shows approval and blocks sensitive requests without a Jev call", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/run", async (r) => {
    requests++;
    await r.abort();
  });
  await page.goto("/tool-router");
  await page.getByLabel("Demo scenario").selectOption("1");
  await page.getByRole("button", { name: "Run mock scenario" }).click();
  await expect(page.locator(".compact-verdict h2")).toHaveText(
    "Approval checkpoint",
  );
  await expect(
    page.getByRole("button", { name: "Run Routing Step", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Approve mock step" }).click();
  await expect(page.locator(".compact-verdict h2")).toHaveText(
    "Modify configuration",
  );
  await page
    .getByRole("button", { name: "Run Routing Step", exact: true })
    .click();
  await expect(page.locator(".compact-verdict h2")).toHaveText("Complete");
  await page.getByLabel("Demo scenario").selectOption("2");
  await page
    .getByRole("button", { name: "Run Routing Step", exact: true })
    .click();
  await expect(page.locator(".compact-verdict h2")).toHaveText(
    "Blocked by policy",
  );
  expect(requests).toBe(0);
  const bounds = await page.locator(".compact-verdict").boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
});
test("tool router limits live choices to outgoing allowed nodes and falls back on low confidence", async ({
  page,
}) => {
  const seen: string[][] = [];
  await page.route("**/api/run", async (r) => {
    const p = r.request().postDataJSON();
    const keys = Object.keys(p.questions.next_node.criteria);
    seen.push(keys);
    expect(keys).toContain("needs_clarification");
    expect(keys).not.toContain("export_secrets_tool");
    const choice = seen.length === 1 ? "ops_agent" : "modify_config_tool";
    await r.fulfill({
      json: {
        answers: {
          next_node: {
            type: "choice",
            choice,
            confidence: seen.length === 1 ? 0.99 : 0.2,
            probabilities: { [choice]: 0.99 },
          },
        },
      },
    });
  });
  await page.goto("/tool-router");
  await page
    .getByRole("button", { name: "Run Routing Step", exact: true })
    .click();
  await expect(page.locator(".compact-verdict h2")).toHaveText(
    "Operations agent",
  );
  await page
    .getByRole("button", { name: "Run Routing Step", exact: true })
    .click();
  await expect(page.locator(".compact-verdict h2")).toHaveText(
    "Needs clarification",
  );
  expect(seen[1]).toEqual([
    "read_config_tool",
    "modify_config_tool",
    "needs_clarification",
  ]);
  await expect(
    page.getByRole("button", { name: "Approve mock step" }),
  ).toHaveCount(0);
});

test("LangChain demo invokes the real structured tool and surfaces approval without execution", async ({
  page,
}) => {
  await page.goto("/langchain");
  await page.getByRole("button", { name: "Try mock invocation" }).click();
  await expect(page.locator(".compact-verdict h2")).toHaveText(
    "Read configuration",
  );
  await expect(
    page.getByText("None · routing only", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("#langchain-result pre")).toContainText(
    '"executed": false',
  );
  await page.getByLabel("Example request").selectOption("1");
  await page.getByRole("button", { name: "Try mock invocation" }).click();
  await expect(page.locator(".compact-verdict h2")).toHaveText(
    "Approval checkpoint",
  );
  await expect(
    page.getByRole("heading", { name: "Your host must ask for approval" }),
  ).toBeVisible();
  await page.getByLabel("Example request").selectOption("2");
  await page
    .getByRole("button", { name: "Invoke LangChain tool", exact: true })
    .click();
  await expect(page.locator(".compact-verdict h2")).toHaveText(
    "Blocked by policy",
  );
  await expect(page.locator("#langchain-result pre")).toContainText(
    '"source": "deterministic"',
  );
});

test("PR decision trace links model signals and policy gates back to exact evidence", async ({
  page,
}) => {
  await page.goto("/pr-review");
  await page.getByRole("button", { name: "Run mock demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Why this decision" }),
  ).toBeVisible();
  await expect(page.locator(".trace-thresholds")).toContainText("95.0%");
  await page
    .getByRole("button", { name: /Inspect evidence for/ })
    .first()
    .click();
  await expect(page.locator(".hunk-card[open] .hunk-gate-trace")).toBeVisible();
  await expect(page.locator(".hunk-card[open] .hunk-gate-trace")).toContainText(
    "Final route: human review",
  );
  await expect(page.locator(".hunk-card[open] .diff-evidence")).toContainText(
    "@@",
  );
});

test("ask gate cites its evidence and hands weak matches to a human", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/run", async (route) => {
    calls++;
    const payload = route.request().postDataJSON();
    expect(Object.keys(payload.questions.decision.criteria).sort()).toEqual([
      "already_answered",
      "answerable_by_docs",
      "needs_human",
      "needs_more_context",
    ]);
    const ids = Object.keys(payload.questions.evidence.criteria);
    expect(ids[0]).toBe("none");
    await route.fulfill({
      json: {
        answers: {
          decision: {
            type: "choice",
            choice: "already_answered",
            probabilities: {
              already_answered: 0.82,
              answerable_by_docs: 0.1,
              needs_human: 0.05,
              needs_more_context: 0.03,
            },
          },
          evidence: {
            type: "choice",
            choice: ids.find((id: string) => id.startsWith("M")),
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
  await expect(page.locator(".gate-verdict")).toContainText("82.0%");
  await expect(page.locator("blockquote").first()).toContainText("429");
  await expect(page.locator(".suggested-reply")).toContainText(
    "This came up earlier",
  );
  await page.getByRole("slider").fill("90");
  await expect(page.locator(".gate-verdict")).toHaveAttribute(
    "data-outcome",
    "needs_human",
  );
  await expect(page.getByText("Jev proposed")).toBeVisible();
  await expect(page.locator(".suggested-reply")).toHaveCount(0);
  expect(calls).toBe(1);
});

test("batch mode gates each question and counts the avoidable ones", async ({
  page,
}) => {
  const asked: string[] = [];
  await page.route("**/api/run", async (route) => {
    const payload = route.request().postDataJSON();
    asked.push(payload.state.question);
    const duplicate = /too many requests|api key|default model/i.test(
      payload.state.question,
    );
    const choice = duplicate ? "already_answered" : "needs_human";
    const evidence = Object.keys(payload.questions.evidence.criteria).find(
      (id: string) => id.startsWith("M"),
    );
    await route.fulfill({
      json: {
        answers: {
          decision: {
            type: "choice",
            choice,
            probabilities: { [choice]: 0.95 },
          },
          ...(duplicate && evidence
            ? { evidence: { type: "choice", choice: evidence } }
            : {}),
        },
      },
    });
  });
  await page.goto("/gate");
  await page.getByLabel("Mode", { exact: true }).selectOption("batch");
  await page.getByRole("button", { name: "Run triage", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(6);
  expect(asked).toHaveLength(6);
  await expect(page.locator(".annoyance-meter")).toContainText("3 of 6");
  await expect(page.locator(".annoyance-meter")).toContainText(
    "The answer was right there.",
  );
  await expect(page.locator(".outcome-badge").first()).toContainText(
    "Already answered",
  );
});

test("microduck drives from the closed action set and stops when it cannot", async ({
  page,
}) => {
  let reply: "choice" | "unknown" | "fail" = "choice";
  const asks: Record<string, unknown>[] = [];
  await page.route("**/api/run", async (route) => {
    const payload = route.request().postDataJSON();
    asks.push(payload.state);
    expect(Object.keys(payload.questions)).toEqual(["action"]);
    expect(Object.keys(payload.questions.action.criteria).sort()).toEqual([
      "drop",
      "move_backward",
      "move_forward",
      "pick_up",
      "stop",
      "turn_left",
      "turn_right",
    ]);
    if (reply === "fail")
      return route.fulfill({
        status: 429,
        json: { error: "Rate limit reached. Try again." },
      });
    await route.fulfill({
      json: {
        answers: {
          action:
            reply === "choice"
              ? {
                  type: "choice",
                  choice: "turn_left",
                  probabilities: { turn_left: 0.74, stop: 0.12 },
                }
              : { type: "choice", choice: "fly_away" },
        },
      },
    });
  });
  await page.goto("/microduck");
  await page.getByRole("button", { name: "Step", exact: true }).click();
  await expect(page.locator(".telemetry")).toContainText("Turn left");
  await expect(page.locator(".telemetry")).toContainText("74.0%");
  await expect(page.locator(".duck-roster caption")).toContainText("Tick 1");
  expect(asks).toHaveLength(2);
  expect(Object.keys(asks[0]).sort()).toEqual([
    "battery_pct",
    "carrying",
    "distance_to_goal",
    "goal_direction",
    "last_action",
    "obstacle_ahead",
    "obstacle_left",
    "obstacle_right",
    "on_goal",
  ]);

  // The withheld-sensor test re-asks the same tick with fields dropped.
  await page.getByText("Withheld-sensor test and model").click();
  await page.getByLabel("Re-ask each tick with fields withheld").check();
  await page.getByRole("button", { name: "Step", exact: true }).click();
  await expect(page.locator(".degraded")).toContainText("2 fields withheld");
  expect(asks).toHaveLength(6);
  expect(asks.at(-1)).not.toHaveProperty("obstacle_left");
  expect(asks.at(-1)).toHaveProperty("obstacle_ahead");

  // An action outside the seven, then a failed call: both hold the duck still.
  reply = "unknown";
  await page.getByLabel("Re-ask each tick with fields withheld").uncheck();
  await page.getByRole("button", { name: "Step", exact: true }).click();
  await expect(page.locator(".telemetry")).toContainText(
    "Nothing usable came back",
  );
  reply = "fail";
  await page.getByRole("button", { name: "Step", exact: true }).click();
  await expect(page.locator(".telemetry .error-text")).toContainText(
    "Rate limit reached",
  );
  await expect(page.locator(".scoreboard")).toContainText("Failed calls");
});

test("chess sends only legal moves and marks the blunders it plays", async ({
  page,
}) => {
  // The mock always answers with the first legal candidate the page offered,
  // which is exactly the "no lookahead" behaviour the workspace is about.
  const asked: { state: Record<string, unknown>; moves: string[] }[] = [];
  let reply: "first" | "illegal" | "empty" | "fail" = "first";
  await page.route("**/api/run", async (route) => {
    const payload = route.request().postDataJSON();
    expect(Object.keys(payload.questions)).toEqual(["move"]);
    expect(payload.questions.move.type).toBe("choice");
    const moves = Object.keys(payload.questions.move.criteria);
    asked.push({ state: payload.state, moves });
    // The board itself is never sent — only the nine-field summary.
    expect(Object.keys(payload.state).sort()).toEqual([
      "captures_available",
      "checks_available",
      "in_check",
      "last_opponent_move",
      "legal_move_count",
      "material_balance",
      "move_number",
      "phase",
      "side_to_move",
    ]);
    if (reply === "fail")
      return route.fulfill({
        status: 429,
        json: { error: "Rate limit reached. Try again." },
      });
    const choice =
      reply === "illegal" ? "Qxz9#" : reply === "empty" ? "" : moves[0];
    await route.fulfill({
      json: {
        answers: {
          move:
            reply === "empty"
              ? { type: "choice" }
              : {
                  type: "choice",
                  choice,
                  probabilities: { [moves[0]]: 0.71, [moves[1]]: 0.09 },
                },
        },
      },
    });
  });
  await page.goto("/chess");
  await expect(
    page.getByText("This is the wrong tool for this job"),
  ).toBeVisible();
  await page.getByRole("button", { name: "One move", exact: true }).click();
  // 20 legal openings for White, and every candidate key is a real move.
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0].moves).toHaveLength(20);
  expect(asked[0].moves).toContain("e4");
  expect(asked[0].state.side_to_move).toBe("white");
  await expect(page.locator(".chess-verdict")).toContainText("71.0%");
  await expect(page.locator(".chess-log")).toContainText("1");

  // The opponent replied, so the next ask names Black's last move.
  await page.getByRole("button", { name: "One move", exact: true }).click();
  await expect.poll(() => asked.length).toBe(2);
  expect(asked[1].state.last_opponent_move).not.toBe("none");
  expect(asked[1].state.move_number).toBe(2);

  // An answer outside the legal list falls back to the best-scoring legal move
  // rather than playing something illegal.
  reply = "illegal";
  await page.getByRole("button", { name: "One move", exact: true }).click();
  await expect.poll(() => asked.length).toBe(3);
  await expect(page.locator(".chess-verdict")).toContainText(
    "outside the legal list",
  );

  // Nothing usable still produces a legal move rather than hanging the game.
  reply = "empty";
  await page.getByRole("button", { name: "One move", exact: true }).click();
  await expect.poll(() => asked.length).toBe(4);
  await expect(page.locator(".chess-verdict")).toContainText(
    "returned nothing usable",
  );

  // A failed request surfaces and plays no move at all.
  reply = "fail";
  const before = await page.locator(".chess-log tbody tr").count();
  await page.getByRole("button", { name: "One move", exact: true }).click();
  await expect(page.locator(".error-note")).toContainText("Rate limit reached");
  expect(await page.locator(".chess-log tbody tr").count()).toBe(before);
});

test("chess re-marks blunders locally when the threshold moves", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/run", async (route) => {
    calls++;
    const moves = Object.keys(
      route.request().postDataJSON().questions.move.criteria,
    );
    await route.fulfill({
      json: {
        answers: {
          move: {
            type: "choice",
            choice: moves[0],
            probabilities: { [moves[0]]: 0.5 },
          },
        },
      },
    });
  });
  await page.goto("/chess");
  await page.getByLabel("Mode", { exact: true }).selectOption("jev_random");
  await page.getByRole("button", { name: "One move", exact: true }).click();
  await expect(page.locator(".chess-verdict")).toBeVisible();
  const seen = calls;
  // Dragging the threshold re-judges the moves already played, with no new
  // request: the referee is local.
  await page.getByRole("slider", { name: /Blunder threshold/ }).fill("50");
  await expect(page.locator(".chess-verdict")).toBeVisible();
  expect(calls).toBe(seen);
});
