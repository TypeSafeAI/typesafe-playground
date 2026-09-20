export type ExcerptSpan = { start: number; end: number };
export type SourceExcerpt = ExcerptSpan & {
  id: string;
  sourceId: string;
  text: string;
};

const invalidInput = () => Error("Invalid source excerpt input");
const whitespace = /\s/u;
const closing = new Set(['"', "'", "”", "’", ")", "]", "}"]);
const opening = new Set(['"', "'", "“", "‘", "(", "[", "{"]);
const abbreviations = new Set([
  "dr.",
  "mr.",
  "mrs.",
  "ms.",
  "prof.",
  "e.g.",
  "i.e.",
  "etc.",
  "a.m.",
  "p.m.",
  "u.s.",
  "jr.",
  "sr.",
  "st.",
  "mt.",
  "vs.",
  "no.",
  "inc.",
  "ltd.",
  "co.",
  "dept.",
  "approx.",
]);

/** Validate every source before scanning, including sources beyond the cap.
 * Only own data descriptors are read; inputs are never coerced or normalized.
 */
function snapshot(value: unknown): { id: string; text: string }[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    throw invalidInput();
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (
    typeof length !== "number" ||
    !Number.isInteger(length) ||
    length < 0 ||
    length > 40 ||
    Reflect.ownKeys(value).length !== length + 1
  )
    throw invalidInput();
  const sources: { id: string; text: string }[] = [];
  const ids = new Set<string>();
  let total = 0;
  for (let index = 0; index < length; index++) {
    const entry = Object.getOwnPropertyDescriptor(value, String(index));
    if (!entry?.enumerable || !Object.hasOwn(entry, "value"))
      throw invalidInput();
    const source: unknown = entry.value;
    if (!source || typeof source !== "object" || Array.isArray(source))
      throw invalidInput();
    const prototype = Object.getPrototypeOf(source);
    if (prototype !== Object.prototype && prototype !== null)
      throw invalidInput();
    const keys = Reflect.ownKeys(source);
    if (keys.length !== 2 || keys.some((key) => key !== "id" && key !== "text"))
      throw invalidInput();
    const descriptors = Object.getOwnPropertyDescriptors(source);
    for (const key of ["id", "text"] as const)
      if (
        !descriptors[key]?.enumerable ||
        !Object.hasOwn(descriptors[key], "value")
      )
        throw invalidInput();
    const id: unknown = descriptors.id.value;
    const text: unknown = descriptors.text.value;
    if (
      typeof id !== "string" ||
      id.length > 7 ||
      id.trim() !== id ||
      !/^note_([1-9]|[1-3][0-9]|40)$/.test(id) ||
      ids.has(id) ||
      typeof text !== "string" ||
      text.length === 0 ||
      text.length > 12_000
    )
      throw invalidInput();
    total += text.length;
    if (total > 12_000 || text.trim() !== text) throw invalidInput();
    ids.add(id);
    sources.push({ id, text });
  }
  return sources;
}

/** Deliberately keep known abbreviations, single initials, and dotted acronyms
 * joined even when a period might also end a sentence. This is not general NLP.
 */
function abbreviation(text: string, period: number): boolean {
  let start = period;
  while (start > 0 && /[A-Za-z.]/.test(text[start - 1])) start--;
  const token = text.slice(start, period + 1);
  return (
    abbreviations.has(token.toLowerCase()) ||
    /^[A-Z]\.$/.test(token) ||
    /^(?:[A-Za-z]\.){2,}$/.test(token)
  );
}

function trimSpan(text: string, start: number, end: number): ExcerptSpan {
  while (start < end && whitespace.test(text[start])) start++;
  while (end > start && whitespace.test(text[end - 1])) end--;
  return { start, end };
}

function sentences(text: string): ExcerptSpan[] {
  const spans: ExcerptSpan[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const terminal = text[index];
    if (terminal !== "." && terminal !== "!" && terminal !== "?") continue;
    // Ellipses are ambiguous; decimal interiors and dotted tokens have no
    // following whitespace and therefore cannot pass the boundary check.
    if (
      terminal === "." &&
      (text[index - 1] === "." || text[index + 1] === ".")
    )
      continue;
    let end = index + 1;
    while (end < text.length && (text[end] === "!" || text[end] === "?")) end++;
    while (end < text.length && closing.has(text[end])) end++;
    const terminalIndex = index;
    // Consume a punctuation run once even when it has no accepted boundary.
    // Otherwise a long final run of question marks would scan quadratically.
    index = end - 1;
    if (end === text.length || !whitespace.test(text[end])) continue;
    let next = end;
    while (next < text.length && whitespace.test(text[next])) next++;
    if (
      next === text.length ||
      (!/[A-Z0-9]/.test(text[next]) && !opening.has(text[next]))
    )
      continue;
    if (terminal === "." && abbreviation(text, terminalIndex)) continue;
    spans.push(trimSpan(text, start, end));
    start = next;
    index = next - 1;
  }
  spans.push(trimSpan(text, start, text.length));
  return spans;
}

/** Propose source-relative English sentence slices, preserving original UTF-16
 * text and offsets. Single-span paragraphs add no duplicate whole-source entry.
 * The first 32 proposals retain source order; omitted only reports more valid
 * proposals, never invalid or discarded originals. No relevance is inferred.
 */
export function sourceExcerpts(
  sources: readonly { id: string; text: string }[],
): { excerpts: SourceExcerpt[]; omitted: boolean } {
  try {
    const documents = snapshot(sources);
    const excerpts: SourceExcerpt[] = [];
    let omitted = false;
    for (const source of documents) {
      const spans = sentences(source.text);
      if (spans.length < 2) continue;
      for (const { start, end } of spans) {
        if (excerpts.length === 32) {
          omitted = true;
          continue;
        }
        excerpts.push({
          id: `${source.id}_excerpt_${start}_${end}`,
          sourceId: source.id,
          start,
          end,
          text: source.text.slice(start, end),
        });
      }
    }
    return { excerpts, omitted };
  } catch {
    throw invalidInput();
  }
}
