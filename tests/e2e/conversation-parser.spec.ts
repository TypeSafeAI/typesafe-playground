import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const transcript = readFileSync(
  join(process.cwd(), "tests/fixtures/discord-stage-transcript.txt"),
  "utf8",
);

test("Discord stage notices are disclosed and do not prevent recipient selection", async ({
  page,
}) => {
  const targets: string[] = [];
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { configured: false } }),
  );
  await page.route("**/api/run", (route) => {
    const messages = route.request().postDataJSON().state.messages;
    expect(messages).toHaveLength(messages.at(-1).speaker === "Mira" ? 4 : 3);
    expect(JSON.stringify(messages)).not.toContain("is now a speaker");
    expect(JSON.stringify(messages)).not.toContain("Rowan");
    const speaker = messages.at(-1).speaker;
    targets.push(speaker);
    return route.fulfill({
      json: {
        answers: {
          should_respond: {
            type: "noul",
            noul: speaker === "Aster [LAB]" ? 0.96 : 0.1,
          },
          frame: { type: "choice", choice: "question" },
        },
      },
    });
  });
  await page.goto("/conversation");
  await page.getByLabel("Raw conversation").fill(transcript);
  await expect(page.getByRole("status")).toContainText(
    "Ignored 2 Discord stage notices.",
  );
  await page.getByText("Parsed messages", { exact: false }).click();
  await expect(page.locator(".parsed-message")).toHaveCount(4);
  await expect(page.locator(".parsed-message").nth(1)).toContainText(
    "Choose an allowed action.",
  );
  await expect(page.locator(".parsed-message").nth(1)).not.toContainText(
    "Rowan",
  );
  await page.getByRole("button", { name: "Pick a recipient" }).click();
  await expect(page.locator(".winner-card")).toContainText("Aster [LAB]");
  await expect(page.locator(".winner-card .message-preview")).toHaveText(
    "PCA: finds patterns in sample data.\n\nWill that preserve line breaks?",
  );
  expect(targets.sort()).toEqual(["Aster [LAB]", "Mira"]);
  await expect(page.getByLabel("Raw conversation")).toHaveValue(transcript);
  await page.screenshot({
    path: test.info().outputPath("discord-stage-selection.png"),
    fullPage: true,
  });
  await page.goto("/gate");
  await page.locator("#gate-transcript").fill(transcript);
  await expect(page.getByRole("status")).toContainText(
    "Ignored 2 Discord stage notices.",
  );
  expect(targets).toHaveLength(2);
});
