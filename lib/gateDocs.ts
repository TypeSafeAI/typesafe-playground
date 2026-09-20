import { rankEvidence, tokenize } from "./matchEvidence";
import type { DocSnippet } from "../types/triage";
export const FULL_DOCS_URL = "https://docs.typesafe.ai/llms-full.txt";
export const DOCS_INDEX_URL = "https://docs.typesafe.ai/llms.txt";
export interface DocsLookup {
  sourceUrl: string;
  fetchedAt: string;
  mode: "full" | "linked_pages";
  pages: number;
  snippets: DocSnippet[];
}
type Fetcher = typeof fetch;
function trustedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.origin === "https://docs.typesafe.ai" &&
      !url.username &&
      !url.password &&
      !url.search
      ? url.href
      : null;
  } catch {
    return null;
  }
}
/** Parse paragraphs under their original page and heading; never execute MDX. */
export function parseDocumentation(
  text: string,
  pageUrl?: string,
): DocSnippet[] {
  const snippets: DocSnippet[] = [];
  let source = pageUrl ? trustedUrl(pageUrl) : null;
  let title = "TypeSafe documentation";
  let paragraph: string[] = [];
  const flush = () => {
    const content = paragraph.join("\n").trim();
    if (source && content)
      snippets.push({
        id: `O${snippets.length + 1}`,
        title,
        content,
        sourceUrl: source.replace(/\.md$/, ""),
      });
    paragraph = [];
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const origin = line.match(/^Source:\s*(\S+)/);
    if (origin) {
      flush();
      source = trustedUrl(origin[1]);
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      flush();
      title = line.replace(/^#+\s*/, "");
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (paragraph.join("\n").length + line.length > 1200) flush();
    // Bound long generated reference lines as well as normal paragraphs.
    for (let start = 0; start < line.length; start += 1200) {
      paragraph.push(line.slice(start, start + 1200));
      if (line.length > 1200) flush();
    }
  }
  flush();
  return snippets;
}
async function readText(url: string, fetcher: Fetcher): Promise<string> {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(8000),
    redirect: "error",
    headers: { Accept: "text/plain, text/markdown" },
  });
  if (!response.ok || !response.body)
    throw Error("Documentation source unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0,
    text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 2_000_000)
        throw Error("Documentation source exceeds the size limit.");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel();
  }
}
let cached:
  | {
      expires: number;
      value: Promise<{ snippets: DocSnippet[]; fetchedAt: string }>;
    }
  | undefined;
async function fullFeed(fetcher: Fetcher) {
  // Only the public corpus is cached. Questions and API keys never enter this cache.
  if (fetcher === fetch && cached && cached.expires > Date.now())
    return cached.value;
  const value = readText(FULL_DOCS_URL, fetcher).then((text) => {
    const snippets = parseDocumentation(text);
    if (!snippets.length)
      throw Error("Documentation source contained no citable passages.");
    return { snippets, fetchedAt: new Date().toISOString() };
  });
  if (fetcher === fetch) {
    const entry = { expires: Date.now() + 600_000, value };
    cached = entry;
    value.catch(() => {
      if (cached === entry) cached = undefined;
    });
  }
  return value;
}
export async function lookupDocumentation(
  questions: string[],
  fetcher: Fetcher = fetch,
): Promise<DocsLookup> {
  let corpus: DocSnippet[],
    fetchedAt: string,
    mode: DocsLookup["mode"] = "full";
  try {
    ({ snippets: corpus, fetchedAt } = await fullFeed(fetcher));
  } catch {
    mode = "linked_pages";
    const index = await readText(DOCS_INDEX_URL, fetcher);
    const asked = new Set(tokenize(questions.join(" ")));
    const links = [
      ...index.matchAll(/\[([^\]]+)\]\((https:\/\/[^)]+)\)([^\n]*)/g),
    ]
      .map((match) => ({
        url: trustedUrl(match[2]),
        score: tokenize(match[1] + " " + match[3]).filter((token) =>
          asked.has(token),
        ).length,
      }))
      .filter((item) => item.url && item.score > 0)
      .sort((a, b) => b.score - a.score);
    const urls = [...new Set(links.map((item) => item.url!))].slice(0, 6);
    corpus = [];
    for (let i = 0; i < urls.length; i += 3) {
      const results = await Promise.allSettled(
        urls
          .slice(i, i + 3)
          .map(async (url) =>
            parseDocumentation(await readText(url, fetcher), url),
          ),
      );
      for (const result of results)
        if (result.status === "fulfilled") corpus.push(...result.value);
    }
    if (!corpus.length)
      throw Error(
        "Official documentation could not be checked. Retry before routing this question.",
      );
    fetchedAt = new Date().toISOString();
  }
  corpus = corpus.map((snippet, index) => ({
    ...snippet,
    id: `O${index + 1}`,
  }));
  const ids = new Set(
    questions.flatMap((question) =>
      rankEvidence(question, [], corpus, 8)
        .filter((candidate) => candidate.score > 0)
        .map((candidate) => candidate.id),
    ),
  );
  return {
    mode,
    fetchedAt,
    sourceUrl: mode === "full" ? FULL_DOCS_URL : DOCS_INDEX_URL,
    pages: new Set(corpus.map((doc) => doc.sourceUrl)).size,
    snippets: corpus.filter((doc) => ids.has(doc.id)),
  };
}
