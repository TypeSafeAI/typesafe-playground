import type { Evidence } from "./types";
import { canonical, hashValue } from "./graph";

export type QuantityOperation =
  "sum" | "difference" | "minimum" | "maximum" | "ratio";
export type RationalValue = { numerator: string; denominator: string };
export type QuantityFact = {
  id: string;
  sourceId: string;
  source: string;
  sourceTitle: string;
  raw: string;
  span: { start: number; end: number };
  context: string;
  contextSpan: { start: number; end: number };
  value: RationalValue;
  unit: string;
  dimension: string;
  attribute: string;
};
export type QuantityResult = {
  value: RationalValue;
  unit: string;
  dimension: string;
  attribute: string;
  display: string;
};
export type CalculationProof = {
  version: "jev-calculation-v1";
  operation: QuantityOperation;
  operands: { fact: QuantityFact; sourceHash: string; hash: string }[];
  result: QuantityResult;
  equation: string;
  root: string;
};

const MAX_FACTS = 32;
const MAX_SOURCE_TEXT = 12_000;
const MAX_PROOF_BYTES = 512 * 1024;
const operations: readonly string[] = [
  "sum",
  "difference",
  "minimum",
  "maximum",
  "ratio",
];
type Fraction = { n: bigint; d: bigint };
type Unit = { unit: string; dimension: string; multiplier: Fraction };

function fraction(n: bigint, d = 1n): Fraction {
  if (d === 0n) throw new Error("Zero denominator.");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  if (n.toString().length > 256 || d.toString().length > 256)
    throw new Error("Arithmetic exceeds bounds.");
  let a = n < 0n ? -n : n;
  let b = d;
  while (b !== 0n) [a, b] = [b, a % b];
  return { n: n / a, d: d / a };
}

function add(a: Fraction, b: Fraction): Fraction {
  return fraction(a.n * b.d + b.n * a.d, a.d * b.d);
}

function value(a: Fraction): RationalValue {
  return { numerator: a.n.toString(), denominator: a.d.toString() };
}

function display(a: Fraction): string {
  let remaining = a.d;
  for (const factor of [2n, 5n])
    while (remaining % factor === 0n) remaining /= factor;
  if (remaining !== 1n) return `${a.n}/${a.d}`;
  const sign = a.n < 0n ? "-" : "";
  const positive = a.n < 0n ? -a.n : a.n;
  let result = sign + (positive / a.d).toString();
  let remainder = positive % a.d;
  if (remainder !== 0n) result += ".";
  while (remainder !== 0n) {
    remainder *= 10n;
    result += (remainder / a.d).toString();
    remainder %= a.d;
  }
  return result;
}

const units = new Map<string, Unit>();
function register(
  names: string[],
  unit: string,
  dimension: string,
  n = 1n,
  d = 1n,
) {
  for (const name of names)
    units.set(name, { unit, dimension, multiplier: fraction(n, d) });
}
register(["$", "USD"], "USD", "currency");
register(["€", "EUR"], "EUR", "currency");
register(["£", "GBP"], "GBP", "currency");
register(["credit", "credits"], "credits", "credits");
register(["s", "sec", "second", "seconds"], "seconds", "duration");
register(["min", "minute", "minutes"], "seconds", "duration", 60n);
register(["h", "hour", "hours"], "seconds", "duration", 3600n);
register(["mm", "millimeter", "millimeters"], "meters", "length", 1n, 1000n);
register(["cm", "centimeter", "centimeters"], "meters", "length", 1n, 100n);
register(["m", "meter", "meters"], "meters", "length");
register(["km", "kilometer", "kilometers"], "meters", "length", 1000n);
register(["mg", "milligram", "milligrams"], "grams", "mass", 1n, 1000n);
register(["g", "gram", "grams"], "grams", "mass");
register(["kg", "kilogram", "kilograms"], "grams", "mass", 1000n);
register(["B", "byte", "bytes"], "bytes", "storage");
for (const [index, prefix] of ["k", "M", "G", "T"].entries())
  register([`${prefix}B`], "bytes", "storage", 1000n ** BigInt(index + 1));
for (const [index, prefix] of ["K", "M", "G", "T"].entries())
  register([`${prefix}iB`], "bytes", "storage", 1024n ** BigInt(index + 1));
for (const noun of [
  "seat",
  "user",
  "item",
  "request",
  "token",
  "ticket",
  "apple",
  "widget",
  "unit",
  "file",
  "page",
  "record",
  "member",
  "order",
  "server",
  "task",
]) {
  register([noun, `${noun}s`], `${noun}s`, `count:${noun}s`);
}

const numericPattern = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
const suffixPattern = [...units.keys()]
  .filter((key) => /^[A-Za-z]+$/.test(key))
  .sort((a, b) => b.length - a.length)
  .join("|");
const quantityPattern = new RegExp(
  String.raw`(?:(\$|€|£|USD|EUR|GBP)\s*(${numericPattern})|(${numericPattern})\s+(${suffixPattern})\b)`,
  "g",
);

// Conservative lexical exclusions, not a semantic parser. A qualified passage
// contributes no facts, including when its condition is on a separate line.
const uncertain = new RegExp(
  [
    String.raw`\b(?:about|approx(?:imately)?|roughly|around|nearly|almost|over|under|above|below|at\s+(?:least|most)|up\s+to|more\s+than|less\s+than|minimum|maximum)\b`,
    String.raw`\b(?:not|never|no|(?:isn|aren|doesn|don|can|won|wasn|weren|hasn|haven|hadn)['’]t|cannot|without|excluding|except|minus|negative)\b`,
    String.raw`\b(?:if|unless|when|provided|assuming|subject\s+to|after|before|may|might|could|would|should|estimated|estimate|expected|typically|usually|between|from|per|each|either|or|twice|double|half|times)\b`,
    String.raw`[%~≈<>≤≥±?]|[-–—−]\s*(?:[$€£]|USD|EUR|GBP)?\s*\d|\d\s*[/]\s*\d|\d\s+to\s+\d`,
    String.raw`\b(?:in|on|during|since|until|as\s+of)\s+\d{4}\b|(?:^|\n)\s*\d{4}\s*[:—-]`,
    String.raw`[([]\s*\d{4}\s*[)\]]`,
    String.raw`\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b`,
    String.raw`\b(?:hundred|thousand|million|billion|trillion)s?\b`,
    String.raw`\d\s*[×*^+]\s*\d|\d[\t \u00a0\u202f]+\d`,
  ].join("|"),
  "i",
);
const attributeWords: Record<string, string> = {
  cost: "price",
  costs: "price",
  price: "price",
  prices: "price",
  priced: "price",
  fee: "price",
  fees: "price",
  charge: "price",
  charges: "price",
  budget: "budget",
  budgets: "budget",
  revenue: "revenue",
  balance: "balance",
  balances: "balance",
  salary: "salary",
  length: "length",
  distance: "distance",
  width: "width",
  height: "height",
  depth: "depth",
  duration: "duration",
  takes: "duration",
  took: "duration",
  time: "duration",
  latency: "latency",
  mass: "mass",
  weight: "mass",
  weighs: "mass",
  size: "size",
  capacity: "capacity",
  storage: "size",
};

function attribute(context: string, start: number, unit: Unit): string {
  // Only a supported predicate directly before this quantity can own it. Do not
  // search backwards across another subject, predicate, or a preceding amount.
  const predicate = context
    .slice(0, start)
    .toLowerCase()
    .match(/\b([a-z]+)(?:\s+(?:is|are|was|were|of))?\s*[:=]?\s*$/)?.[1];
  if (!predicate) return "unspecified";
  // An object noun alone cannot equate inventory, sales, returns, etc. The only
  // supported count predicate is possession; other count relations abstain.
  if (unit.dimension.startsWith("count:"))
    return /^(?:has|have)$/.test(predicate) ? unit.dimension : "unspecified";
  return Object.hasOwn(attributeWords, predicate)
    ? attributeWords[predicate]
    : "unspecified";
}

function clauses(text: string): { text: string; start: number; end: number }[] {
  const result = [];
  let start = 0;
  // Decimal periods stay inside a clause. Semicolons also stay inside so that a
  // trailing condition cannot become a new, apparently unconditional sentence.
  for (let index = 0; index <= text.length; index++) {
    const end = index === text.length;
    const punctuation =
      /[.!?\n]/.test(text[index] ?? "") &&
      !(
        text[index] === "." &&
        /\d/.test(text[index - 1] ?? "") &&
        /\d/.test(text[index + 1] ?? "")
      );
    if (!end && !punctuation) continue;
    const boundary = end ? index : index + 1;
    const raw = text.slice(start, boundary);
    const left = raw.length - raw.trimStart().length;
    const right = raw.trimEnd().length;
    if (right > left)
      result.push({
        text: raw.slice(left, right),
        start: start + left,
        end: start + right,
      });
    start = boundary;
  }
  return result;
}

/** Extract a deliberately narrow closed set of explicit, unqualified quantities.
 * Offsets refer to UTF-16 units in Evidence.text, not a rewritten source.
 * Overflow fails closed; authored guide propositions never become operands.
 */
export function extractQuantities(evidence: readonly Evidence[]): {
  facts: QuantityFact[];
  overflow: boolean;
} {
  try {
    // This public synchronous boundary has the same import bounds and accessor
    // protection as proof replay. Invalid input never exposes partial facts.
    return extractSourceQuantities(snapshot(evidence));
  } catch {
    return { facts: [], overflow: true };
  }
}

function extractSourceQuantities(evidence: readonly Evidence[]): {
  facts: QuantityFact[];
  overflow: boolean;
} {
  const facts: QuantityFact[] = [];
  const fail = { facts: [], overflow: true };
  if (!Array.isArray(evidence) || evidence.length > 128) return fail;
  if (
    evidence.some(
      (item) => !item || !["authored", "source"].includes(item.provenance),
    )
  )
    return fail;
  const sources = evidence.filter((item) => item?.provenance === "source");
  let textLength = 0;
  const sourceIds = new Set<string>();
  for (const item of sources) {
    if (
      typeof item.text !== "string" ||
      typeof item.id !== "string" ||
      !item.id ||
      typeof item.source !== "string" ||
      !item.source ||
      typeof item.title !== "string" ||
      item.id.length > 256 ||
      item.source.length > 256 ||
      item.title.length > 1000 ||
      sourceIds.has(item.id)
    )
      return fail;
    sourceIds.add(item.id);
    textLength += item.text.length;
    if (textLength > MAX_SOURCE_TEXT) return fail;
  }
  for (const item of sources) {
    if (uncertain.test(item.text)) continue;
    for (const clause of clauses(item.text)) {
      if (/\b\d[^\s]*\//.test(clause.text)) continue;
      for (const match of clause.text.matchAll(quantityPattern)) {
        const start = match.index;
        const end = start + match[0].length;
        const before = clause.text[start - 1] ?? "";
        const after = clause.text.slice(end);
        if (
          /[\p{L}\p{N}_.,+\-~≈<>=%/]/u.test(before) ||
          /^[\p{L}\p{N}_/²³]/u.test(after) ||
          /^\.\d/.test(after)
        )
          continue;
        // Every quantity must consume the complete representation. Inspect the
        // original passage, including across line breaks, so an unsupported
        // suffix/group separator cannot leave a smaller accepted prefix.
        if (
          !/^\s*(?:[.!?;](?=\s|$)|$)/.test(item.text.slice(clause.start + end))
        )
          continue;
        const numberText = (match[2] ?? match[3]).replaceAll(",", "");
        if (numberText.replace(".", "").length > 24) continue;
        const unit = units.get(match[1] ?? match[4]);
        if (!unit) continue;
        const [whole, decimal = ""] = numberText.split(".");
        const normalized = fraction(
          BigInt(whole + decimal) * unit.multiplier.n,
          10n ** BigInt(decimal.length) * unit.multiplier.d,
        );
        // Fractional discrete objects are outside this grammar's count contract.
        if (unit.dimension.startsWith("count:") && normalized.d !== 1n)
          continue;
        facts.push({
          id: `q${facts.length + 1}`,
          sourceId: item.id,
          source: item.source,
          sourceTitle: item.title,
          raw: match[0],
          span: { start: clause.start + start, end: clause.start + end },
          context: clause.text,
          contextSpan: { start: clause.start, end: clause.end },
          value: value(normalized),
          unit: unit.unit,
          dimension: unit.dimension,
          attribute: attribute(clause.text, start, unit),
        });
        if (facts.length > MAX_FACTS) return fail;
      }
    }
  }
  return { facts, overflow: false };
}

// Validate and detach before any await. Avoid JSON serializers, getters, cycles,
// sparse arrays, excessive nesting, and unbounded canonicalization of imports.
function snapshot<T>(input: T): T {
  const seen = new Set<object>();
  let budget = 0;
  let nodes = 0;
  function copy(item: unknown, depth: number): unknown {
    if (++nodes > 8192 || depth > 12) throw new Error("Input exceeds bounds.");
    if (typeof item === "string") {
      budget += item.length;
      if (budget > MAX_PROOF_BYTES) throw new Error("Input exceeds bounds.");
      return item;
    }
    if (
      item === null ||
      typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item))
    )
      return item;
    if (typeof item !== "object") throw new Error("Invalid JSON data.");
    const array = Array.isArray(item);
    const prototype = Object.getPrototypeOf(item);
    if (
      (array
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null) ||
      seen.has(item)
    )
      throw new Error("Invalid JSON object.");
    seen.add(item);
    const keys = Reflect.ownKeys(item);
    if (keys.length > 4096 || keys.some((key) => typeof key !== "string"))
      throw new Error("Invalid object keys.");
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (array && keys.length !== item.length + 1)
      throw new Error("Invalid array.");
    const result: Record<string, unknown> | unknown[] = array ? [] : {};
    for (const key of keys as string[]) {
      if (array && key === "length") continue;
      budget += key.length;
      if (budget > MAX_PROOF_BYTES) throw new Error("Input exceeds bounds.");
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value"))
        throw new Error("Invalid property.");
      Object.defineProperty(result, key, {
        value: copy(descriptor.value, depth + 1),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    seen.delete(item);
    return result;
  }
  const result = copy(input, 0) as T;
  if (new TextEncoder().encode(canonical(result)).length > MAX_PROOF_BYTES)
    throw new Error("Input exceeds bounds.");
  return result;
}

function sourceContent(item: Evidence) {
  return {
    id: item.id,
    title: item.title,
    text: item.text,
    source: item.source,
    provenance: item.provenance,
  };
}

/** Exact arithmetic under selected source assumptions, not source truth or a
 * proof that the selected facts are semantically relevant to a user question.
 * Difference is absolute and binary; ratio is ordered and dimensionless.
 */
export async function calculate(
  operation: QuantityOperation,
  operands: readonly QuantityFact[],
  evidence: readonly Evidence[],
): Promise<CalculationProof | null> {
  try {
    if (
      !operations.includes(operation) ||
      !Array.isArray(operands) ||
      operands.length < 2 ||
      operands.length > MAX_FACTS ||
      ((operation === "difference" || operation === "ratio") &&
        operands.length !== 2)
    )
      return null;
    const selected = snapshot(operands);
    const sources = snapshot(evidence);
    const extracted = extractQuantities(sources);
    if (
      extracted.overflow ||
      new Set(selected.map((fact) => fact.id)).size !== selected.length
    )
      return null;
    for (const fact of selected) {
      const original = extracted.facts.find(
        (candidate) => candidate.id === fact.id,
      );
      if (!original || canonical(original) !== canonical(fact)) return null;
    }
    const first = selected[0];
    if (
      first.attribute === "unspecified" ||
      selected.some(
        (fact) =>
          fact.dimension !== first.dimension ||
          fact.unit !== first.unit ||
          fact.attribute !== first.attribute,
      )
    )
      return null;
    const numbers = selected.map((fact) =>
      fraction(BigInt(fact.value.numerator), BigInt(fact.value.denominator)),
    );
    let computed: Fraction;
    if (operation === "sum") computed = numbers.reduce(add);
    else if (operation === "difference") {
      const difference = add(numbers[0], { n: -numbers[1].n, d: numbers[1].d });
      computed = {
        n: difference.n < 0n ? -difference.n : difference.n,
        d: difference.d,
      };
    } else if (operation === "ratio")
      computed = fraction(
        numbers[0].n * numbers[1].d,
        numbers[0].d * numbers[1].n,
      );
    else
      computed = numbers.reduce((a, b) =>
        (
          operation === "minimum"
            ? a.n * b.d <= b.n * a.d
            : a.n * b.d >= b.n * a.d
        )
          ? a
          : b,
      );
    const unit = operation === "ratio" ? "" : first.unit;
    const result: QuantityResult = {
      value: value(computed),
      unit,
      dimension: operation === "ratio" ? "dimensionless" : first.dimension,
      attribute:
        operation === "ratio" ? `ratio:${first.attribute}` : first.attribute,
      display: display(computed) + (unit ? ` ${unit}` : ""),
    };
    const parts = numbers.map(
      (number, index) => `${display(number)} ${selected[index].unit}`,
    );
    const expression =
      operation === "sum"
        ? parts.join(" + ")
        : operation === "difference"
          ? `|${parts.join(" − ")}|`
          : operation === "ratio"
            ? `(${parts[0]}) / (${parts[1]})`
            : `${operation === "minimum" ? "min" : "max"}(${parts.join(", ")})`;
    const equation = `${expression} = ${result.display}`;
    const nodes = await Promise.all(
      selected.map(async (fact) => {
        const sourceHash = await hashValue(
          sourceContent(
            sources.find(
              (item) =>
                item.id === fact.sourceId && item.provenance === "source",
            )!,
          ),
        );
        return {
          fact,
          sourceHash,
          hash: await hashValue({ kind: "quantity", fact, sourceHash }),
        };
      }),
    );
    const root = await hashValue({
      kind: "calculation",
      operation,
      children: nodes.map((node) => node.hash),
      result,
      equation,
    });
    return snapshot({
      version: "jev-calculation-v1",
      operation,
      operands: nodes,
      result,
      equation,
      root,
    });
  } catch {
    return null;
  }
}

/** Re-extract and recompute the complete proof, including every source binding.
 * Hashes attest internal integrity only; the notes can still be false.
 */
export async function verifyCalculation(
  proof: unknown,
  evidence: readonly Evidence[],
): Promise<boolean> {
  try {
    const candidate = snapshot(proof) as CalculationProof;
    if (
      !candidate ||
      candidate.version !== "jev-calculation-v1" ||
      !Array.isArray(candidate.operands) ||
      candidate.operands.length < 2 ||
      candidate.operands.length > MAX_FACTS
    )
      return false;
    const expected = await calculate(
      candidate.operation,
      candidate.operands.map((operand) => operand.fact),
      evidence,
    );
    return expected !== null && canonical(candidate) === canonical(expected);
  } catch {
    return false;
  }
}
