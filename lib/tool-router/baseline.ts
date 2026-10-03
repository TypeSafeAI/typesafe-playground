import type { BaselineResult, ToolSnippet } from "./types";

/**
 * Deterministic lexical ranker over `name` + `snippet` only, so it sees exactly
 * what the Jev question sees. BM25-lite: per-term idf times a saturating term
 * frequency. Ties break by name so the same input always yields the same order.
 */
const STOPWORDS = new Set(
  "a an the of to for in on at by with and or is are be this that it its my me our your please can could would should i we you from into as via about all any some new".split(
    " ",
  ),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

const K1 = 1.2;
const B = 0.75;

export function rankLexically(
  task: string,
  tools: ToolSnippet[],
): BaselineResult {
  const docs = tools.map((tool) => tokenize(`${tool.name} ${tool.snippet}`));
  const avgLength =
    docs.reduce((sum, d) => sum + d.length, 0) / Math.max(docs.length, 1);
  const df = new Map<string, number>();
  for (const doc of docs)
    for (const term of new Set(doc)) df.set(term, (df.get(term) ?? 0) + 1);
  const query = [...new Set(tokenize(task))];
  const scores: Record<string, number> = {};
  tools.forEach((tool, i) => {
    const doc = docs[i];
    let score = 0;
    for (const term of query) {
      const n = df.get(term);
      if (!n) continue;
      const tf = doc.filter((t) => t === term).length;
      if (!tf) continue;
      const idf = Math.log(1 + (tools.length - n + 0.5) / (n + 0.5));
      score +=
        (idf * tf * (K1 + 1)) /
        (tf + K1 * (1 - B + (B * doc.length) / avgLength));
    }
    scores[tool.name] = Number(score.toFixed(6));
  });
  const ranked = tools
    .map((t) => t.name)
    .filter((name) => scores[name] > 0)
    .sort((a, b) => scores[b] - scores[a] || a.localeCompare(b));
  return {
    top1: ranked[0] ?? null,
    top3: ranked.slice(0, 3),
    none: ranked.length === 0,
    scores,
  };
}
