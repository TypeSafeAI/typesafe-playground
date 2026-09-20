import { z } from "zod";
import {
  parseBenchmarkReport,
  runLiveBenchmark,
  type BenchmarkReport,
} from "./benchmark";
import {
  parseEvaluationFixtures,
  summarizeMeasurements,
  MAX_EVALUATION_BYTES,
  type EvaluationFixtures,
} from "./evaluation";
import { canonical, hashValue } from "./graph";
import { ENGINE_VERSION } from "./knowledge";
import type { EngineMessage, EngineResult, JevTransport, Style } from "./types";

type FixtureCase = EvaluationFixtures["cases"][number];
export type ConversationFixture = {
  version: "jev-chat-conversation-v1";
  id: string;
  category: string;
  input: Omit<FixtureCase["input"], "messages">;
  turns: {
    id: string;
    question: string;
    style?: Style;
    expectations: FixtureCase["expectations"];
    evidenceNotes: string;
  }[];
};
export type ConversationPlan = {
  version: "jev-chat-conversation-plan-v1";
  mode: "plan";
  engine: string;
  fixtureHash: string;
  maxRequests: number;
  fixture: ConversationFixture;
};
export type ConversationReport = {
  version: "jev-chat-conversation-benchmark-v1";
  runId: string;
  createdAt: string;
  finishedAt: string | null;
  execution: "live" | "mocked";
  plan: ConversationPlan;
  status: "running" | "completed" | "stopped";
  stopReason: BenchmarkReport["stopReason"] | "turn-failed";
  turns: {
    id: string;
    status: "not-run" | "running" | "completed" | "failed";
    benchmark: BenchmarkReport | null;
  }[];
  summary: BenchmarkReport["summary"];
  quality: BenchmarkReport["quality"];
};
type RunOptions = {
  maxRequests: number;
  execution: "live" | "mocked";
  transport: JevTransport;
  signal?: AbortSignal;
  onUpdate?: (report: ConversationReport) => Promise<void>;
};

/** Detached JSON only: do not execute accessors or custom serializers during
 * size checks. The cheap running bound precedes the exact UTF-8 byte bound.
 */
function jsonData(value: unknown, maxBytes: number): unknown {
  let units = 0;
  const active = new Set<object>();
  const visit = (item: unknown, depth: number): unknown => {
    if (++units > maxBytes || depth > 100) throw Error();
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (typeof item === "string") {
      units += item.length;
      if (units > maxBytes) throw Error();
      return item;
    }
    if (!item || typeof item !== "object" || active.has(item)) throw Error();
    const array = Array.isArray(item);
    const prototype = Object.getPrototypeOf(item);
    if (
      array
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    )
      throw Error();
    active.add(item);
    const keys = Reflect.ownKeys(item);
    let result: unknown;
    if (array) {
      const length = Object.getOwnPropertyDescriptor(item, "length")?.value;
      if (
        !Number.isInteger(length) ||
        length < 0 ||
        length > maxBytes ||
        keys.length !== length + 1
      )
        throw Error();
      const copy: unknown[] = [];
      for (let index = 0; index < length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value"))
          throw Error();
        copy.push(visit(descriptor.value, depth + 1));
      }
      result = copy;
    } else {
      const copy: Record<string, unknown> = Object.create(null);
      for (const key of keys) {
        if (typeof key !== "string" || (units += key.length) > maxBytes)
          throw Error();
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value"))
          throw Error();
        copy[key] = visit(descriptor.value, depth + 1);
      }
      result = copy;
    }
    active.delete(item);
    return result;
  };
  try {
    const copy = visit(value, 0);
    const encoded = JSON.stringify(copy);
    if (new TextEncoder().encode(encoded).byteLength > maxBytes) throw Error();
    return JSON.parse(encoded);
  } catch {
    throw Error("Invalid conversation JSON data or size limit.");
  }
}

const idSchema = z.string().regex(/^[a-z][a-z0-9-]{0,79}$/);
const categorySchema = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
const styleSchema = z.enum(["concise", "balanced", "detailed"]);
const requestLimit = z.number().int().min(1).max(20);
const fixtureSchema = z.strictObject({
  version: z.literal("jev-chat-conversation-v1"),
  id: idSchema,
  category: categorySchema,
  input: z.strictObject({
    topic: z.enum(["guide", "notes", "support", "creative"]),
    notes: z.string().max(12000),
    style: styleSchema.default("balanced"),
    seed: z.number().int().min(0).max(0xffffffff).optional(),
  }),
  turns: z
    .array(
      z.strictObject({
        id: idSchema,
        question: z
          .string()
          .min(1)
          .max(2000)
          .refine((text) => Boolean(text.trim())),
        style: styleSchema.optional(),
        expectations: z.unknown(),
        evidenceNotes: z.string(),
      }),
    )
    .min(1)
    .max(10),
});

function evaluationDocument(
  fixture: ConversationFixture,
  turn: ConversationFixture["turns"][number],
  history: EngineMessage[],
  style: Style,
): EvaluationFixtures {
  return parseEvaluationFixtures({
    version: "jev-chat-evaluation-v1",
    cases: [
      {
        id: turn.id,
        category: fixture.category,
        input: {
          ...fixture.input,
          style,
          messages: [...history, { role: "user", text: turn.question }],
        },
        expectations: turn.expectations,
        evidenceNotes: turn.evidenceNotes,
      },
    ],
  });
}

/** A plan binds only authored inputs. Future messages and input hashes do not
 * exist until the preceding responses have actually completed.
 */
export async function createConversationPlan(
  value: unknown,
  options: { maxRequests: number },
): Promise<ConversationPlan> {
  const limits = z.strictObject({ maxRequests: requestLimit }).parse(options);
  const raw = fixtureSchema.parse(jsonData(value, MAX_EVALUATION_BYTES));
  // Reuse the existing input/expectation contract, including paragraph bounds,
  // duplicate IDs, independent expectations, and normalized evidence notes.
  const normalized = parseEvaluationFixtures({
    version: "jev-chat-evaluation-v1",
    cases: raw.turns.map((turn) => ({
      id: turn.id,
      category: raw.category,
      input: {
        ...raw.input,
        style: turn.style ?? raw.input.style,
        messages: [{ role: "user", text: turn.question }],
      },
      expectations: turn.expectations,
      evidenceNotes: turn.evidenceNotes,
    })),
  });
  const fixture: ConversationFixture = {
    ...raw,
    turns: raw.turns.map((turn, index) => ({
      ...turn,
      expectations: normalized.cases[index].expectations,
      evidenceNotes: normalized.cases[index].evidenceNotes,
    })),
  };
  return {
    version: "jev-chat-conversation-plan-v1",
    mode: "plan",
    engine: ENGINE_VERSION,
    fixtureHash: await hashValue(fixture),
    maxRequests: limits.maxRequests,
    fixture,
  };
}

function summary(
  turns: ConversationReport["turns"],
): ConversationReport["summary"] {
  const requests = turns.flatMap(
    (turn) => turn.benchmark?.cases.flatMap((entry) => entry.requests) ?? [],
  );
  return {
    completed: turns.filter((turn) => turn.status === "completed").length,
    failed: turns.filter((turn) => turn.status === "failed").length,
    notRun: turns.filter((turn) => turn.status === "not-run").length,
    requests: requests.length,
    inputTokens: summarizeMeasurements(
      requests.map((request) => request.inputTokens),
    ),
    outputTokens: summarizeMeasurements(
      requests.map((request) => request.outputTokens),
    ),
    elapsedMs: summarizeMeasurements(
      turns.map((turn) => turn.benchmark?.cases[0]?.elapsedMs ?? null),
    ),
  };
}

function carry(
  history: EngineMessage[],
  question: string,
  result: EngineResult,
): void {
  history.push(
    { role: "user", text: question },
    structuredClone({
      role: "assistant" as const,
      text: result.text,
      options: result.options,
      ...(result.story ? { story: result.story } : {}),
    }),
  );
}

/** Only the caller's injected transport can perform requests. A failed turn
 * stops the trajectory; clarification is a completed response and continues.
 */
export async function runConversationBenchmark(
  value: unknown,
  options: RunOptions,
): Promise<ConversationReport> {
  const plan = await createConversationPlan(value, {
    maxRequests: options.maxRequests,
  });
  if (
    !["live", "mocked"].includes(options.execution) ||
    typeof options.transport !== "function" ||
    (options.onUpdate !== undefined && typeof options.onUpdate !== "function")
  )
    throw Error("Declare conversation execution and supply a transport.");
  const report: ConversationReport = {
    version: "jev-chat-conversation-benchmark-v1",
    runId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    finishedAt: null,
    execution: options.execution,
    plan,
    status: "running",
    stopReason: null,
    turns: plan.fixture.turns.map(({ id }) => ({
      id,
      status: "not-run",
      benchmark: null,
    })),
    summary: summary([]),
    quality: {
      semantic: "unmeasured",
      creative: "unmeasured",
      latestLlmParity: "unproven",
    },
  };
  let active = true;
  let checkpointFailed = false;
  let checkpointQueue = Promise.resolve(true);
  const checkpoint = () => {
    report.summary = summary(report.turns);
    const snapshot = structuredClone(report);
    checkpointQueue = checkpointQueue.then(async () => {
      if (!active || checkpointFailed) return false;
      try {
        await options.onUpdate?.(snapshot);
        return true;
      } catch {
        checkpointFailed = true;
        report.stopReason = "checkpoint";
        return false;
      }
    });
    return checkpointQueue;
  };
  const history: EngineMessage[] = [];
  let style = plan.fixture.input.style;
  await checkpoint();
  for (let index = 0; index < report.turns.length; index++) {
    if (!checkpointFailed && options.signal?.aborted)
      report.stopReason = "cancelled";
    const remaining = plan.maxRequests - summary(report.turns).requests;
    if (!report.stopReason && remaining === 0)
      report.stopReason = "request-budget";
    if (report.stopReason) break;
    const entry = report.turns[index],
      turn = plan.fixture.turns[index];
    style = turn.style ?? style;
    entry.status = "running";
    let turnActive = true;
    try {
      if (!(await checkpoint())) throw Error("Conversation checkpoint failed.");
      const document = evaluationDocument(plan.fixture, turn, history, style);
      entry.benchmark = await runLiveBenchmark(document, {
        caseIds: [turn.id],
        maxRequests: remaining,
        execution: options.execution,
        transport: options.transport,
        signal: options.signal,
        onUpdate: async (inner) => {
          if (!active || !turnActive)
            throw Error("Conversation turn is inactive.");
          entry.benchmark = structuredClone(inner);
          if (!(await checkpoint()))
            throw Error("Conversation checkpoint failed.");
        },
      });
      const result = entry.benchmark.cases[0].result;
      if (entry.benchmark.cases[0].status === "completed" && result) {
        entry.status = "completed";
        carry(history, turn.question, result);
        if (result.story) style = result.story.style;
      } else entry.status = "failed";
      report.stopReason = checkpointFailed
        ? "checkpoint"
        : (entry.benchmark.stopReason ??
          (entry.status === "failed" ? "turn-failed" : null));
    } catch {
      entry.status = "failed";
      report.stopReason = checkpointFailed
        ? "checkpoint"
        : options.signal?.aborted
          ? "cancelled"
          : "turn-failed";
    } finally {
      turnActive = false;
      await checkpoint();
    }
    if (report.stopReason) break;
  }
  report.status = report.stopReason ? "stopped" : "completed";
  report.finishedAt = new Date().toISOString();
  await checkpoint();
  if (checkpointFailed) report.status = "stopped";
  active = false;
  report.summary = summary(report.turns);
  return structuredClone(report);
}

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const measurementSchema = z.strictObject({
  knownCount: z.number().int().nonnegative(),
  unknownCount: z.number().int().nonnegative(),
  knownSubtotal: z.number().finite().nonnegative().nullable(),
  total: z.number().finite().nonnegative().nullable(),
});
const reportSchema = z.strictObject({
  version: z.literal("jev-chat-conversation-benchmark-v1"),
  runId: z.uuid(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  execution: z.enum(["live", "mocked"]),
  plan: z.strictObject({
    version: z.literal("jev-chat-conversation-plan-v1"),
    mode: z.literal("plan"),
    engine: z.string().min(1).max(200),
    fixtureHash: hashSchema,
    maxRequests: requestLimit,
    fixture: z.unknown(),
  }),
  status: z.enum(["running", "completed", "stopped"]),
  stopReason: z
    .enum([
      "request-budget",
      "provider-limit",
      "cancelled",
      "checkpoint",
      "turn-failed",
    ])
    .nullable(),
  turns: z
    .array(
      z.strictObject({
        id: idSchema,
        status: z.enum(["not-run", "running", "completed", "failed"]),
        benchmark: z.unknown().nullable(),
      }),
    )
    .min(1)
    .max(10),
  summary: z.strictObject({
    completed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    notRun: z.number().int().nonnegative(),
    requests: z.number().int().nonnegative(),
    inputTokens: measurementSchema,
    outputTokens: measurementSchema,
    elapsedMs: measurementSchema,
  }),
  quality: z.strictObject({
    semantic: z.literal("unmeasured"),
    creative: z.literal("unmeasured"),
    latestLlmParity: z.literal("unproven"),
  }),
});

/** Offline consistency and decision replay only. Hashes do not authenticate
 * the provider, execution label, reviewer judgments, or semantic correctness.
 */
export async function parseConversationReport(
  value: unknown,
): Promise<ConversationReport> {
  const raw = reportSchema.parse(jsonData(value, 16 * 1024 * 1024));
  const plan = await createConversationPlan(raw.plan.fixture, {
    maxRequests: raw.plan.maxRequests,
  });
  if (canonical(raw.plan) !== canonical(plan))
    throw Error("Conversation plan, engine, or fixture hash does not match.");
  if (
    (raw.status === "running") !== (raw.finishedAt === null) ||
    (raw.status === "completed" && raw.stopReason !== null) ||
    (raw.status === "stopped" && raw.stopReason === null) ||
    raw.turns.length !== plan.fixture.turns.length
  )
    throw Error("Conversation lifecycle or turn count is inconsistent.");
  const history: EngineMessage[] = [];
  let style = plan.fixture.input.style;
  let used = 0;
  let prefixEnded = false;
  const turns: ConversationReport["turns"] = [];
  for (let index = 0; index < raw.turns.length; index++) {
    const entry = raw.turns[index],
      turn = plan.fixture.turns[index];
    if (entry.id !== turn.id || (prefixEnded && entry.status !== "not-run"))
      throw Error("Conversation turns must form the ordered executed prefix.");
    if (entry.status !== "completed") prefixEnded = true;
    if (raw.status !== "running" && entry.status === "running")
      throw Error("Terminal conversation contains a running turn.");
    if (entry.status === "not-run") {
      if (entry.benchmark !== null)
        throw Error("Not-run conversation turn contains a benchmark.");
      turns.push({ ...entry, benchmark: null });
      continue;
    }
    if (used >= plan.maxRequests)
      throw Error("Conversation turn exceeds its remaining request budget.");
    style = turn.style ?? style;
    if (entry.benchmark === null) {
      if (entry.status === "completed")
        throw Error("Completed conversation turn has no benchmark.");
      if (entry.status === "failed" && raw.stopReason === "turn-failed") {
        let invalid = false;
        try {
          evaluationDocument(plan.fixture, turn, history, style);
        } catch {
          invalid = true;
        }
        if (!invalid)
          throw Error(
            "Missing benchmark does not reproduce a preflight validation failure.",
          );
      } else if (
        entry.status === "failed" &&
        raw.stopReason !== "checkpoint" &&
        raw.stopReason !== "cancelled"
      ) {
        throw Error("Missing failed benchmark has no consistent stop reason.");
      }
      turns.push({ ...entry, benchmark: null });
      continue;
    }
    const expected = evaluationDocument(plan.fixture, turn, history, style);
    const benchmark = await parseBenchmarkReport(entry.benchmark);
    if (benchmark.stopReason) prefixEnded = true;
    if (
      benchmark.cases.length !== 1 ||
      benchmark.execution !== raw.execution ||
      benchmark.engine !== plan.engine ||
      benchmark.maxRequests !== plan.maxRequests - used ||
      benchmark.fixtureHash !== (await hashValue(expected)) ||
      canonical(benchmark.cases[0].fixture) !== canonical(expected.cases[0])
    )
      throw Error(
        "Conversation chain input, fixture hash, execution, or budget does not match.",
      );
    if (
      (raw.status !== "running" || entry.status !== "running") &&
      benchmark.status === "running"
    )
      throw Error("Terminal conversation turn contains a running benchmark.");
    const inner = benchmark.cases[0];
    if (
      (entry.status === "completed" &&
        (inner.status !== "completed" || !inner.result)) ||
      (entry.status === "failed" && inner.status === "completed")
    )
      throw Error("Conversation completion status contradicts its benchmark.");
    if (entry.status === "completed") {
      carry(history, turn.question, inner.result!);
      if (inner.result!.story) style = inner.result!.story.style;
    }
    used += inner.requests.length;
    turns.push({ ...entry, benchmark });
  }
  const measured = summary(turns);
  const failed = turns.find((turn) => turn.status === "failed");
  const last = turns.filter((turn) => turn.status !== "not-run").at(-1);
  if (
    measured.requests > plan.maxRequests ||
    (raw.status === "completed" && measured.completed !== turns.length) ||
    (raw.stopReason === "turn-failed" &&
      (!failed || failed.benchmark?.stopReason)) ||
    (raw.stopReason === "request-budget" &&
      (measured.requests !== plan.maxRequests ||
        measured.completed === turns.length)) ||
    (raw.stopReason === "provider-limit" &&
      last?.benchmark?.stopReason !== "provider-limit") ||
    (failed && raw.stopReason === null) ||
    (last?.benchmark?.stopReason &&
      last.status !== "running" &&
      raw.stopReason !== "checkpoint" &&
      raw.stopReason !== last.benchmark.stopReason)
  )
    throw Error(
      "Conversation stop reason or request accounting is inconsistent.",
    );
  return { ...raw, plan, turns, summary: measured };
}
