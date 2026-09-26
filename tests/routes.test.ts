import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  LEGACY_FLAT_WORKSPACES,
  SECTION_IDS,
  SECTION_WORKSPACES,
  legacyRedirects,
  workspaceIdFromPath,
  workspacePath,
} from "../lib/routes";
import { groupForPath, playgroundGroups } from "../lib/playground";
import { workspaceGuides } from "../lib/workspace-guides";
import { workspaceDetails } from "../lib/workspace-details";
import { SOCIAL_PAGES } from "../lib/social";

test("every section and workspace in the catalog has a real page at its route", () => {
  assert.deepEqual(
    playgroundGroups.map((g) => g.id),
    SECTION_IDS,
  );
  for (const group of playgroundGroups) {
    assert.equal(group.href, `/${group.id}`);
    assert.ok(existsSync(`app${group.href}/page.tsx`), group.href);
    const slugs = group.examples.map((e) => e.href.split("/").pop());
    assert.deepEqual(slugs, [...SECTION_WORKSPACES[group.id]], group.id);
    for (const example of group.examples) {
      assert.match(example.href, new RegExp(`^/${group.id}/[a-z-]+$`));
      assert.ok(existsSync(`app${example.href}/page.tsx`), example.href);
    }
  }
});

test("no workspace page is left at its old flat route", () => {
  for (const slug of LEGACY_FLAT_WORKSPACES)
    assert.ok(!existsSync(`app/${slug}/page.tsx`), slug);
});

test("every old flat route redirects permanently to its section, sub-pages included", () => {
  const redirects = legacyRedirects();
  const exact = redirects.filter((r) => !r.source.includes(":"));
  assert.equal(exact.length, LEGACY_FLAT_WORKSPACES.length);
  assert.deepEqual(
    redirects.find((r) => r.source === "/jev-chat"),
    {
      source: "/jev-chat",
      destination: "/language/jev-chat",
      permanent: true,
    },
  );
  assert.deepEqual(
    redirects.find((r) => r.source === "/jev-browser-agent/:path+"),
    {
      source: "/jev-browser-agent/:path+",
      destination: "/agents/jev-browser-agent/:path+",
      permanent: true,
    },
  );
  // Arcade games never had flat routes, so they get no redirect.
  assert.ok(!redirects.some((r) => r.source.startsWith("/snake")));
  // A redirect must never land on another redirect's source.
  const sources = new Set(exact.map((r) => r.source));
  for (const r of redirects)
    assert.ok(!sources.has(r.destination), r.destination);
});

test("public assets that share a workspace name are never redirected", () => {
  const redirects = legacyRedirects();
  const matches = (source: string, path: string) =>
    source.endsWith("/:path+")
      ? path.startsWith(source.replace("/:path+", "/"))
      : path === source;
  for (const asset of ["/memes/meta-meme.png", "/brand/mark.jpg", "/og.png"])
    assert.ok(
      !redirects.some((r) => matches(r.source, asset)),
      `${asset} must be served, not redirected`,
    );
});

test("guides, details and social cards follow each workspace to its new path", () => {
  // No key may be left behind at an old path: each one must name a real page.
  for (const key of [
    ...Object.keys(workspaceGuides),
    ...Object.keys(workspaceDetails),
  ])
    assert.ok(
      key === "/" || existsSync(`app${key}/page.tsx`),
      `stale guide key ${key}`,
    );
  for (const page of Object.values(SOCIAL_PAGES)) {
    if (page.path === "/") continue;
    assert.ok(existsSync(`app${page.path}/page.tsx`), page.path);
  }
  for (const slug of SECTION_WORKSPACES.arcade) {
    assert.ok(workspaceGuides[`/arcade/${slug}`], `guide for ${slug}`);
    assert.ok(workspaceDetails[`/arcade/${slug}`], `details for ${slug}`);
  }
});

test("usage entries keep the stable workspace id, not the section name", () => {
  assert.equal(workspaceIdFromPath("/language/jev-chat"), "jev-chat");
  assert.equal(
    workspaceIdFromPath("/agents/jev-browser-agent/native"),
    "jev-browser-agent",
  );
  assert.equal(workspaceIdFromPath("/arcade/snake"), "snake");
  assert.equal(workspaceIdFromPath("/arcade"), "arcade");
  assert.equal(workspaceIdFromPath("/"), "examples");
  assert.equal(workspaceIdFromPath("/jev-chat"), "jev-chat");
});

test("section lookup matches section pages and the workspaces inside them only", () => {
  assert.equal(groupForPath("/arcade")?.id, "arcade");
  assert.equal(groupForPath("/arcade/snake")?.id, "arcade");
  assert.equal(groupForPath(workspacePath("smt-solver"))?.id, "governance");
  assert.equal(groupForPath("/arcadegames"), undefined);
  assert.equal(groupForPath("/"), undefined);
});
