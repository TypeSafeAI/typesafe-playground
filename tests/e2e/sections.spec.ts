import { test, expect } from "@playwright/test";

const SECTIONS = [
  { href: "/language", heading: "Messy context.", cards: 7 },
  { href: "/agents", heading: "One next step.", cards: 6 },
  { href: "/governance", heading: "Typed judgments.", cards: 4 },
  { href: "/simulations", heading: "Small decisions.", cards: 3 },
  { href: "/arcade", heading: "Insert coin.", cards: 3 },
];

test.beforeEach(async ({ page }) => {
  await page.route("**/api/health", (r) =>
    r.fulfill({ json: { configured: false } }),
  );
  await page.route("**/api/run", (r) =>
    r.fulfill({ status: 500, json: { error: "Unexpected provider call." } }),
  );
});

for (const section of SECTIONS)
  test(`section page ${section.href} lists its workspaces`, async ({
    page,
  }) => {
    await page.goto(section.href);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: new RegExp(section.heading),
      }),
    ).toBeVisible();
    const cards = page.locator(".section-workspaces .home-example-card");
    await expect(cards).toHaveCount(section.cards);
    for (const href of await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute("href")),
    ))
      expect(href).toMatch(new RegExp(`^${section.href}/[a-z-]+$`));
    await expect(
      page
        .getByRole("navigation", { name: "Other sections" })
        .getByRole("link"),
    ).toHaveCount(SECTIONS.length - 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });

test("sidebar section labels and breadcrumbs link to section pages", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "sidebar is a drawer on mobile");
  await page.goto("/language/extraction");
  await expect(page.locator(".workspace-breadcrumb")).toContainText(
    "Language & data",
  );
  await page.locator(".workspace-breadcrumb .breadcrumb-section").click();
  await expect(page).toHaveURL(/\/language$/);
  const sectionLink = page
    .getByRole("navigation", { name: "Workspaces" })
    .getByRole("link", { name: "Arcade", exact: true });
  await sectionLink.click();
  await expect(page).toHaveURL(/\/arcade$/);
  await expect(sectionLink).toHaveAttribute("aria-current", "page");
  // The group keeps the section's plain name for assistive technology.
  await expect(
    page
      .getByRole("navigation", { name: "Workspaces" })
      .getByRole("group", { name: "Arcade", exact: true }),
  ).toBeVisible();
});

test("home section headings open their section page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Open the Arcade section" }).click();
  await expect(page).toHaveURL(/\/arcade$/);
});

test("old flat routes redirect to their section, keeping query strings", async ({
  page,
}) => {
  await page.goto("/jev-chat?utm=legacy");
  await expect(page).toHaveURL(/\/language\/jev-chat\?utm=legacy$/);
  await page.goto("/chess");
  await expect(page).toHaveURL(/\/simulations\/chess$/);
  await page.goto("/jev-browser-agent/native");
  await expect(page).toHaveURL(/\/agents\/jev-browser-agent\/native$/);
  await page.goto("/conversation.html");
  await expect(page).toHaveURL(/\/language\/conversation$/);
});

test("public assets sharing a workspace name are served, not redirected", async ({
  request,
}) => {
  const response = await request.get("/memes/meta-meme.png", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
});
