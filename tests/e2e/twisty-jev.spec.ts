import { test, expect, type Page, type Route } from "@playwright/test";

function answer(route: Route, move: string) {
  const payload = route.request().postDataJSON();
  return {
    model: "jev-mocked-for-test",
    answers: {
      move: {
        type: "choice",
        choice: move,
        confidence: 1,
        probabilities: Object.fromEntries(
          Object.keys(payload.questions.move.criteria).map((candidate) => [
            candidate,
            candidate === move ? 1 : 0,
          ]),
        ),
      },
    },
  };
}
async function load(page: Page, input = "R") {
  await page.goto("/simulations/twisty-puzzles");
  await page.getByLabel("Scramble from a solved puzzle").fill(input);
  await page
    .getByRole("button", { name: "Load scramble", exact: true })
    .click();
}
test.beforeEach(async ({ page }) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { ok: true, configured: false } }),
  );
  // Never allow this suite to spend shared provider credits.
  await page.route("**/api/run", (route) =>
    route.fulfill({
      status: 500,
      json: { error: "Unconfigured test response" },
    }),
  );
});

for (const [puzzle, scramble, move] of [
  ["2×2 cube", "R", "R'"],
  ["3×3 cube", "R", "R'"],
  ["4×4 cube", "Rw", "Rw'"],
  ["Megaminx", "FR", "FR'"],
]) {
  test(`${puzzle}: default Jev mode sends a real request contract and verifies the selected move`, async ({
    page,
  }) => {
    const requests: any[] = [],
      workers: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/generated/twisty/"))
        workers.push(request.url());
    });
    await page.route("**/api/run", (route) => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ json: answer(route, move) });
    });
    await page.goto("/simulations/twisty-puzzles");
    await expect(
      page.getByRole("button", { name: "Live Jev", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: puzzle, exact: true }).click();
    await expect(page.locator(".twisty-board")).toHaveAttribute(
      "data-status",
      "ready",
    );
    const colors = () =>
      page
        .locator(".twisty-board svg stop")
        .evaluateAll((stops) =>
          stops.map((stop) => stop.getAttribute("stop-color")),
        );
    const solvedColors = await colors();
    await page.getByLabel("Scramble from a solved puzzle").fill(scramble);
    await page
      .getByRole("button", { name: "Load scramble", exact: true })
      .click();
    await expect.poll(colors).not.toEqual(solvedColors);
    await page
      .getByRole("button", { name: "One Jev move", exact: true })
      .click();
    await expect(page.locator(".twisty-proof")).toContainText(
      "Verified · Jev-selected moves · 1 moves",
    );
    await expect.poll(colors).toEqual(solvedColors);
    expect(requests).toHaveLength(1);
    expect(requests[0].model).toBe("jev-latest");
    expect(requests[0].state.outcomes[move].solved).toBe(true);
    expect(requests[0].state.piece_state).toBeTruthy();
    expect(requests[0].state.solution).toBeUndefined();
    expect(workers).toEqual([]);
    await page.getByText("Jev decision receipts (1)", { exact: true }).click();
    await expect(page.locator(".twisty-receipts")).toContainText(
      "jev-mocked-for-test",
    );
    await page.getByRole("button", { name: "Previous solution step" }).click();
    await expect.poll(colors).not.toEqual(solvedColors);
  });
}

test("a valid but unhelpful Jev move stays unsolved, with no local fallback", async ({
  page,
}) => {
  await page.route("**/api/run", (route) =>
    route.fulfill({ json: answer(route, "U") }),
  );
  await load(page);
  await page.getByRole("button", { name: "One Jev move", exact: true }).click();
  await expect(page.locator(".twisty-jev-status")).toContainText("not solved");
  await expect(page.locator(".twisty-proof")).toHaveCount(0);
  await expect(page.locator(".twisty-jev")).toContainText(
    "1 Jev moves applied",
  );
});

test("already-solved input is explicit and sends no Jev request", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/run", (route) => {
    requests++;
    return route.fulfill({ json: answer(route, "R") });
  });
  await load(page, "");
  await page.getByRole("button", { name: "One Jev move", exact: true }).click();
  await expect(page.locator(".twisty-proof")).toContainText(
    "Already solved · No Jev request",
  );
  expect(requests).toBe(0);
});

test("pause retains applied moves and resume continues from the same piece state", async ({
  page,
}) => {
  let requests = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/run", async (route) => {
    const number = ++requests;
    if (number === 2) await gate;
    await route
      .fulfill({ json: answer(route, number === 1 ? "U'" : "R'") })
      .catch(() => {});
  });
  await load(page, "R U");
  await page
    .getByRole("button", { name: "Run Jev · up to 200 moves", exact: true })
    .click();
  await expect.poll(() => requests).toBe(2);
  await page.getByRole("button", { name: "Pause Jev", exact: true }).click();
  release();
  await page.waitForTimeout(250);
  await expect(page.locator(".twisty-jev")).toContainText(
    "1 Jev moves applied",
  );
  await expect(page.locator(".twisty-proof")).toHaveCount(0);
  await page.getByRole("button", { name: "One Jev move", exact: true }).click();
  await expect(page.locator(".twisty-proof")).toContainText(
    "Jev-selected moves · 2 moves",
  );
  expect(requests).toBe(3);
});

for (const failure of ["invalid", "provider"]) {
  test(`${failure} answer applies no move and does not report success`, async ({
    page,
  }) => {
    await page.route("**/api/run", (route) =>
      route.fulfill(
        failure === "provider"
          ? { status: 502, json: { error: "Provider unavailable" } }
          : { json: answer(route, "invented") },
      ),
    );
    await load(page);
    await page
      .getByRole("button", { name: "One Jev move", exact: true })
      .click();
    await expect(page.locator(".twisty-jev").getByRole("alert")).toContainText(
      failure === "provider" ? "Provider unavailable" : "No move was applied",
    );
    await expect(page.locator(".twisty-proof")).toHaveCount(0);
    await expect(page.locator(".twisty-jev")).toContainText(
      "0 Jev moves applied",
    );
  });
}

for (const change of [
  "pause",
  "draft",
  "puzzle",
  "mode",
  "hidden",
  "key",
  "navigate",
]) {
  test(`${change} discards a pending Jev answer`, async ({ page }) => {
    let requested = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/run", async (route) => {
      requested = true;
      await gate;
      await route.fulfill({ json: answer(route, "R'") }).catch(() => {});
    });
    await load(page);
    await page
      .getByRole("button", { name: "One Jev move", exact: true })
      .click();
    await expect.poll(() => requested).toBe(true);
    if (change === "pause")
      await page
        .getByRole("button", { name: "Pause Jev", exact: true })
        .click();
    if (change === "draft")
      await page.getByLabel("Scramble from a solved puzzle").fill("U");
    if (change === "puzzle")
      await page.getByRole("button", { name: "2×2 cube", exact: true }).click();
    if (change === "mode")
      await page
        .getByRole("button", { name: "Local solver", exact: true })
        .click();
    if (change === "hidden")
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          get: () => true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    if (change === "key")
      await page.evaluate(() => {
        localStorage.setItem("typesafe-api-key-revision", "test-revision");
        window.dispatchEvent(new Event("typesafe-api-key-change"));
      });
    if (change === "navigate") await page.goto("/simulations");
    release();
    await page.waitForTimeout(250);
    await expect(page.locator(".twisty-proof")).toHaveCount(0);
    if (!["mode", "navigate"].includes(change))
      await expect(page.locator(".twisty-jev")).toContainText(
        "0 Jev moves applied",
      );
  });
}

test("request deadline stops an unanswered attempt", async ({ page }) => {
  await load(page);
  await page.clock.install();
  let requested = false;
  await page.route("**/api/run", () => {
    requested = true;
  });
  await page.getByRole("button", { name: "One Jev move", exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await page.clock.runFor(45_100);
  await expect(page.locator(".twisty-jev").getByRole("alert")).toContainText(
    "45-second request limit",
  );
  await expect(page.locator(".twisty-proof")).toHaveCount(0);
});

test("Jev continues past 40 moves and stops at 200 without claiming success", async ({
  page,
}) => {
  test.setTimeout(90_000);
  let requests = 0;
  await page.route("**/api/run", (route) => {
    requests++;
    const state = route.request().postDataJSON().state;
    expect(state.move_number).toBe(requests);
    expect(state.remaining_moves).toBe(201 - requests);
    return route.fulfill({ json: answer(route, requests % 2 ? "R" : "R'") });
  });
  await load(page, "F");
  await page.clock.install();
  await page
    .getByRole("button", { name: "Run Jev · up to 200 moves", exact: true })
    .click();
  for (let i = 1; i <= 200; i++) {
    await expect.poll(() => requests).toBeGreaterThanOrEqual(i);
    await page.clock.runFor(1250);
  }
  await expect(page.locator(".twisty-jev-status")).toContainText(
    "Incomplete: reached the 200-move limit",
  );
  await expect(
    page.getByRole("button", { name: "One Jev move", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Run Jev · up to 200 moves",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.locator(".twisty-proof")).toHaveCount(0);
  await page.clock.runFor(5000);
  expect(requests).toBe(200);
});
