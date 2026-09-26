/**
 * Route map for every section and workspace. Plain data with no React or icon
 * imports, so `next.config.ts` can build its redirects from the same source the
 * navigation and home page use.
 *
 * Workspace slugs are stable ids: browser drafts, usage entries and social
 * metadata key off them. Moving a workspace to another section changes only its
 * URL, and the redirect for its old flat route follows automatically.
 */
export const SECTION_WORKSPACES = {
  language: [
    "examples",
    "jev-chat",
    "conversation",
    "extraction",
    "youtube-extract",
    "reranker",
    "memes",
  ],
  agents: [
    "gate",
    "workflow",
    "tool-router",
    "langchain",
    "clean-room",
    "jev-browser-agent",
  ],
  governance: ["pr-review", "proposal-review", "ast-governance", "smt-solver"],
  simulations: ["doom", "microduck", "chess"],
  arcade: ["snake", "breakout", "meteor-dodge"],
} as const;

export type SectionId = keyof typeof SECTION_WORKSPACES;
export type WorkspaceSlug = (typeof SECTION_WORKSPACES)[SectionId][number];

export const SECTION_IDS = Object.keys(SECTION_WORKSPACES) as SectionId[];

export function sectionPath(section: SectionId): `/${SectionId}` {
  return `/${section}`;
}

export function sectionOf(slug: WorkspaceSlug): SectionId {
  for (const section of SECTION_IDS)
    if ((SECTION_WORKSPACES[section] as readonly string[]).includes(slug))
      return section;
  throw Error(`Unknown workspace: ${slug}`);
}

export function workspacePath(slug: WorkspaceSlug): string {
  return `/${sectionOf(slug)}/${slug}`;
}

/**
 * Workspaces that were served at a flat top-level route before sections had
 * their own pages. Arcade games never had one, so they get no redirect.
 */
export const LEGACY_FLAT_WORKSPACES = SECTION_IDS.filter(
  (section) => section !== "arcade",
).flatMap((section) => [...SECTION_WORKSPACES[section]]) as WorkspaceSlug[];

/**
 * Old flat workspaces with pages below them. Only these get a sub-path rule:
 * a catch-all on every slug would also capture public assets that share a
 * name, such as `/memes/meta-meme.png`, because redirects run before files.
 */
export const LEGACY_SUBPAGES: readonly WorkspaceSlug[] = ["jev-browser-agent"];

/** Old flat URLs move permanently to their section. Query strings carry over. */
export function legacyRedirects() {
  return LEGACY_FLAT_WORKSPACES.flatMap((slug) => [
    {
      source: `/${slug}`,
      destination: workspacePath(slug),
      permanent: true,
    },
    ...(LEGACY_SUBPAGES.includes(slug)
      ? [
          {
            source: `/${slug}/:path+`,
            destination: `${workspacePath(slug)}/:path+`,
            permanent: true,
          },
        ]
      : []),
  ]);
}

/**
 * A stable workspace id for a URL path, whichever layout it uses. Usage
 * entries record this rather than the first path segment, which is now the
 * section name.
 */
export function workspaceIdFromPath(pathname: string): string {
  const [first, second] = pathname.split("/").filter(Boolean);
  if (!first) return "examples";
  if (first in SECTION_WORKSPACES) return second ?? first;
  return first;
}
