import { blocksToMarkdown, parse } from "@create-markdown/core";
import type { Block, TextSpan } from "@create-markdown/core";

/**
 * Markdown that reaches the UI is untrusted: documentation fetched from the
 * docs origin, transcripts pasted by whoever is using the workspace, text read
 * out of an image. The renderer assigns link and image URLs straight to `href`
 * and `src` without inspecting the scheme, so scrubbing has to happen here,
 * before any of it becomes an element.
 *
 * Two jobs:
 *
 *  - Drop any URL whose scheme is not http(s). A `javascript:` or `data:` href
 *    in a fetched document would otherwise become a live link in the app. The
 *    link text is kept, so nothing silently disappears from the evidence — it
 *    just stops being clickable.
 *  - Resolve relative URLs against the document they came from. Docs pages are
 *    full of links like `/api/handling-rate-limits`, and left relative those
 *    resolve against the playground's own origin and point at routes that do
 *    not exist here.
 */

function safeUrl(raw: unknown, base?: string): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const value = raw.trim();
  try {
    // A base makes relative URLs resolvable; without one they cannot be
    // trusted to point anywhere meaningful, so they are dropped.
    const url = base ? new URL(value, base) : new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function scrubSpans(spans: TextSpan[] | undefined, base?: string) {
  for (const span of spans ?? []) {
    const link = span.styles?.link;
    if (!link) continue;
    const href = safeUrl(link.url, base);
    if (href) link.url = href;
    else delete span.styles!.link;
  }
}

function scrub(blocks: Block[], base?: string) {
  for (const block of blocks) {
    scrubSpans(block.content, base);
    if (block.type === "image") {
      const props = block.props as { url?: string } | undefined;
      const src = safeUrl(props?.url, base);
      // An image that cannot be shown safely stops being an image rather than
      // rendering a broken element pointed at an untrusted URL.
      if (src && props) props.url = src;
      else (block as { type: string }).type = "paragraph";
    }
    if (block.children?.length) scrub(block.children, base);
  }
  return blocks;
}

/**
 * Parse markdown into renderable blocks with every URL checked. `base` should
 * be the document the markdown came from, so its relative links resolve.
 */
export function safeMarkdownBlocks(markdown: string, base?: string) {
  if (!markdown.trim()) return [];
  return scrub(parse(markdown), base);
}

/**
 * Markdown with the same URL guarantees, serialized back to markdown rather
 * than rendered. The suggested reply is pasted into a chat client that does its
 * own rendering, so what it needs is clean source: unsafe links gone and
 * relative ones made absolute, because `/api/rate-limits` means nothing once it
 * leaves this page.
 */
export function normalizedMarkdown(markdown: string, base?: string): string {
  const blocks = safeMarkdownBlocks(markdown, base);
  return blocks.length ? blocksToMarkdown(blocks).trim() : "";
}
