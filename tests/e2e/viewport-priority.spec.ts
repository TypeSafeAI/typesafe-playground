import { test, expect } from "@playwright/test";
import { SECTION_IDS, SECTION_WORKSPACES } from "../../lib/routes";

const routes = [
  "/",
  ...SECTION_IDS.map((s) => `/${s}`),
  ...SECTION_IDS.flatMap((s) => SECTION_WORKSPACES[s].map((w) => `/${s}/${w}`)),
  "/agents/jev-browser-agent/native",
];

const actions: Record<string, string> = {
  "/language/examples": "Run example",
  "/language/conversation": "Pick a recipient",
  "/language/extraction": "Run extraction",
  "/language/youtube-extract": "Create extract · Live Jev",
  "/language/reranker": "Compare both",
  "/language/memes": "Test meme",
  "/agents/gate": "Run triage",
  "/agents/workflow": "Send message",
  "/agents/tool-router": "Run Routing Step",
  "/agents/langchain": "Invoke LangChain tool",
  "/agents/clean-room": "Run local demo",
  "/agents/jev-browser-agent": "Find PC parts",
  "/governance/pr-review": "Review PR",
  "/governance/proposal-review": "Review proposal",
  "/governance/ast-governance": "Analyze changes",
  "/governance/smt-solver": "Run Check",
  "/simulations/doom": "Start arena",
  "/simulations/microduck": "Run 15 ticks",
  "/simulations/chess": "Play out",
  "/simulations/iq-test": "Run test",
  "/simulations/twisty-puzzles": "Run Jev · up to 40 moves",
  "/arcade/snake": "Play",
  "/arcade/breakout": "Play",
  "/arcade/meteor-dodge": "Play",
  "/agents/jev-browser-agent/native": "Run with Jev",
};

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/health", (r) =>
    r.fulfill({ json: { configured: true } }),
  );
  await page.route("**/api/**", (r) =>
    r.request().method() === "POST"
      ? r.fulfill({ status: 503, json: { error: "Offline layout audit" } })
      : r.fallback(),
  );
});

for (const path of routes)
  test(`desktop task viewport ${path}`, async ({ page }, info) => {
    test.skip(
      info.project.name !== "desktop",
      "Desktop geometry; narrow reflow has its own route matrix.",
    );
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    if (path === "/simulations/twisty-puzzles") {
      await expect(page.locator(".twisty-board svg")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Load scramble", exact: true }),
      ).toBeInViewport({ ratio: 1 });
    }
    // Chat intentionally starts with a collapsed rail; other pages use a fresh expanded rail.
    await expect
      .poll(() =>
        page
          .locator("#main > :first-child")
          .evaluate((el) => el.scrollHeight - el.clientHeight),
      )
      .toBeLessThanOrEqual(1);
    const main = page.locator("#main");
    const action = actions[path]
      ? main.getByRole("button", { name: actions[path], exact: true })
      : null;
    if (action) {
      await expect(action).toBeInViewport({ ratio: 1 });
      // A viewport intersection alone misses clipping by a nested overflow region.
      expect(
        await action.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(
            r.x + r.width / 2,
            r.y + r.height / 2,
          );
          return hit === el || el.contains(hit);
        }),
      ).toBe(true);
    }
    for (const selector of [
      ".chess-board",
      ".arcade-board",
      ".twisty-board svg",
      ".doom-viewport",
      ".microduck-drive",
    ]) {
      const output = main.locator(selector).first();
      if (await output.count())
        await expect(output).toBeInViewport({ ratio: 1 });
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath("desktop.png") });
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-theme", "dark"),
    );
    await page.screenshot({ path: info.outputPath("dark.png") });
    // 320 CSS pixels exercises the reflow width equivalent to 400% browser zoom at 1280px.
    // This is automated reflow coverage, not a human browser-zoom acceptance claim.
    for (const size of [
      { width: 320, height: 568 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(size);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await main.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      const workspace = main.locator(":scope > :first-child");
      expect(
        await workspace.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`reflow-${size.width}.png`),
      });
    }
  });

test("section navigation supports keyboard disclosure, named flyouts, Escape and resize", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "Desktop rail interaction.");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/language/extraction");
  const nav = page.getByRole("navigation", { name: "Workspaces" });
  await expect(
    nav.getByRole("group", { name: "Extract & rank", exact: true }),
  ).toBeVisible();
  const disclose = nav.getByRole("button", {
    name: "Show Agents & workflows workspaces",
    exact: true,
  });
  await disclose.focus();
  await disclose.press("Enter");
  await expect(
    nav.getByRole("link", { name: "Ask gate", exact: true }),
  ).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "Document extraction", exact: true }),
  ).toBeHidden();
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  const trigger = nav.getByRole("button", {
    name: "Language & data workspaces",
    exact: true,
  });
  await expect(trigger).toHaveAttribute("aria-current", "true");
  await trigger.focus();
  await trigger.press("Enter");
  const flyout = nav.getByRole("region", {
    name: "Language & data navigation",
    exact: true,
  });
  await expect(flyout).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    flyout.getByRole("link", { name: "Language & data", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(flyout).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  await flyout
    .getByRole("link", { name: "Vector reranker", exact: true })
    .click();
  await expect(page).toHaveURL(/\/language\/reranker$/);
  await expect(flyout).toBeHidden();
  await trigger.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(flyout).toBeHidden();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(
    nav.getByRole("link", { name: "Vector reranker", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open navigation", exact: true }),
  ).toBeFocused();
});

test("expanded details retain reachable task controls on short desktop screens", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "Desktop overflow fallback.");
  await page.setViewportSize({ width: 1280, height: 560 });
  for (const [path, disclosure, action] of [
    [
      "/governance/smt-solver",
      "Seeded benchmark · five comparison cases",
      "Run Check",
    ],
    [
      "/governance/proposal-review",
      "Review criteria · the four questions",
      "Review proposal",
    ],
    [
      "/agents/langchain",
      "Use this tool in your TypeScript app",
      "Invoke LangChain tool",
    ],
    ["/simulations/chess", "Decision details and move history", "Play out"],
  ]) {
    await page.goto(path);
    await page.getByText(disclosure, { exact: true }).click();
    const control = page.getByRole("button", { name: action, exact: true });
    await control.focus();
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeInViewport({ ratio: 1 });
    expect(
      await control.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.x + r.width / 2,
          r.y + r.height / 2,
        );
        return hit === el || el.contains(hit);
      }),
    ).toBe(true);
  }
});

test("IQ question inspection resets its independently scrolled region", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Desktop independent question region.",
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/simulations/iq-test");
  const region = page.getByRole("region", {
    name: "Selected question",
    exact: true,
  });
  await region.focus();
  await expect(region).toBeFocused();
  await region.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page
    .getByRole("button", { name: /Question 2: One repeated rule/ })
    .click();
  await expect.poll(() => region.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(
    region.getByRole("heading", { name: "One repeated rule" }),
  ).toBeInViewport();
});

test("proposal execution mode remains visible beside its action", async ({
  page,
}) => {
  await page.goto("/governance/proposal-review");
  await expect(
    page.getByLabel("Selected reviewer mode", { exact: true }),
  ).toHaveText("Mock · simulated decisions");
  await page.getByRole("button", { name: "Live Jev", exact: true }).click();
  const action = page.getByRole("button", {
    name: "Review proposal",
    exact: true,
  });
  await action.scrollIntoViewIfNeeded();
  await expect(
    page.getByLabel("Selected reviewer mode", { exact: true }),
  ).toHaveText("Live Jev");
  await expect(
    page.getByLabel("Selected reviewer mode", { exact: true }),
  ).toBeInViewport();
});
