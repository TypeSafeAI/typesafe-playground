import {
  calculate,
  type CalculationProof,
  type QuantityOperation,
} from "./quantities";
import type { Analysis, Context, Plan, Section } from "./types";

export const calculationOperations = {
  none: "No numerical calculation is requested. Use ordinary evidence or conversation handling.",
  sum: "Add exactly two quantities with the same attribute and compatible units.",
  difference:
    "Compute the absolute difference between exactly two quantities with the same attribute and compatible units.",
  minimum:
    "Find the smaller of exactly two compatible quantities; this does not establish an overall winner.",
  maximum:
    "Find the larger of exactly two compatible quantities; this does not establish an overall winner.",
  ratio:
    "Divide the first requested quantity by the second requested quantity, preserving the requested order.",
  clarify:
    "Calculation requested but unsupported, ambiguous, qualified, or requiring more than two operands. Ask for clarification.",
};
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(costs?|prices?|fees?)\b/g, "price")
    .replace(/\b(takes?|times?|durations?)\b/g, "duration")
    .replace(/\bweights?\b/g, "mass");

/** Explicit local grammar only. In particular, ordered ratios need live selection. */
export function demoCalculation(context: Context): Analysis["calculation"] {
  const q = normalize(context.question);
  const candidates = (
    [
      ["sum", /\b(sum|total|combined|add)\b/.test(q)],
      [
        "difference",
        /\bdifference\b/.test(q) &&
          /\b(price|budget|duration|length|width|height|mass|storage|count|credits?)\b|how much/.test(
            q,
          ),
      ],
      ["minimum", /\b(minimum|smaller|lowest)\b/.test(q)],
      ["maximum", /\b(maximum|larger|highest)\b/.test(q)],
      ["ratio", /\bratio\b/.test(q)],
    ] as [QuantityOperation, boolean][]
  )
    .filter(([, matched]) => matched)
    .map(([operation]) => operation);
  if (candidates.length > 1) return { operation: "clarify", operands: [] };
  const operation = candidates[0];
  if (!operation) return null;
  const scope = q.replace(
    /\btwo (?=figures\b|quantities\b|amounts\b|price\b)/g,
    "",
  );
  // A count appearing in source text cannot authorize multiplying purchases.
  if (
    /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|hundred|thousand|million|billion|twice|double|triple|each|every|\d+)\b/.test(
      scope,
    )
  )
    return { operation: "clarify", operands: [] };
  const { facts, overflow } = context.quantities;
  const grammar = new Set(
    "what is are the a an of and between for in my your notes these figures quantities amounts how much please calculate compute find give me sum total combined add difference minimum smaller lowest maximum larger highest both".split(
      " ",
    ),
  );
  const available = new Set(
    normalize(facts.map((f) => f.context).join(" ")).match(/[\p{L}\p{N}]+/gu) ??
      [],
  );
  const requested = (scope.match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (word) => !grammar.has(word),
  );
  const perFact = facts.map(
    (f) => new Set(normalize(f.context).match(/[\p{L}\p{N}]+/gu) ?? []),
  );
  const named = perFact.map((words, i) =>
    requested.some(
      (word) =>
        words.has(word) &&
        !perFact.some((other, j) => j !== i && other.has(word)),
    ),
  );
  if (
    overflow ||
    facts.length !== 2 ||
    facts[0].sourceId === facts[1].sourceId ||
    normalize(facts[0].context).trim() === normalize(facts[1].context).trim() ||
    operation === "ratio" ||
    !requested.every((word) => available.has(word)) ||
    (named.some(Boolean) && !named.every(Boolean))
  )
    return { operation: "clarify", operands: [] };
  return { operation, operands: facts.map((f) => f.id) };
}

export const CALCULATION_PREFIX = "Calculated from figures in your notes:";
export function calculationSections(
  proof: CalculationProof,
  sources: Plan["sources"],
): Section[] {
  return [
    {
      text: `${CALCULATION_PREFIX}\n${proof.equation}`,
      provenance: "authored",
    },
    ...sources.map((source): Section => ({
      text: source.text,
      provenance: "source",
      source: source.source,
    })),
  ];
}

export async function calculationPlan(
  context: Context,
  analysis: Analysis,
): Promise<Plan | null> {
  const selection = analysis.calculation;
  if (!selection || !["answer", "compare", "explain"].includes(analysis.intent))
    return null;
  const clarify: Plan = {
    id: "clarify_calculation",
    intent: "clarify",
    title: "Clarify the calculation",
    status: "clarify",
    sections: [
      {
        text: "I need two unambiguous figures with compatible units and the same attribute for this calculation. Name the figures and operation, and include their exact values in Your notes. Qualified values, unsupported formats, and uncertain selections need clarification.",
        provenance: "authored",
      },
    ],
    sources: [],
    options: [],
  };
  if (
    selection.operation === "clarify" ||
    context.quantities.overflow ||
    selection.operands.length !== 2
  )
    return clarify;
  const operands = selection.operands.map((id) =>
    context.quantities.facts.find((f) => f.id === id),
  );
  if (
    operands.some(
      (f) =>
        !f ||
        (context.input.mode === "live" &&
          !analysis.relevant.includes(f.sourceId)),
    )
  )
    return clarify;
  const proof = await calculate(
    selection.operation,
    operands as NonNullable<(typeof operands)[number]>[],
    context.evidence,
  );
  if (!proof) return clarify;
  const ids = new Set(proof.operands.map(({ fact }) => fact.sourceId));
  const sources = context.evidence.filter((e) => ids.has(e.id));
  return {
    id: `calculate_${selection.operation}`,
    intent: analysis.intent,
    title: "Source-backed calculation",
    status: "answered",
    sections: calculationSections(proof, sources),
    sources,
    options: [],
    calculation: proof,
  };
}
