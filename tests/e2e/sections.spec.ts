import { test, expect } from "@playwright/test";
import { SECTION_WORKSPACES, type SectionId } from "../../lib/routes";

const SECTIONS = [
  { href: "/language", heading: "Messy context." },
  { href: "/agents", heading: "One next step." },
  { href: "/governance", heading: "Typed judgments." },
  { href: "/simulations", heading: "Small decisions." },
  { href: "/arcade", heading: "Insert coin." },
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
    const workspaces = SECTION_WORKSPACES[section.href.slice(1) as SectionId];
    await expect(cards).toHaveCount(workspaces.length);
    expect(
      await cards.evaluateAll((els) =>
        els.map((el) => el.getAttribute("href")),
      ),
    ).toEqual(workspaces.map((slug) => `${section.href}/${slug}`));
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
