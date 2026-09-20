import { test, expect, type Locator } from "@playwright/test";
import { validatePayload } from "../../lib/api";
import type { RunPayload } from "../../lib/api";
import type { StoryFrame } from "../../lib/jev-chat/story";

async function expectFullyInScrollport(locator: Locator) {
  await expect(locator).toBeVisible();
  // Chromium rounds scroll offsets: measured edge clipping was 0.094px and
  // 0.141px at 3x. Check every clipped edge, including scroll ancestors, with
  // at most one physical pixel of tolerance instead of relaxing the area ratio.
  await expect
    .poll(() =>
      locator.evaluate(
        (element) =>
          new Promise<number>((resolve) => {
            const observer = new IntersectionObserver(([entry]) => {
              observer.disconnect();
              const box = entry.boundingClientRect;
              const visible = entry.intersectionRect;
              resolve(
                entry.isIntersecting
                  ? Math.max(
                      0,
                      visible.left - box.left,
                      box.right - visible.right,
                      visible.top - box.top,
                      box.bottom - visible.bottom,
                    ) * devicePixelRatio
                  : Infinity,
              );
            });
            observer.observe(element);
          }),
      ),
    )
    .toBeLessThanOrEqual(1);
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/health", (r) =>
    r.fulfill({ json: { configured: false } }),
  );
  await page.route("**/api/run", (r) =>
    r.fulfill({ status: 500, json: { error: "Unexpected unmocked request." } }),
  );
});
test("built-in help and repetition recovery work in live mode despite uncertain intent", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/run", (route) => {
    calls++;
    const body = validatePayload(route.request().postDataJSON());
    return route.fulfill({
      json: {
        answers: Object.fromEntries(
          Object.entries(body.questions).map(([id, q]) => [
            id,
            q.type === "noul"
              ? { type: "noul", noul: id === "conflict" ? 0 : 0.95 }
              : {
                  type: "choice",
                  choice:
                    id === "intent" ? "explain" : Object.keys(q.criteria!)[0],
                  confidence: 0.28,
                },
          ]),
        ),
      },
    });
  });
  await page.goto("/jev-chat");
  await page.getByLabel("Chat mode").selectOption("live");
  const send = async (text: string) => {
    await page.getByLabel("Message Jev").fill(text);
    await page.getByLabel("Message Jev").press("Enter");
  };
  await send("Explain how Jev works");
  const latest = () => page.locator(".jc-assistant").last();
  await expect(latest()).toContainText("Jev evaluates typed questions");
  await expect(latest().locator(".jc-message-author")).toContainText(
    "Scripted help · live mode",
  );
  expect(calls).toBe(0);
  await send("Explain the chat mechanism please");
  await expect(latest()).toContainText("I’m not sure which task you mean");
  await send("why are you repeating yourself?");
  await expect(latest()).toContainText("Repeating it wasn’t helpful");
  await expect(latest()).not.toContainText("I’m not sure which task you mean");
  await page
    .locator(".jc-followups")
    .getByRole("button", { name: "Explain how Jev works", exact: true })
    .click();
  await page.getByLabel("Message Jev").press("Enter");
  await expect(page.locator(".jc-assistant")).toHaveCount(4);
  await expect(latest()).toContainText("Jev evaluates typed questions");
  expect(calls).toBe(1);
  await page.reload();
  await expect(page.locator(".jc-assistant")).toHaveCount(4);
  await expect(latest().locator(".jc-message-author")).toContainText(
    "Scripted help",
  );
  await latest()
    .getByText("How this response was composed", { exact: true })
    .click();
  await expect(latest()).toContainText("0 · scripted help");
  await expect(latest()).toContainText(
    "No Jev request or model assessment was used",
  );
  await page.getByRole("button", { name: "Verify content" }).click();
  await expect(latest()).toContainText("Content integrity verified");
  expect(calls).toBe(1);
  await latest().locator(".jc-message-author").scrollIntoViewIfNeeded();
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("body").evaluate((element) => element.clientWidth),
  );
  await page.screenshot({
    path: test.info().outputPath("scripted-help-live.png"),
    fullPage: true,
  });
});
test("live creative constraints support exclusions, saved continuity and delegated revisions", async ({
  page,
}) => {
  const requests: RunPayload[] = [];
  let malformedRanking = false;
  await page.route("**/api/run", (route) => {
    const body = validatePayload(route.request().postDataJSON());
    requests.push(body);
    const question = String(
      (body.state as Record<string, unknown>).resolved_question,
    );
    const changingCharacter = question.startsWith("Change the character");
    const changingSetting = question.startsWith("Change the setting");
    const revising = changingCharacter || changingSetting;
    const answers = Object.fromEntries(
      Object.entries(body.questions).map(([id, q]) => {
        if (q.type === "noul") {
          const allowedCharacter = changingCharacter
            ? id !== "story_allows_character_keeper"
            : id === "story_allows_character_keeper";
          return [
            id,
            {
              type: "noul",
              noul:
                id === "conflict"
                  ? 0
                  : changingCharacter && id.startsWith("supported_story_")
                    ? id.endsWith("_alt_1")
                      ? 0.95
                      : 0.05
                    : id.startsWith("story_allows_character_")
                      ? allowedCharacter
                        ? 0.95
                        : 0.05
                      : id.startsWith("story_allows_")
                        ? 0.05
                        : 0.95,
            },
          ];
        }
        if (q.type === "score")
          return [
            id,
            {
              type: "score",
              score: 0.5,
              confidence: 0.3,
              probabilities: malformedRanking
                ? { "0": 0.7, "1": 0.7 }
                : { "0": 0.5, "1": 0.5 },
            },
          ];
        let selected = Object.keys(q.criteria!)[0];
        if (id === "intent") selected = "create";
        else if (id === "story_action") selected = revising ? "revise" : "new";
        else if (id.startsWith("story_mode_")) {
          selected =
            id === "story_mode_style"
              ? "preserved"
              : revising
                ? changingCharacter && id === "story_mode_character"
                  ? "constrained"
                  : changingSetting && id === "story_mode_setting"
                    ? "delegated"
                    : "preserved"
                : id === "story_mode_character"
                  ? "constrained"
                  : "delegated";
        }
        return [id, { type: "choice", choice: selected, confidence: 0.95 }];
      }),
    );
    return route.fulfill({ json: { answers } });
  });
  await page.goto("/jev-chat");
  await page.getByLabel("Chat mode").selectOption("live");
  await page.getByRole("button", { name: "Story studio", exact: true }).click();
  await page
    .getByLabel("Message Jev")
    .fill(
      "Write a fictional scene with a lighthouse keeper. Surprise me with the rest.",
    );
  await page.getByLabel("Message Jev").press("Enter");
  await expect(page.locator(".jc-assistant")).toContainText(
    "Fictional composition",
  );
  expect(requests).toHaveLength(2);
  const first = (requests[1].state as { candidates: { story: StoryFrame }[] })
    .candidates[0].story;
  expect(first.choices.character).toBe("keeper");
  expect(first.style).toBe("balanced");
  await expect(page.getByLabel("Response detail")).toHaveValue("balanced");
  await page.reload();
  await expect(page.locator(".jc-assistant")).toHaveCount(1);
  expect(requests).toHaveLength(2);
  await page
    .getByLabel("Message Jev")
    .fill(
      "Change the character to anyone except the keeper; keep everything else.",
    );
  await page.getByLabel("Message Jev").press("Enter");
  await expect(page.locator(".jc-assistant")).toHaveCount(2);
  expect(requests).toHaveLength(4);
  const changedCandidates = (
    requests[3].state as { candidates: { id: string; story: StoryFrame }[] }
  ).candidates;
  expect(changedCandidates).toHaveLength(3);
  expect(changedCandidates[1].id).toMatch(/_alt_1$/);
  const changed = changedCandidates[1].story;
  expect(changed.choices.character).not.toBe("keeper");
  expect({
    ...changed,
    choices: { ...changed.choices, character: first.choices.character },
  }).toEqual(first);
  await page.reload();
  await expect(page.locator(".jc-assistant")).toHaveCount(2);
  expect(requests).toHaveLength(4);
  await page
    .getByLabel("Message Jev")
    .fill("Change the setting; surprise me and keep everything else.");
  await page.getByLabel("Message Jev").press("Enter");
  await expect(page.locator(".jc-assistant")).toHaveCount(3);
  await expect(page.locator(".jc-assistant").last()).toContainText(
    "Fictional composition",
  );
  expect(requests).toHaveLength(6);
  expect(
    (requests[4].state as { previous_story: StoryFrame }).previous_story,
  ).toEqual(changed);
  const revised = (requests[5].state as { candidates: { story: StoryFrame }[] })
    .candidates[0].story;
  expect(revised.choices.setting).not.toBe(first.choices.setting);
  expect({
    ...revised,
    choices: { ...revised.choices, setting: changed.choices.setting },
  }).toEqual(changed);
  malformedRanking = true;
  await page
    .getByLabel("Message Jev")
    .fill("Write a new fictional scene; surprise me.");
  await page.getByLabel("Message Jev").press("Enter");
  await expect(page.locator(".jc-alert")).toContainText(
    "Invalid fiction assessment",
  );
  await expect(page.locator(".jc-assistant")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Retry selection" }),
  ).toBeVisible();
  expect(requests).toHaveLength(8);
});
test("story edits preserve the scene through saved history and update detail controls", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/run", (r) => {
    calls++;
    return r.fulfill({ json: {} });
  });
  await page.goto("/jev-chat");
  await page.getByRole("button", { name: "Story studio", exact: true }).click();
  await page
    .getByLabel("Message Jev")
    .fill("Write a short story about a lighthouse");
  await page.getByLabel("Message Jev").press("Enter");
  const latest = () => page.locator(".jc-assistant").last();
  await expect(latest()).toContainText("Fictional composition");
  const frames = () =>
    page.evaluate(() => {
      const chats = JSON.parse(localStorage.getItem("jev-chat-sessions-v1")!);
      return chats.flatMap(
        (chat: { messages: { engineResult?: { story?: unknown } }[] }) =>
          chat.messages.flatMap((m) =>
            m.engineResult?.story ? [m.engineResult.story] : [],
          ),
      );
    });
  await expect.poll(async () => (await frames()).length).toBe(1);
  const first = (await frames())[0] as { choices: unknown; theme: string };
  await page
    .getByRole("button", { name: "Make it more suspenseful", exact: true })
    .click();
  await page.getByLabel("Message Jev").press("Enter");
  await expect(page.locator(".jc-assistant")).toHaveCount(2);
  await expect.poll(async () => (await frames()).length).toBe(2);
  await page.reload();
  await expect(page.locator(".jc-assistant")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Give it an open ending", exact: true })
    .click();
  await page.getByLabel("Message Jev").press("Enter");
  await expect(page.locator(".jc-assistant")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Make it shorter", exact: true })
    .click();
  await page.getByLabel("Message Jev").press("Enter");
  await expect(page.locator(".jc-assistant")).toHaveCount(4);
  await expect(page.getByLabel("Response detail")).toHaveValue("concise");
  await expect.poll(async () => (await frames()).length).toBe(4);
  const last = (await frames()).at(-1) as {
    choices: unknown;
    theme: string;
    tone: string;
    ending: string;
    style: string;
  };
  expect(last.choices).toEqual(first.choices);
  expect(last.theme).toEqual(first.theme);
  expect(last.tone).toBe("suspenseful");
  expect(last.ending).toBe("open");
  expect(last.style).toBe("concise");
  await latest()
    .getByText("How this response was composed", { exact: true })
    .click();
  await expect(latest().locator("dl")).toContainText("suspenseful");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    await page.setViewportSize({ width: 320, height: 568 });
    await latest().locator("dl").scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`story-continuity-${theme}.png`),
      fullPage: true,
    });
  }
  expect(calls).toBe(0);
});
test("live note answers use valid choices and can retain every selected passage", async ({
  page,
}) => {
  const paragraphs = Array.from(
    { length: 7 },
    (_, i) =>
      `Warranty condition ${i + 1} is recorded in this synthetic source.`,
  );
  let calls = 0;
  await page.route("**/api/run", async (route) => {
    let body;
    try {
      body = validatePayload(route.request().postDataJSON());
    } catch {
      return route.fulfill({
        status: 400,
        json: { error: "Invalid typed request." },
      });
    }
    calls++;
    const answers = Object.fromEntries(
      Object.entries(body.questions).map(([id, q]) => [
        id,
        q.type === "noul"
          ? {
              type: "noul",
              noul:
                id === "conflict"
                  ? 0
                  : id.startsWith("evidence_") &&
                      !id.startsWith("evidence_note_")
                    ? 0.1
                    : 0.95,
            }
          : {
              type: "choice",
              choice:
                id === "intent"
                  ? "answer"
                  : id === "plan"
                    ? "answer_all"
                    : "none",
              confidence: 0.95,
            },
      ]),
    );
    return route.fulfill({ json: { answers } });
  });
  await page.goto("/jev-chat");
  await page.getByLabel("Chat mode").selectOption("live");
  await page.getByRole("button", { name: "Your notes", exact: true }).click();
  await page.getByLabel("Source material").fill(paragraphs.join("\n\n"));
  await page.getByRole("button", { name: "Close guide panel" }).click();
  await page
    .getByLabel("Message Jev")
    .fill("Describe all warranty conditions.");
  await page.getByLabel("Message Jev").press("Enter");
  await expect(page.locator(".jc-assistant .jc-message-text")).toHaveText(
    paragraphs.join("\n\n"),
  );
  await expect(page.locator(".jc-assistant")).toContainText(
    "7 source passages",
  );
  expect(calls).toBe(2);
  await page
    .getByText("How this response was composed", { exact: true })
    .click();
  await page.getByRole("button", { name: "Verify content" }).click();
  await expect(
    page.getByText("Content integrity verified", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".jc-assistant .jc-message-text")).toHaveText(
    paragraphs.join("\n\n"),
  );
  expect(calls).toBe(2);
});
test("precise source excerpts retain full citations and survive saved history", async ({
  page,
}) => {
  const excerpt = "Atlas serves 30 teams.";
  const notes = `Atlas is a private pilot. ${excerpt} Its budget is undecided.`;
  const requests: RunPayload[] = [];
  await page.route("**/api/run", (route) => {
    const body = validatePayload(route.request().postDataJSON());
    requests.push(body);
    const proposals =
      (body.state as { source_excerpts?: { id: string; text: string }[] })
        .source_excerpts ?? [];
    const answers = Object.fromEntries(
      Object.entries(body.questions).map(([id, q]) => {
        if (q.type === "noul") {
          const proposal = proposals.find(
            (item) => `excerpt_${item.id}` === id,
          );
          return [
            id,
            {
              type: "noul",
              noul:
                id === "conflict"
                  ? 0.05
                  : id.startsWith("evidence_")
                    ? id === "evidence_note_1"
                      ? 0.95
                      : 0.05
                    : proposal
                      ? proposal.text === excerpt
                        ? 0.95
                        : 0.05
                      : 0.95,
            },
          ];
        }
        return [
          id,
          {
            type: "choice",
            choice:
              id === "intent"
                ? "answer"
                : id === "plan"
                  ? "answer_excerpts"
                  : "none",
            confidence: 0.95,
          },
        ];
      }),
    );
    return route.fulfill({ json: { answers } });
  });
  await page.goto("/jev-chat");
  await page.getByLabel("Chat mode").selectOption("live");
  await page.getByLabel("Response detail").selectOption("concise");
  await page.getByRole("button", { name: "Your notes", exact: true }).click();
  await page.getByLabel("Source material").fill(notes);
  await page.getByRole("button", { name: "Close guide panel" }).click();
  await page.getByLabel("Message Jev").fill("How many teams does Atlas serve?");
  await page.getByLabel("Message Jev").press("Enter");
  const response = page.locator(".jc-assistant");
  await expect(response.locator(".jc-message-text")).toHaveText(
    `Exact excerpts from your notes:\n\n${excerpt}`,
  );
  await expect(response).toContainText("Live Jev");
  await expect(response).toContainText("1 source passage");
  expect(requests).toHaveLength(2);
  await response.getByText("View supporting passages", { exact: true }).click();
  await expect(response.locator(".jc-source-details blockquote p")).toHaveText(
    notes,
  );
  await page.setViewportSize({ width: 320, height: 568 });
  await response.locator(".jc-source-details").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("exact-excerpt-mobile.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(response.locator(".jc-message-text")).toHaveText(
    `Exact excerpts from your notes:\n\n${excerpt}`,
  );
  await response.getByText("View supporting passages", { exact: true }).click();
  await expect(response.locator(".jc-source-details blockquote p")).toHaveText(
    notes,
  );
  await response
    .getByText("How this response was composed", { exact: true })
    .click();
  await page.getByRole("button", { name: "Verify content" }).click();
  await expect(
    page.getByText("Content integrity verified", { exact: true }),
  ).toBeVisible();
  expect(requests).toHaveLength(2);
});
test("source calculations show replayable proof and survive saved history", async ({
  page,
}) => {
  await page.goto("/jev-chat");
  await page.getByRole("button", { name: "Your notes", exact: true }).click();
  await page
    .getByLabel("Source material")
    .fill("Alpha costs 12 credits.\n\nBeta costs 18 credits.");
  await page.getByRole("button", { name: "Close guide panel" }).click();
  await page
    .getByLabel("Message Jev")
    .fill("What is the price difference between Alpha and Beta?");
  await page.getByLabel("Message Jev").press("Enter");
  await expect(page.locator(".jc-assistant .jc-message-text")).toContainText(
    "= 6 credits",
  );
  await page.getByText("Check the calculation", { exact: true }).click();
  await page
    .getByRole("button", { name: "Verify calculation", exact: true })
    .click();
  await expect(
    page.getByText("Arithmetic and source bindings verified", { exact: true }),
  ).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    await page.setViewportSize({ width: 320, height: 568 });
    await page.locator(".jc-calculation-details").scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`calculation-${theme}.png`),
      fullPage: true,
    });
  }
  await page.reload();
  await expect(page.locator(".jc-assistant .jc-message-text")).toContainText(
    "= 6 credits",
  );
  await page.getByText("Check the calculation", { exact: true }).click();
  await page
    .getByRole("button", { name: "Verify calculation", exact: true })
    .click();
  await expect(
    page.getByText("Arithmetic and source bindings verified", { exact: true }),
  ).toBeVisible();
});
test("composed capabilities, follow-up fiction, verified trace and saved history", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/run", (r) => {
    calls++;
    return r.fulfill({ json: {} });
  });
  await page.goto("/jev-chat");
  await expect(page.getByLabel("Response engine")).toHaveValue("compose");
  await page.getByLabel("Message Jev").fill("what can you do?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".jc-assistant .jc-message-text")).toContainText(
    "short fictional story",
  );
  await page.getByLabel("Message Jev").fill("The second one, please.");
  await page.getByLabel("Message Jev").press("Enter");
  await expect(page.locator(".jc-assistant").last()).toContainText(
    "Fictional composition",
  );
  await page
    .locator(".jc-assistant")
    .last()
    .getByText("How this response was composed", { exact: true })
    .click();
  await page.getByRole("button", { name: "Verify content" }).click();
  await expect(
    page.getByText("Content integrity verified", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Message Jev").fill("keep this draft");
  await page.reload();
  await expect(page.locator(".jc-assistant")).toHaveCount(2);
  await expect(page.getByLabel("Message Jev")).toHaveValue("keep this draft");
  await expect(page.locator(".jc-assistant").last()).toContainText(
    "Fictional composition",
  );
  expect(calls).toBe(0);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    for (const size of [
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(size);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const transcript = page.locator(".jc-scroll");
      // A visible composer alone can hide a completely collapsed conversation.
      // Reserve enough room to read several lines and reach earlier messages.
      await expect
        .poll(async () => (await transcript.boundingBox())?.height ?? 0)
        .toBeGreaterThanOrEqual(160);
      const lastReply = page.locator(".jc-assistant .jc-message-text").last();
      await lastReply.scrollIntoViewIfNeeded();
      const transcriptBox = (await transcript.boundingBox())!;
      const replyBox = (await lastReply.boundingBox())!;
      expect(
        Math.min(
          transcriptBox.y + transcriptBox.height,
          replyBox.y + replyBox.height,
        ) - Math.max(transcriptBox.y, replyBox.y),
      ).toBeGreaterThanOrEqual(60);
      const composer = page.getByLabel("Message Jev");
      await expect(composer).toBeInViewport({ ratio: 1 });
      const composerBox = (await composer.boundingBox())!;
      await transcript.hover();
      await page.mouse.wheel(0, -10000);
      await expect
        .poll(() => transcript.evaluate((element) => element.scrollTop))
        .toBe(0);
      expect((await composer.boundingBox())!.y).toBe(composerBox.y);
      await expect(
        page.locator(".jc-user .jc-message-text").first(),
      ).toBeInViewport();
      await lastReply.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: test.info().outputPath(`composed-${theme}-${size.width}.png`),
        fullPage: true,
      });
    }
  }
  // Tab reaches the final suggestion even when its row scrolls horizontally.
  await page.getByLabel("Message Jev").focus();
  await page.keyboard.press("Shift+Tab");
  const lastSuggestion = page.locator(".jc-followups button").last();
  await expect(lastSuggestion).toBeFocused();
  await expectFullyInScrollport(lastSuggestion);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Message Jev")).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Enter");
  await expect(page.getByLabel("Message Jev")).toHaveValue("keep this draft\n");
  await page.screenshot({
    path: test.info().outputPath("composed-mobile.png"),
    fullPage: true,
  });
});

test("live composition batches intent and validates whole responses in a second call", async ({
  page,
}) => {
  const requests: unknown[] = [];
  await page.route("**/api/run", (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const answers = Object.fromEntries(
      Object.entries(
        body.questions as Record<
          string,
          { type: string; criteria?: Record<string, string> }
        >,
      ).map(([id, q]) => [
        id,
        q.type === "noul"
          ? { type: "noul", noul: id === "conflict" ? 0 : 0.95 }
          : q.type === "score"
            ? {
                type: "score",
                score: 0.5,
                confidence: 0.3,
                probabilities: { "0": 0.5, "1": 0.5 },
              }
            : {
                type: "choice",
                choice:
                  id === "intent" ? "create" : Object.keys(q.criteria!)[0],
                confidence: 0.95,
              },
      ]),
    );
    return route.fulfill({
      json: {
        answers,
        _playgroundUsage: {
          inputTokens: 150,
          outputTokens: 15,
          attempted: true,
          status: 200,
        },
      },
    });
  });
  await page.goto("/jev-chat");
  await page.getByLabel("Chat mode").selectOption("live");
  await page.getByRole("button", { name: "Story studio", exact: true }).click();
  await page
    .getByLabel("Message Jev")
    .fill("Write a story about a lighthouse.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".jc-assistant")).toContainText("lighthouse");
  await expect(page.locator(".jc-assistant")).toContainText("Live Jev");
  expect(requests).toHaveLength(2);
  await page
    .getByText("How this response was composed", { exact: true })
    .click();
  await expect(page.locator(".jc-decision")).toContainText("300 in / 30 out");
  await page.screenshot({
    path: test.info().outputPath("live-composition.png"),
    fullPage: true,
  });
});

test("a failed second stage leaves no assistant response and retry remains explicit", async ({
  page,
}) => {
  let count = 0;
  await page.route("**/api/run", (route) => {
    count++;
    if (count === 2)
      return route.fulfill({
        status: 503,
        json: { error: "Response assessment unavailable." },
      });
    const body = route.request().postDataJSON();
    return route.fulfill({
      json: {
        answers: Object.fromEntries(
          Object.entries(
            body.questions as Record<
              string,
              { type: string; criteria?: Record<string, string> }
            >,
          ).map(([id, q]) => [
            id,
            q.type === "noul"
              ? {
                  type: "noul",
                  noul:
                    id === "story_supported" || id.startsWith("story_allows_")
                      ? 0.95
                      : 0,
                }
              : {
                  type: "choice",
                  choice:
                    id === "intent" ? "create" : Object.keys(q.criteria!)[0],
                  confidence: 0.95,
                },
          ]),
        ),
      },
    });
  });
  await page.goto("/jev-chat");
  await page.getByLabel("Chat mode").selectOption("live");
  await page.getByLabel("Message Jev").fill("Write a short story.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".jc-alert")).toContainText(
    "Response assessment unavailable",
  );
  expect(count).toBe(2);
  await expect(page.locator(".jc-assistant")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Retry selection" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 568 });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    // Nonzero live usage must not push the key/theme controls out of view.
    for (const action of await page
      .locator(
        ".workspace-topbar .header-actions > button, .workspace-topbar .header-actions > a",
      )
      .all()) {
      await expect(action).toBeInViewport({ ratio: 1 });
    }
    await expect(page.locator(".jc-alert")).toBeInViewport({ ratio: 1 });
    await expect(
      page.getByRole("button", { name: "Retry selection" }),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      page.getByRole("button", { name: "Edit message" }),
    ).toBeInViewport({ ratio: 1 });
    await page.locator(".jc-user .jc-message-text").scrollIntoViewIfNeeded();
    await expectFullyInScrollport(page.locator(".jc-user .jc-message-text"));
    await page.screenshot({
      path: test.info().outputPath(`failed-${theme}-320.png`),
      fullPage: true,
    });
  }
});
