import type { Message } from "../web/conversation";
import type {
  ChatMessage,
  DocSnippet,
  EvidenceCandidate,
  TriageOutcome,
} from "../types/triage";
import { normalizedMarkdown } from "./markdown";
const stopwords = new Set(
  "a an and any are as at be been but by can could did do does for from get got had has have how i if in into is it its just like me my need not of on or our out so some that the their them then there these they this to too us use used using was we were what when where which who why will with would you your".split(
    " ",
  ),
);
export function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/_/g, " ")
      .match(/[a-z0-9]+/g) || []
  )
    .filter((token) => token.length > 2 && !stopwords.has(token))
    .map((token) =>
      /^(authenticat|authoriz|unauthoriz)|^bearer$/.test(token)
        ? "auth"
        : token.length > 4 && token.endsWith("s") && !token.endsWith("ss")
          ? token.slice(0, -1)
          : token,
    );
}
export function excerpt(text: string, max = 240): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}
/**
 * Documentation keeps its line structure. Collapsing whitespace the way a chat
 * line can be collapsed destroys the thing docs are mostly made of -- fenced
 * code, mermaid diagrams, lists -- and turns a citable passage into an
 * unreadable run-on. The characters are still the document's own; only the
 * bound is ours.
 *
 * Truncation cuts at a line boundary where one is close, because slicing
 * mid-line inside a code fence produces something that no longer parses, and
 * an unterminated fence is closed so a cut passage cannot swallow the rest of
 * the page when rendered.
 */
export function docExcerpt(text: string, max = 1200): string {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  let out = normalized;
  if (normalized.length > max) {
    const cut = normalized.slice(0, max - 1);
    const boundary = cut.lastIndexOf("\n");
    out = `${(boundary > max * 0.6 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
  }
  // An odd number of fences means the passage opened one it never closed.
  if ((out.match(/^```/gm) ?? []).length % 2 === 1) out += "\n```";
  return out;
}
/** Numbers the last `limit` transcript messages so evidence can be cited by id. */
export function toHistory(messages: Message[], limit = 40): ChatMessage[] {
  return messages
    .slice(Math.max(0, messages.length - Math.max(1, limit)))
    .map((message, index) => ({
      id: `M${index + 1}`,
      speaker: message.speaker?.trim() || "Unknown speaker",
      timestamp: message.timestamp?.trim() || "",
      content: message.content.replace(/\s+/g, " ").trim(),
    }))
    .filter((message) => message.content);
}
/** One snippet per documentation block, preserving markdown structure to audit. */
export function splitDocs(text: string): DocSnippet[] {
  const snippets: DocSnippet[] = [];
  let title = "Documentation";
  let inFence = false;
  let block: string[] = [];
  const flush = () => {
    const content = block.join("\n").trim();
    if (content)
      snippets.push({ id: `D${snippets.length + 1}`, title, content });
    block = [];
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (/^#{1,6}\s+/.test(trimmed) && !inFence) {
      flush();
      title = trimmed.replace(/^#{1,6}\s+/, "");
      continue;
    }
    if (!trimmed && !inFence) {
      flush();
      continue;
    }
    if (/^```/.test(trimmed)) inFence = !inFence;
    block.push(line.trimEnd());
  }
  flush();
  return snippets;
}
/**
 * Shortlists the messages and doc lines that share rare words with the question.
 * Jev makes the call; this only keeps the closed set of citable evidence small.
 */
export function rankEvidence(
  question: string,
  history: ChatMessage[],
  snippets: DocSnippet[],
  limit = 6,
): EvidenceCandidate[] {
  const pool = [
    ...history.map((message) => ({
      text: message.content,
      candidate: {
        id: message.id,
        kind: "message" as const,
        label: message.timestamp
          ? `${message.speaker} at ${message.timestamp}`
          : message.speaker,
        excerpt: excerpt(message.content),
        score: 0,
      },
    })),
    ...snippets.map((snippet) => ({
      text: `${snippet.title} ${snippet.content}`,
      candidate: {
        id: snippet.id,
        kind: "doc" as const,
        label: snippet.title,
        excerpt: docExcerpt(snippet.content),
        sourceUrl: snippet.sourceUrl,
        score: 0,
      },
    })),
  ];
  if (!pool.length) return [];
  const tokenSets = pool.map((entry) => new Set(tokenize(entry.text)));
  const frequency = new Map<string, number>();
  for (const tokens of tokenSets)
    for (const token of tokens)
      frequency.set(token, (frequency.get(token) || 0) + 1);
  const weight = (token: string) =>
    Math.log(1 + pool.length / (1 + (frequency.get(token) || 0)));
  const asked = [...new Set(tokenize(question))];
  const total = asked.reduce((sum, token) => sum + weight(token), 0);
  const ranked = pool
    .map((entry, index) => ({
      ...entry.candidate,
      score: total
        ? asked.reduce(
            (sum, token) =>
              sum + (tokenSets[index].has(token) ? weight(token) : 0),
            0,
          ) / total
        : 0,
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  // A question that shares no vocabulary still needs something to point at, or
  // Jev could only answer "none" and every outcome would look unsupported.
  const fallback = [
    ...pool.filter((entry) => entry.candidate.kind === "message").slice(-3),
    ...pool.filter((entry) => entry.candidate.kind === "doc").slice(0, 3),
  ].map((entry) => entry.candidate);
  return (ranked.length ? ranked : fallback).slice(0, limit);
}
export function findEvidence(
  candidates: EvidenceCandidate[],
  id: unknown,
): EvidenceCandidate | null {
  return typeof id === "string"
    ? (candidates.find((candidate) => candidate.id === id) ?? null)
    : null;
}
/** Canned reply text. Jev classifies; the wording here is a fixed template. */
/**
 * A reply someone pastes into the channel the question came from, so it is
 * written as markdown: chat clients render it, and the quoted evidence needs to
 * stay visibly separate from the words the sender is adding in their own voice.
 *
 * The excerpt is normalized rather than interpolated raw. Documentation is full
 * of relative links, and `/api/rate-limits` resolves against whatever client
 * opens the message -- which is never the docs site. Quoting it as a blockquote
 * also stops a multi-paragraph excerpt from running into the closing sentence,
 * which is what the single-line template used to produce.
 */
export function suggestReply(
  outcome: TriageOutcome,
  evidence: EvidenceCandidate | null,
): string {
  if (!evidence) return "";
  const excerpt = normalizedMarkdown(evidence.excerpt, evidence.sourceUrl);
  // Every line of the quote needs its own marker or only the first is quoted.
  const quoted = excerpt
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
  if (outcome === "already_answered")
    return [
      `This came up earlier — **${evidence.label}** covered it:`,
      "",
      quoted,
      "",
      "Give that a read and shout if it still doesn't fit.",
    ].join("\n");
  if (outcome === "answerable_by_docs")
    return [
      `The docs answer this under **${evidence.label}**:`,
      "",
      quoted,
      "",
      // Named for the page it opens, not "read the source documentation":
      // that phrase already labels the link on the evidence card, and two
      // links sharing one accessible name is ambiguous to anyone navigating by
      // link. The title is also the more useful thing to read in a chat.
      ...(evidence.sourceUrl
        ? [`Source: [${evidence.label}](${evidence.sourceUrl})`, ""]
        : []),
      "Shout if that leaves something out.",
    ].join("\n");
  return "";
}
