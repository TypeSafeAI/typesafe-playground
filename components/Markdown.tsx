"use client";
import { useEffect, useMemo, useRef } from "react";
import { BlockRenderer } from "@create-markdown/react";
import { safeMarkdownBlocks } from "../lib/markdown";

/**
 * Renders markdown that the app received rather than authored — documentation
 * excerpts, pasted transcripts, text read out of an image.
 *
 * `BlockRenderer` builds React elements from parsed blocks, so no HTML string
 * is ever injected. The remaining risk is URLs, which `safeMarkdownBlocks`
 * handles before anything reaches an element.
 */
export function Markdown({
  text,
  base,
  className = "markdown-body",
}: {
  text: string;
  /** The document this markdown came from, so its relative links resolve. */
  base?: string;
  className?: string;
}) {
  const blocks = useMemo(() => safeMarkdownBlocks(text, base), [text, base]);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The renderer emits a bare <a>. Sending a reader to another origin in
    // this tab would drop whatever they were part-way through composing, so
    // external links open in a new tab and do not leak the referrer.
    for (const a of host.current?.querySelectorAll("a[href]") ?? []) {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noreferrer noopener");
    }
  }, [blocks]);
  if (!blocks.length) return null;
  return (
    <div ref={host} className={className}>
      <BlockRenderer blocks={blocks} />
    </div>
  );
}
