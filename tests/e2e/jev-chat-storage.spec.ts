import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { respond } from "../../lib/jev-chat/engine";
import { CHAT_STORAGE, MAX_CHAT_STORAGE, newChat } from "../../lib/jevChat";

test("oversized valid history survives reload, editing and cancelled replacement, and exports original bytes", async ({
  page,
}) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { configured: false } }),
  );
  await page.route("**/api/run", (route) =>
    route.fulfill({
      status: 500,
      json: { error: "Unexpected provider request" },
    }),
  );
  const notes =
    "The synthetic archive holds a catalogue. " +
    "Entries remain available. ".repeat(430);
  const result = await respond({
    messages: [{ role: "user", text: "Summarize my notes." }],
    notes,
    mode: "demo",
    style: "balanced",
    topic: "notes",
  });
  const chats = Array.from({ length: 5 }, () => ({
    ...newChat("notes"),
    notes,
    messages: Array.from({ length: 4 }, (_, i) => [
      { id: `u${i}`, role: "user", text: "Summarize my notes." },
      {
        id: `a${i}`,
        role: "assistant",
        text: result.text,
        engineResult: result,
      },
    ]).flat(),
  }));
  const original = JSON.stringify(chats);
  expect(original.length).toBeGreaterThan(MAX_CHAT_STORAGE);
  await page.goto("/jev-chat");
  await expect(page.getByLabel("Message Jev")).toBeVisible();
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: CHAT_STORAGE,
    raw: original,
  });
  await page.reload();
  await expect(page.getByRole("status")).toContainText(
    "original data is preserved",
  );
  await page.getByLabel("Message Jev").fill("Unsaved recovery draft");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), CHAT_STORAGE),
  ).toBe(original);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export stored history" }).click();
  const download = await downloadEvent;
  expect(await readFile((await download.path())!, "utf8")).toBe(original);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Replace stored history" }).click();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), CHAT_STORAGE),
  ).toBe(original);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Replace stored history" }).click();
  await expect(
    page.getByRole("button", { name: "Export stored history" }),
  ).toHaveCount(0);
  const stored = JSON.parse(
    (await page.evaluate((key) => localStorage.getItem(key), CHAT_STORAGE))!,
  );
  expect(stored[0].draft).toBe("Unsaved recovery draft");
});
