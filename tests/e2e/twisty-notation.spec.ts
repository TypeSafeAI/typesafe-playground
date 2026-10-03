import { test, expect } from "@playwright/test";

test("Megaminx labels match the full public face notation and stay readable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/simulations/twisty-puzzles");
  await page.getByRole("button", { name: "Megaminx", exact: true }).click();
  await expect(page.locator(".twisty-board")).toHaveAttribute(
    "data-status",
    "ready",
  );
  const labels = page.locator(".twisty-face-label");
  await expect(labels).toHaveCount(12);
  expect((await labels.allTextContents()).sort()).toEqual(
    ["U", "D", "F", "B", "L", "R", "FL", "FR", "BL", "BR", "DL", "DR"].sort(),
  );
  const positions = await labels.evaluateAll((elements) =>
    elements.map((element) => ({
      x: Number(element.getAttribute("x")),
      y: Number(element.getAttribute("y")),
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
    })),
  );
  expect(
    positions.every(
      (label) =>
        Number.isFinite(label.x) &&
        Number.isFinite(label.y) &&
        label.width > 0 &&
        label.height > 0,
    ),
  ).toBe(true);
  await page.getByLabel("Scramble from a solved puzzle").fill("FR2 DL2' BL R");
  await page
    .getByRole("button", { name: "Load scramble", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Solve puzzle", exact: true }),
  ).toBeEnabled();
  await page
    .getByText("Notation, instructions and solver limits", { exact: true })
    .click();
  await expect(page.locator(".twisty-help")).toContainText("FR is one face");
  await expect(page.locator(".twisty-help")).toContainText(
    "Rv turns it 72° clockwise",
  );
});
