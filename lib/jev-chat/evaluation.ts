import { z } from "zod";
import { chatCandidates, demoDecision, type ChatSpace } from "../jevChat";
import { respond } from "./engine";
import { hashValue, verifyGraph, type ResponseGraph } from "./graph";
import type { EngineInput, Intent } from "./types";
import { readStoryFrame, renderStory } from "./story";
import type { StoryFrame } from "./story";

export const MAX_EVALUATION_BYTES = 2 * 1024 * 1024;
const intentSchema = z.enum([
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
]);
const boundedText = z.string().trim().min(1).max(500);
const expectationsSchema = z
  .strictObject({
    expectedIntent: intentSchema.optional(),
    allowedIntents: z.array(intentSchema).min(1).max(11).optional(),
    requiredSubstrings: z.array(boundedText).max(20).default([]),
    forbiddenSubstrings: z.array(boundedText).max(20).default([]),
    requiredSources: z
      .array(z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/))
      .max(40)
      .default([]),
    mustClarify: z.boolean().optional(),
  })
  .refine((value) => !(value.expectedIntent && value.allowedIntents), {
    message: "Use expectedIntent or allowedIntents, not both.",
  })
  .refine(
    (value) =>
      Boolean(
        value.expectedIntent ||
        value.allowedIntents ||
        value.requiredSubstrings.length ||
        value.forbiddenSubstrings.length ||
        value.requiredSources.length ||
        value.mustClarify !== undefined,
      ),
    {
      message: "Declare at least one independent expectation.",
    },
  );
const inputSchema = z
  .strictObject({
    topic: z.enum(["guide", "notes", "support", "creative"]),
    notes: z.string().max(12000),
    style: z.enum(["concise", "balanced", "detailed"]).default("balanced"),
    seed: z.number().int().min(0).max(0xffffffff).optional(),
    messages: z
      .array(
        z
          .strictObject({
            role: z.enum(["user", "assistant"]),
            text: z.string().min(1).max(24000),
            options: z.array(z.string().min(1).max(2000)).max(10).optional(),
            story: z
              .custom<StoryFrame>((value) => readStoryFrame(value) !== null)
              .transform((value) => readStoryFrame(value)!)
              .optional(),
          })
          .refine(
            (message) => message.role !== "user" || message.text.length <= 2000,
            {
              message: "User messages must contain at most 2,000 characters.",
            },
          )
          .refine(
            (message) =>
              message.story === undefined ||
              (message.role === "assistant" &&
                renderStory(message.story)
                  .map((section) => section.text)
                  .join("\n\n") === message.text),
            {
              message:
                "A story frame must reproduce its assistant message exactly.",
            },
          ),
      )
      .min(1)
      .max(40),
  })
  .refine(
    (input) =>
      input.messages.at(-1)?.role === "user" &&
      Boolean(input.messages.at(-1)?.text.trim()),
    {
      message: "End the conversation with a nonempty user question.",
    },
  )
  .refine((input) => JSON.stringify(input.messages).length <= 50000, {
    message: "Conversation exceeds 50,000 characters.",
  })
  .refine(
    (input) =>
      input.notes.split(/\n\s*\n/).filter((p) => p.trim()).length <= 40,
    {
      message: "Use at most 40 note paragraphs.",
    },
  );
const fixtureSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
  category: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  input: inputSchema,
  expectations: expectationsSchema,
  evidenceNotes: z.string().trim().min(1).max(2000),
});
const documentSchema = z.strictObject({
  version: z.literal("jev-chat-evaluation-v1"),
  cases: z.array(fixtureSchema).min(1).max(100),
});

export type EvaluationFixture = z.input<typeof fixtureSchema>;
export type EvaluationFixtures = z.output<typeof documentSchema>;
export type EvaluationArtifact = {
  engine: "baseline" | "composition";
  outcome: "completed" | "failed";
  text: string | null;
  intent: Intent | null;
  responseStatus: "answered" | "clarify" | "unsupported" | null;
  selected: string | null;
  provenance: "demo" | "live" | null;
  sources: { id: string; text: string; source: string }[];
  graph: ResponseGraph | null;
  elapsedMs: number | null;
  calls: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  error?: string;
};
export type MechanicalAssertion = {
  id: string;
  passed: boolean;
  detail: string;
};
export type EvaluatedArtifact = {
  artifact: EvaluationArtifact;
  mechanical: { passed: boolean; assertions: MechanicalAssertion[] };
  graphIntegrity: {
    status: "verified" | "failed" | "not-applicable" | "not-available";
    error?: string;
  };
  quality: {
    semantic: "unmeasured";
    creative: "unmeasured";
    humanReview: "absent";
  };
};

/** Validates data only. Fixtures cannot choose live mode, transports, or credentials. */
export function parseEvaluationFixtures(value: unknown): EvaluationFixtures {
  let size: number;
  try {
    size = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    throw Error("Invalid evaluation fixtures: expected JSON data.");
  }
  if (size > MAX_EVALUATION_BYTES)
    throw Error("Invalid evaluation fixtures: maximum file size is 2 MiB.");
  const result = documentSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw Error(
      `Invalid evaluation fixtures at ${issue.path.join(".") || "root"}: ${issue.message}`,
    );
  }
  const ids = new Set<string>();
  for (const fixture of result.data.cases) {
    if (ids.has(fixture.id))
      throw Error(`Invalid evaluation fixtures: duplicate id ${fixture.id}.`);
    ids.add(fixture.id);
  }
  return result.data;
}

/** Mechanical checks are deliberately separate from human semantic judgments. */
export async function evaluateArtifact(
  fixture: EvaluationFixture,
  artifact: EvaluationArtifact,
  execution: "demo" | "live" = "demo",
): Promise<EvaluatedArtifact> {
  const assertions: MechanicalAssertion[] = [];
  const check = (id: string, passed: boolean, detail: string) => {
    assertions.push({ id, passed, detail });
  };
  check(
    "completed",
    artifact.outcome === "completed",
    "Execution completed without an exception.",
  );
  check(
    "nonempty-response",
    typeof artifact.text === "string" && artifact.text.trim().length > 0,
    "Response contains visible text.",
  );
  check(
    execution === "demo" ? "offline-demo" : "live-execution",
    execution === "demo"
      ? artifact.provenance === "demo" && artifact.calls === 0
      : artifact.provenance === "live" &&
          artifact.calls !== null &&
          artifact.calls >= 0,
    execution === "demo"
      ? "Artifact declares demo execution with zero provider calls."
      : "Artifact declares live-mode execution, which can use a zero-request scripted help route; actual requests and transport provenance are recorded by the benchmark.",
  );
  const expected = fixture.expectations;
  const allowed = expected.expectedIntent
    ? [expected.expectedIntent]
    : expected.allowedIntents;
  if (allowed)
    check(
      "intent",
      artifact.intent !== null && allowed.includes(artifact.intent),
      `Expected ${allowed.join(" or ")}; observed ${artifact.intent ?? "unknown"}.`,
    );
  const text = (artifact.text ?? "").toLowerCase();
  for (const [index, phrase] of (expected.requiredSubstrings ?? []).entries())
    check(
      `required-substring:${index}`,
      text.includes(phrase.toLowerCase()),
      `Response must contain ${JSON.stringify(phrase)} (case-insensitive).`,
    );
  for (const [index, phrase] of (expected.forbiddenSubstrings ?? []).entries())
    check(
      `forbidden-substring:${index}`,
      !text.includes(phrase.toLowerCase()),
      `Response must omit ${JSON.stringify(phrase)} (case-insensitive).`,
    );
  for (const id of expected.requiredSources ?? [])
    check(
      `required-source:${id}`,
      artifact.sources.some((source) => source.id === id),
      `Response must retain source ${id}.`,
    );
  const passages = fixture.input.notes
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  check(
    "exact-note-sources",
    artifact.sources.every((source) => {
      const note = /^note_(\d+)$/.exec(source.id);
      return !note || source.text === passages[Number(note[1]) - 1];
    }),
    "Referenced note text must exactly match its input paragraph; this does not verify the paragraph's truth.",
  );
  if (expected.mustClarify !== undefined)
    check(
      "must-clarify",
      (artifact.responseStatus === "clarify") === expected.mustClarify,
      `Clarification required: ${expected.mustClarify}; observed status: ${artifact.responseStatus ?? "unknown"}.`,
    );

  let graphIntegrity: EvaluatedArtifact["graphIntegrity"];
  if (artifact.engine === "baseline") {
    graphIntegrity = { status: "not-applicable" };
  } else if (!artifact.graph) {
    graphIntegrity = { status: "not-available" };
    check(
      "graph-integrity",
      false,
      "Composition response has no graph to verify.",
    );
  } else {
    const verified = await verifyGraph(artifact.graph);
    const matches = verified.valid && verified.text === artifact.text;
    const error =
      verified.error ??
      (!matches
        ? "Verified graph text differs from the recorded response text."
        : undefined);
    graphIntegrity = {
      status: matches ? "verified" : "failed",
      ...(error ? { error } : {}),
    };
    check(
      "graph-integrity",
      matches,
      error ??
        "Hashes, graph structure, and response text agree. This checks integrity, not truth.",
    );
  }
  return {
    artifact,
    mechanical: {
      passed: assertions.every((entry) => entry.passed),
      assertions,
    },
    graphIntegrity,
    quality: {
      semantic: "unmeasured",
      creative: "unmeasured",
      humanReview: "absent",
    },
  };
}

export function summarizeMeasurements(values: (number | null)[]) {
  const known = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value >= 0,
  );
  const unknownCount = values.length - known.length;
  const knownSubtotal = known.length
    ? known.reduce((total, value) => total + value, 0)
    : null;
  return {
    knownCount: known.length,
    unknownCount,
    knownSubtotal,
    total: unknownCount ? null : knownSubtotal,
  };
}

// These labels describe the baseline's authored candidate catalog. The baseline
// itself neither predicts semantic intents nor consumes conversation history.
function baselineIntent(id: string, space: ChatSpace): Intent {
  if (id === "hello") return "greet";
  if (id === "thanks") return "acknowledge";
  if (id === "unknown") return "clarify";
  if (id.startsWith("note_")) return "answer";
  return space === "support" ? "support" : "explain";
}

async function runArtifact(
  fixture: EvaluationFixture,
  engine: EvaluationArtifact["engine"],
): Promise<EvaluationArtifact> {
  const started = performance.now();
  try {
    if (engine === "baseline") {
      const space =
        fixture.input.topic === "creative" ? "guide" : fixture.input.topic;
      const result = demoDecision(
        fixture.input.messages.at(-1)!.text,
        chatCandidates(space, fixture.input.notes),
      );
      return {
        engine,
        outcome: "completed",
        text: result.text,
        intent: baselineIntent(result.id, space),
        responseStatus: result.uncertain ? "clarify" : "answered",
        selected: result.id,
        provenance: result.provenance,
        sources: result.source
          ? [{ id: result.id, text: result.text, source: result.source }]
          : [],
        graph: null,
        elapsedMs: performance.now() - started,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    }
    const input: EngineInput = {
      ...fixture.input,
      style: fixture.input.style ?? "balanced",
      mode: "demo",
    };
    // No transport is provided. respond cannot make a live provider request.
    const result = await respond(input);
    return {
      engine,
      outcome: "completed",
      text: result.text,
      intent: result.intent,
      responseStatus: result.status,
      selected: result.trace.selectedPlan,
      provenance: result.provenance,
      sources: result.sources.map(({ id, text, source }) => ({
        id,
        text,
        source,
      })),
      graph: result.graph,
      elapsedMs: performance.now() - started,
      calls: result.trace.calls,
      inputTokens: result.trace.inputTokens,
      outputTokens: result.trace.outputTokens,
    };
  } catch (error) {
    return {
      engine,
      outcome: "failed",
      text: null,
      intent: null,
      responseStatus: null,
      selected: null,
      provenance: null,
      sources: [],
      graph: null,
      elapsedMs: performance.now() - started,
      calls: null,
      inputTokens: null,
      outputTokens: null,
      error:
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Offline execution failed.",
    };
  }
}

function summarize(results: EvaluatedArtifact[]) {
  const checks = results.flatMap((result) => result.mechanical.assertions);
  return {
    completedCases: results.filter((r) => r.artifact.outcome === "completed")
      .length,
    failedCases: results.filter((r) => r.artifact.outcome === "failed").length,
    mechanicalPassedCases: results.filter((r) => r.mechanical.passed).length,
    mechanicalFailedCases: results.filter((r) => !r.mechanical.passed).length,
    passedAssertions: checks.filter((check) => check.passed).length,
    failedAssertions: checks.filter((check) => !check.passed).length,
    elapsedMs: summarizeMeasurements(results.map((r) => r.artifact.elapsedMs)),
    calls: summarizeMeasurements(results.map((r) => r.artifact.calls)),
    inputTokens: summarizeMeasurements(
      results.map((r) => r.artifact.inputTokens),
    ),
    outputTokens: summarizeMeasurements(
      results.map((r) => r.artifact.outputTokens),
    ),
  };
}

/** Offline diagnostics only; deliberately no live mode or injectable transport. */
export async function runOfflineEvaluation(value: unknown) {
  const fixtures = parseEvaluationFixtures(value);
  const cases: {
    fixture: EvaluationFixtures["cases"][number];
    baseline: EvaluatedArtifact;
    composition: EvaluatedArtifact;
  }[] = [];
  for (const fixture of fixtures.cases) {
    const baseline = await evaluateArtifact(
      fixture,
      await runArtifact(fixture, "baseline"),
    );
    const composition = await evaluateArtifact(
      fixture,
      await runArtifact(fixture, "composition"),
    );
    cases.push({ fixture, baseline, composition });
  }
  return {
    version: "jev-chat-evaluation-report-v1" as const,
    mode: "offline-demo" as const,
    generatedAt: new Date().toISOString(),
    fixtureHash: await hashValue(fixtures),
    caseCount: cases.length,
    baselineMapping:
      "Original demoDecision and chatCandidates; creative maps to guide. Only the last user message is evaluated. Intent labels are catalog annotations, not baseline predictions.",
    limitations: [
      "Both systems use deterministic scripted demo behavior. No live Jev or other model is evaluated.",
      "Mechanical checks do not establish semantic correctness, creativity, source truth, or superiority.",
      "Fixtures are synthetic, authored regression cases. They are not a sealed held-out benchmark or independently reviewed answer key.",
      "Different response contracts and candidate material limit direct comparisons. Execution timings include local work only and are not model latency measurements.",
      "Human semantic review, current leading-model outputs under matched conditions, and authorized live Jev evaluation are absent.",
    ],
    modelComparison: "unmeasured" as const,
    liveJevQuality: "unmeasured" as const,
    latestLlmParity: "unproven" as const,
    quality: {
      semantic: "unmeasured" as const,
      creative: "unmeasured" as const,
      humanReviewedCases: 0,
      unreviewedCases: cases.length,
    },
    summary: {
      baseline: summarize(cases.map((entry) => entry.baseline)),
      composition: summarize(cases.map((entry) => entry.composition)),
    },
    cases,
  };
}
