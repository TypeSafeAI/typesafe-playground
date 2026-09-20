import { z } from "zod";
import { buildGraph, verifyGraph } from "./graph";
import type { EngineResult } from "./types";
import { buildContext } from "./knowledge";
import { verifyCalculation } from "./quantities";
import { CALCULATION_PREFIX, calculationSections } from "./reasoning";
import { isStoryPlanId, readStoryFrame, renderStory } from "./story";
import { personalityIds } from "./personality";
const finite = z.number().finite().nonnegative();
const text = z.string().max(24000);
const provenance = z.enum(["authored", "source", "hypothetical"]);
const section = z.object({
  text,
  provenance,
  source: z.string().max(300).optional(),
  excerpt: z
    .strictObject({
      start: z.number().int().min(0).max(24000),
      end: z.number().int().min(1).max(24000),
    })
    .refine((span) => span.end > span.start)
    .optional(),
});
const resultSchema = z.object({
  version: z.literal("jev-engine-v1"),
  text,
  intent: z.enum([
    "capabilities",
    "greet",
    "acknowledge",
    "explain",
    "answer",
    "compare",
    "summarize",
    "support",
    "create",
    "clarify",
    "unsupported",
  ]),
  status: z.enum(["answered", "clarify", "unsupported"]),
  provenance: z.enum(["demo", "live"]),
  signal: z.object({
    probability: z.number().min(0).max(1).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
  }),
  sections: z.array(section).min(1).max(40),
  sources: z
    .array(
      z.object({
        id: z.string().max(80),
        title: z.string().max(200),
        text,
        provenance: z.enum(["authored", "source"]),
        source: z.string().max(300),
        terms: z.array(z.string().max(100)).max(50),
      }),
    )
    .max(40),
  options: z.array(z.string().max(2000)).max(6),
  graph: z.object({
    version: z.literal("jev-graph-v1"),
    root: z.string().regex(/^[a-f0-9]{64}$/),
    nodes: z.record(z.string(), z.unknown()),
  }),
  calculation: z.unknown().optional(),
  story: z.unknown().optional(),
  trace: z.object({
    engine: z.string().max(80),
    personality: z.enum(personalityIds).optional(),
    contextHash: z.string().regex(/^[a-f0-9]{64}$/),
    selectedPlan: z.string().max(80),
    candidates: z
      .array(
        z.object({ id: z.string().max(80), title: z.string().max(200), text }),
      )
      .max(8),
    calls: z.number().int().min(0).max(2),
    inputTokens: finite.nullable(),
    outputTokens: finite.nullable(),
    elapsedMs: finite,
    reason: z.string().max(1000),
    integrity: z.literal("verified"),
    semanticVerification: z.enum([
      "model-assessed",
      "scripted-demo",
      "scripted-help",
      "not-assessed",
    ]),
  }),
});
/** Shape validation is separate from asynchronous hash verification. Saved traces are not signatures. */
export function parseSavedResult(value: unknown): EngineResult | null {
  const parsed = resultSchema.safeParse(value);
  if (!parsed.success) return null;
  if (parsed.data.story !== undefined) {
    const story = readStoryFrame(parsed.data.story);
    if (!story) return null;
    parsed.data.story = story;
  }
  return parsed.data as EngineResult;
}
export async function verifySavedResult(
  result: EngineResult,
  notes: string,
): Promise<boolean> {
  try {
    const verified = await verifyGraph(result.graph);
    if (!verified.valid || verified.text !== result.text) return false;
    const rebuilt = await buildGraph(result.sections, "\n\n");
    if (rebuilt.root !== result.graph.root) return false;
    if (
      result.story === undefined &&
      result.trace.selectedPlan.startsWith("story_")
    )
      return false;
    if (result.story !== undefined) {
      const story = readStoryFrame(result.story);
      const selected = result.trace.candidates.filter(
        (candidate) => candidate.id === result.trace.selectedPlan,
      );
      if (
        !story ||
        result.intent !== "create" ||
        result.status !== "answered" ||
        result.sources.length ||
        result.calculation !== undefined ||
        !isStoryPlanId(result.trace.selectedPlan, story.variant) ||
        selected.length !== 1 ||
        selected[0].text !== result.text
      )
        return false;
      if (
        (await buildGraph(renderStory(story), "\n\n")).root !==
        result.graph.root
      )
        return false;
    }
    const paragraphs = notes
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const source of result.sources) {
      const index = Number(/^note_(\d+)$/.exec(source.id)?.[1]) - 1;
      if (
        source.provenance !== "source" ||
        !Number.isInteger(index) ||
        paragraphs[index] !== source.text ||
        source.source !== `Your notes · paragraph ${index + 1}`
      )
        return false;
    }
    for (const s of result.sections)
      if (
        s.provenance === "source" &&
        !result.sources.some(
          (e) =>
            e.source === s.source &&
            (s.excerpt
              ? s.excerpt.end <= e.text.length &&
                e.text.slice(s.excerpt.start, s.excerpt.end) === s.text
              : e.text === s.text),
        )
      )
        return false;
    if (
      result.calculation === undefined &&
      (result.trace.selectedPlan.startsWith("calculate_") ||
        result.sections.some(
          (s) =>
            s.provenance === "authored" &&
            s.text.startsWith(CALCULATION_PREFIX),
        ))
    )
      return false;
    if (result.calculation !== undefined) {
      const context = buildContext({
        notes,
        messages: [{ role: "user", text: "Verify saved figures" }],
        topic: "notes",
        mode: "demo",
        style: "balanced",
      });
      if (!(await verifyCalculation(result.calculation, context.evidence)))
        return false;
      if (
        result.status !== "answered" ||
        !["answer", "compare", "explain"].includes(result.intent)
      )
        return false;
      const ids = new Set(
        result.calculation.operands.map(({ fact }) => fact.sourceId),
      );
      const expectedSources = context.evidence.filter((e) => ids.has(e.id));
      if (
        ids.size !== result.sources.length ||
        result.sources.some((s, index) => expectedSources[index]?.id !== s.id)
      )
        return false;
      const rendered = await buildGraph(
        calculationSections(result.calculation, expectedSources),
        "\n\n",
      );
      if (rendered.root !== result.graph.root) return false;
    }
    return true;
  } catch {
    return false;
  }
}
