import { z } from "zod";
import { analysisPayload, respond } from "./engine";
import { canonical, hashValue } from "./graph";
import { buildContext, ENGINE_VERSION } from "./knowledge";
import {
  evaluateArtifact,
  parseEvaluationFixtures,
  summarizeMeasurements,
  type EvaluationFixtures,
  type EvaluatedArtifact,
} from "./evaluation";
import type { EngineResult, JevTransport } from "./types";
import { parseSavedResult, verifySavedResult } from "./persistence";
import { readFictionScore } from "./fiction-ranking";

type Limits = { caseIds: string[]; maxRequests: number };
const limitsSchema = z.strictObject({
  caseIds: z.array(z.string().min(1).max(80)).min(1).max(10),
  maxRequests: z.number().int().min(1).max(20),
});
export type BenchmarkPlan = {
  version: "jev-chat-benchmark-plan-v1";
  mode: "plan";
  engine: string;
  fixtureHash: string;
  maxRequests: number;
  cases: {
    id: string;
    inputHash: string;
    fixture: EvaluationFixtures["cases"][number];
  }[];
};
export async function createBenchmarkPlan(
  value: unknown,
  options: Limits,
): Promise<BenchmarkPlan> {
  const limits = limitsSchema.parse(options);
  if (new Set(limits.caseIds).size !== limits.caseIds.length)
    throw Error("Duplicate case selection.");
  const fixtures = JSON.parse(
    JSON.stringify(parseEvaluationFixtures(value)),
  ) as EvaluationFixtures;
  const cases: BenchmarkPlan["cases"] = [];
  for (const id of limits.caseIds) {
    const fixture = fixtures.cases.find((f) => f.id === id);
    if (!fixture) throw Error(`Unknown benchmark case: ${id}.`);
    cases.push({ id, fixture, inputHash: await hashValue(fixture.input) });
  }
  return {
    version: "jev-chat-benchmark-plan-v1",
    mode: "plan",
    engine: ENGINE_VERSION,
    fixtureHash: await hashValue(fixtures),
    maxRequests: limits.maxRequests,
    cases,
  };
}
type StopReason =
  "request-budget" | "provider-limit" | "cancelled" | "checkpoint";
type RequestRecord = {
  index: number;
  status: "pending" | "completed" | "failed" | "interrupted";
  requestedModel: string;
  returnedModel: string | null;
  payloadHash: string;
  inputTokens: number | null;
  outputTokens: number | null;
  elapsedMs: number | null;
  statusCode: number | null;
  answers: Record<string, unknown> | null;
};
export type BenchmarkCase = BenchmarkPlan["cases"][number] & {
  status: "not-run" | "running" | "completed" | "failed";
  result: EngineResult | null;
  outputHash: string | null;
  elapsedMs: number | null;
  failure: string | null;
  requests: RequestRecord[];
  mechanical: EvaluatedArtifact["mechanical"] | null;
  graphIntegrity: EvaluatedArtifact["graphIntegrity"] | null;
};
export type BenchmarkReport = {
  version: "jev-chat-benchmark-v1";
  runId: string;
  createdAt: string;
  finishedAt: string | null;
  execution: "live" | "mocked";
  engine: string;
  fixtureHash: string;
  maxRequests: number;
  status: "running" | "completed" | "stopped";
  stopReason: StopReason | null;
  cases: BenchmarkCase[];
  summary: {
    completed: number;
    failed: number;
    notRun: number;
    requests: number;
    inputTokens: ReturnType<typeof summarizeMeasurements>;
    outputTokens: ReturnType<typeof summarizeMeasurements>;
    elapsedMs: ReturnType<typeof summarizeMeasurements>;
  };
  quality: {
    semantic: "unmeasured";
    creative: "unmeasured";
    latestLlmParity: "unproven";
  };
};
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const unit = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;
const statusCode = (value: unknown) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 100 &&
  value <= 599
    ? value
    : null;
function usage(value: unknown) {
  const raw = record(value) ? (value._playgroundUsage ?? value.usage) : null;
  const tokens = (v: unknown) =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
  return {
    inputTokens: record(raw)
      ? tokens(raw.inputTokens ?? raw.input_tokens)
      : null,
    outputTokens: record(raw)
      ? tokens(raw.outputTokens ?? raw.output_tokens)
      : null,
  };
}
function answerSnapshot(
  raw: unknown,
  payload: Parameters<JevTransport>[0],
): Record<string, unknown> {
  const answers = record(raw) && record(raw.answers) ? raw.answers : {};
  return Object.fromEntries(
    Object.entries(payload.questions).map(([id, q]) => {
      const a = answers[id];
      if (!record(a) || a.type !== q.type) return [id, { invalid: true }];
      if (q.type === "noul")
        return [
          id,
          unit(a.noul) ? { type: "noul", noul: a.noul } : { invalid: true },
        ];
      if (q.type === "score") {
        try {
          if (!Array.isArray(q.criteria) || q.criteria.length !== 2)
            return [id, { invalid: true }];
          return [id, readFictionScore(a)];
        } catch {
          return [id, { invalid: true }];
        }
      }
      const criteria = record(q.criteria) ? q.criteria : {};
      if (
        q.type === "choice" &&
        typeof a.choice === "string" &&
        Object.hasOwn(criteria, a.choice)
      ) {
        return [
          id,
          {
            type: "choice",
            choice: a.choice,
            confidence: unit(a.confidence) ? a.confidence : null,
            probabilities: record(a.probabilities)
              ? Object.fromEntries(
                  Object.keys(criteria)
                    .filter((key) =>
                      unit((a.probabilities as Record<string, unknown>)[key]),
                    )
                    .map((key) => [
                      key,
                      (a.probabilities as Record<string, unknown>)[key],
                    ]),
                )
              : null,
          },
        ];
      }
      return [id, { invalid: true }];
    }),
  );
}
function summary(cases: BenchmarkCase[]): BenchmarkReport["summary"] {
  const requests = cases.flatMap((c) => c.requests);
  return {
    completed: cases.filter((c) => c.status === "completed").length,
    failed: cases.filter((c) => c.status === "failed").length,
    notRun: cases.filter((c) => c.status === "not-run").length,
    requests: requests.length,
    inputTokens: summarizeMeasurements(requests.map((r) => r.inputTokens)),
    outputTokens: summarizeMeasurements(requests.map((r) => r.outputTokens)),
    elapsedMs: summarizeMeasurements(cases.map((c) => c.elapsedMs)),
  };
}
/** Transport is injected; only the explicit CLI live path supplies a network adapter. */
export async function runLiveBenchmark(
  value: unknown,
  options: Limits & {
    execution: "live" | "mocked";
    transport: JevTransport;
    signal?: AbortSignal;
    onUpdate?: (report: BenchmarkReport) => Promise<void>;
  },
): Promise<BenchmarkReport> {
  const plan = await createBenchmarkPlan(value, {
    caseIds: options.caseIds,
    maxRequests: options.maxRequests,
  });
  if (
    !["live", "mocked"].includes(options.execution) ||
    typeof options.transport !== "function"
  )
    throw Error("Declare benchmark execution and supply a transport.");
  const cases: BenchmarkCase[] = plan.cases.map((c) => ({
    ...c,
    status: "not-run",
    result: null,
    outputHash: null,
    elapsedMs: null,
    failure: null,
    requests: [],
    mechanical: null,
    graphIntegrity: null,
  }));
  const report: BenchmarkReport = {
    version: "jev-chat-benchmark-v1",
    runId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    finishedAt: null,
    execution: options.execution,
    engine: plan.engine,
    fixtureHash: plan.fixtureHash,
    maxRequests: plan.maxRequests,
    status: "running",
    stopReason: null,
    cases,
    summary: summary(cases),
    quality: {
      semantic: "unmeasured",
      creative: "unmeasured",
      latestLlmParity: "unproven",
    },
  };
  let attempts = 0;
  let checkpointFailed = false;
  let checkpointQueue = Promise.resolve(true);
  const checkpoint = () => {
    // An abort can finish respond while a transport checkpoint is still writing.
    // Serialize those writes so an older partial report cannot replace the final one.
    checkpointQueue = checkpointQueue.then(async () => {
      if (checkpointFailed) return false;
      report.summary = summary(cases);
      try {
        await options.onUpdate?.(structuredClone(report));
        return true;
      } catch {
        checkpointFailed = true;
        report.stopReason = "checkpoint";
        return false;
      }
    });
    return checkpointQueue;
  };
  const requireCheckpoint = async () => {
    if (!(await checkpoint()))
      throw Error("Benchmark checkpoint could not be written.");
  };
  await checkpoint();
  for (const entry of cases) {
    if (!checkpointFailed && options.signal?.aborted)
      report.stopReason = "cancelled";
    if (!report.stopReason && attempts >= plan.maxRequests)
      report.stopReason = "request-budget";
    if (report.stopReason) break;
    entry.status = "running";
    const started = performance.now();
    let active = true;
    try {
      await requireCheckpoint();
      const result = await respond(
        { ...entry.fixture.input, mode: "live" },
        {
          signal: options.signal,
          transport: async (payload, signal) => {
            const checkActive = () => {
              if (!active || signal?.aborted || checkpointFailed)
                throw Error("Benchmark request interrupted.");
            };
            checkActive();
            if (attempts >= plan.maxRequests) {
              report.stopReason = "request-budget";
              throw Error("Request budget exhausted.");
            }
            const payloadHash = await hashValue(payload);
            checkActive();
            const request: RequestRecord = {
              index: ++attempts,
              status: "pending",
              requestedModel: payload.model,
              returnedModel: null,
              payloadHash,
              inputTokens: null,
              outputTokens: null,
              elapsedMs: null,
              statusCode: null,
              answers: null,
            };
            entry.requests.push(request);
            let requestStarted: number | null = null;
            try {
              await requireCheckpoint();
              checkActive();
              requestStarted = performance.now();
              const raw = await options.transport(payload, signal);
              checkActive();
              Object.assign(request, usage(raw));
              request.returnedModel =
                record(raw) &&
                typeof raw.model === "string" &&
                /^[a-z0-9][a-z0-9._:/-]{0,99}$/i.test(raw.model)
                  ? raw.model
                  : null;
              request.answers = answerSnapshot(raw, payload);
              request.status = "completed";
              request.statusCode = statusCode(
                record(raw) && record(raw._playgroundUsage)
                  ? raw._playgroundUsage.status
                  : null,
              );
              return raw;
            } catch (error) {
              if (active && !signal?.aborted) {
                request.status = "failed";
                const status =
                  error && typeof error === "object" && "status" in error
                    ? error.status
                    : null;
                request.statusCode = statusCode(status);
                Object.assign(request, usage(error));
                if (!checkpointFailed && (status === 429 || status === 402))
                  report.stopReason = "provider-limit";
              }
              throw error;
            } finally {
              if (active && !signal?.aborted) {
                request.elapsedMs =
                  requestStarted === null
                    ? null
                    : Math.max(0, performance.now() - requestStarted);
                await requireCheckpoint();
              }
            }
          },
        },
      );
      entry.result = result;
      entry.outputHash = await hashValue(result.text);
      const assessed = await evaluateArtifact(
        entry.fixture,
        {
          engine: "composition",
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
          calls: result.trace.calls,
          inputTokens: result.trace.inputTokens,
          outputTokens: result.trace.outputTokens,
          elapsedMs: result.trace.elapsedMs,
        },
        "live",
      );
      entry.mechanical = assessed.mechanical;
      entry.graphIntegrity = assessed.graphIntegrity;
      entry.status = "completed";
    } catch {
      entry.status = "failed";
      entry.result = null;
      entry.outputHash = null;
      if (!checkpointFailed && options.signal?.aborted)
        report.stopReason = "cancelled";
      entry.failure = report.stopReason ?? "response-failed";
    } finally {
      active = false;
      for (const request of entry.requests) {
        if (request.status === "pending") request.status = "interrupted";
      }
      entry.elapsedMs = Math.max(0, performance.now() - started);
      await checkpoint();
    }
  }
  report.status = report.stopReason ? "stopped" : "completed";
  report.finishedAt = new Date().toISOString();
  await checkpoint();
  if (checkpointFailed) report.status = "stopped";
  report.summary = summary(cases);
  return structuredClone(report);
}

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const name = z.string().trim().min(1).max(200);
const measurement = z.number().finite().nonnegative().nullable();
const requestSchema = z.strictObject({
  index: z.number().int().min(1).max(20),
  status: z.enum(["pending", "completed", "failed", "interrupted"]),
  requestedModel: z.literal("jev-latest"),
  returnedModel: name.nullable(),
  payloadHash: hash,
  inputTokens: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .nullable(),
  outputTokens: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .nullable(),
  elapsedMs: measurement,
  statusCode: z.number().int().min(100).max(599).nullable(),
  answers: z
    .record(z.string().max(100), z.unknown())
    .refine((v) => Object.keys(v).length <= 100)
    .nullable(),
});
/** Revalidate imported artifacts; this establishes internal consistency, not execution authenticity. */
export async function parseBenchmarkReport(
  value: unknown,
): Promise<BenchmarkReport> {
  if (
    new TextEncoder().encode(JSON.stringify(value)).byteLength >
    16 * 1024 * 1024
  )
    throw Error("Benchmark report exceeds 16 MiB.");
  const raw = z
    .strictObject({
      version: z.literal("jev-chat-benchmark-v1"),
      runId: z.uuid(),
      createdAt: z.iso.datetime(),
      finishedAt: z.iso.datetime().nullable(),
      execution: z.enum(["live", "mocked"]),
      engine: name,
      fixtureHash: hash,
      maxRequests: z.number().int().min(1).max(20),
      status: z.enum(["running", "completed", "stopped"]),
      stopReason: z
        .enum(["request-budget", "provider-limit", "cancelled", "checkpoint"])
        .nullable(),
      summary: z.unknown(),
      quality: z.strictObject({
        semantic: z.literal("unmeasured"),
        creative: z.literal("unmeasured"),
        latestLlmParity: z.literal("unproven"),
      }),
      cases: z
        .array(
          z.strictObject({
            id: name,
            inputHash: hash,
            fixture: z.unknown(),
            status: z.enum(["not-run", "running", "completed", "failed"]),
            result: z.unknown().nullable(),
            outputHash: hash.nullable(),
            elapsedMs: measurement,
            failure: name.nullable(),
            requests: z.array(requestSchema).max(2),
            mechanical: z.unknown().nullable(),
            graphIntegrity: z.unknown().nullable(),
          }),
        )
        .min(1)
        .max(10),
    })
    .parse(value);
  if (
    (raw.status === "running") !== (raw.finishedAt === null) ||
    (raw.status === "completed" && raw.stopReason !== null) ||
    (raw.status === "stopped" && raw.stopReason === null)
  )
    throw Error("Benchmark report lifecycle status is inconsistent.");
  const fixtures = parseEvaluationFixtures({
    version: "jev-chat-evaluation-v1",
    cases: raw.cases.map((c) => c.fixture),
  });
  if (raw.engine !== ENGINE_VERSION)
    throw Error("Benchmark replay requires the recorded engine version.");
  const cases: BenchmarkCase[] = [];
  for (let i = 0; i < raw.cases.length; i++) {
    const c = raw.cases[i],
      fixture = fixtures.cases[i];
    if (
      raw.status !== "running" &&
      (c.status === "running" || c.requests.some((r) => r.status === "pending"))
    )
      throw Error(
        "Terminal benchmark status cannot contain running cases or pending requests.",
      );
    if (raw.status === "completed" && c.status === "not-run")
      throw Error("Completed benchmark status cannot contain not-run cases.");
    if (
      c.status === "not-run" &&
      (c.requests.length ||
        c.result !== null ||
        c.outputHash !== null ||
        c.elapsedMs !== null ||
        c.failure !== null ||
        c.mechanical !== null ||
        c.graphIntegrity !== null)
    )
      throw Error(
        "A not-run benchmark case cannot contain requests or results.",
      );
    if (
      (c.status === "failed") !== (c.failure !== null) ||
      (["completed", "failed"].includes(c.status) && c.elapsedMs === null) ||
      (c.status === "running" && c.elapsedMs !== null)
    )
      throw Error(
        "Benchmark case lifecycle or failure status is inconsistent.",
      );
    if (
      c.status === "completed" &&
      c.requests.some((r) => r.status !== "completed")
    )
      throw Error("Completed case status requires completed requests.");
    if (c.status === "failed" && c.requests.some((r) => r.status === "pending"))
      throw Error("Failed case status cannot contain pending requests.");
    for (const request of c.requests) {
      if (
        ["pending", "interrupted"].includes(request.status) &&
        (request.inputTokens !== null ||
          request.outputTokens !== null ||
          request.answers !== null ||
          request.returnedModel !== null ||
          request.statusCode !== null ||
          request.elapsedMs !== null)
      )
        throw Error(
          "Pending or interrupted request status cannot contain a response.",
        );
    }
    if (c.id !== fixture.id || c.inputHash !== (await hashValue(fixture.input)))
      throw Error("Benchmark input does not match its hash or case.");
    const context = buildContext({ ...fixture.input, mode: "live" });
    if (
      c.requests[0] &&
      c.requests[0].payloadHash !== (await hashValue(analysisPayload(context)))
    )
      throw Error(
        "Benchmark request hash does not match the supplied context.",
      );
    const result = c.result === null ? null : parseSavedResult(c.result);
    if (
      c.status === "completed" &&
      !c.requests.length &&
      result?.trace.semanticVerification !== "scripted-help"
    )
      throw Error(
        "A completed zero-request case requires a scripted help route.",
      );
    if (
      c.result !== null &&
      (!result || !(await verifySavedResult(result, fixture.input.notes)))
    )
      throw Error("Benchmark response integrity check failed.");
    if (
      result &&
      (c.outputHash !== (await hashValue(result.text)) ||
        result.trace.engine !== raw.engine ||
        result.provenance !== "live" ||
        result.trace.calls !== c.requests.length)
    )
      throw Error("Benchmark response metadata or output hash does not match.");
    if (result) {
      if (result.trace.contextHash !== (await hashValue(context.state)))
        throw Error("Benchmark context hash does not match its input.");
      const known = c.requests.every(
        (r) => r.inputTokens !== null && r.outputTokens !== null,
      );
      for (const key of ["inputTokens", "outputTokens"] as const) {
        const expected = known
          ? c.requests.reduce((total, r) => total + r[key]!, 0)
          : null;
        if (result.trace[key] !== expected)
          throw Error(
            "Benchmark response token usage contradicts its request records.",
          );
      }
      let replayIndex = 0;
      const replay = await respond(
        { ...fixture.input, mode: "live" },
        {
          transport: async (payload) => {
            const request = c.requests[replayIndex++];
            if (!request?.answers || request.status !== "completed")
              throw Error(
                "Benchmark replay requires completed request answers.",
              );
            if (request.payloadHash !== (await hashValue(payload)))
              throw Error("Benchmark replay request hash does not match.");
            // Older snapshots represented absent probabilities as null. Both absence
            // and null confidence mean unknown; null probabilities must be omitted.
            const answers = Object.fromEntries(
              Object.entries(request.answers).map(([id, value]) => {
                if (
                  !record(value) ||
                  value.type !== "choice" ||
                  value.probabilities !== null
                )
                  return [id, value];
                const { probabilities: _absent, ...answer } = value;
                return [id, answer];
              }),
            );
            return {
              answers,
              usage: {
                inputTokens: request.inputTokens,
                outputTokens: request.outputTokens,
              },
            };
          },
        },
      );
      const stable = (response: EngineResult) => {
        const { elapsedMs: _timing, ...trace } = response.trace;
        return { ...response, trace };
      };
      if (
        replayIndex !== c.requests.length ||
        (await hashValue(stable(replay))) !== (await hashValue(stable(result)))
      )
        throw Error(
          "Benchmark response does not match its recorded decision replay.",
        );
    }
    if (
      (c.status === "completed") !== Boolean(result) ||
      (!result && c.outputHash !== null)
    )
      throw Error("Benchmark completion status does not match its response.");
    const evaluated = result
      ? await evaluateArtifact(
          fixture,
          {
            engine: "composition",
            outcome: "completed",
            text: result.text,
            intent: result.intent,
            responseStatus: result.status,
            selected: result.trace.selectedPlan,
            provenance: result.provenance,
            sources: result.sources,
            graph: result.graph,
            elapsedMs: result.trace.elapsedMs,
            calls: result.trace.calls,
            inputTokens: result.trace.inputTokens,
            outputTokens: result.trace.outputTokens,
          },
          "live",
        )
      : null;
    cases.push({
      ...c,
      fixture,
      result,
      mechanical: evaluated?.mechanical ?? null,
      graphIntegrity: evaluated?.graphIntegrity ?? null,
    });
  }
  const requests = cases.flatMap((c) => c.requests);
  if (
    requests.length > raw.maxRequests ||
    requests.some((r, i) => r.index !== i + 1)
  )
    throw Error("Benchmark request count/index exceeds its declared budget.");
  return { ...raw, cases, summary: summary(cases) };
}
const comparisonSchema = z.strictObject({
  caseId: name,
  inputHash: hash,
  provider: name,
  model: name,
  modelVersion: name,
  settings: z
    .record(
      z.string().max(80),
      z.union([
        z.string().max(500),
        z.number().finite(),
        z.boolean(),
        z.null(),
      ]),
    )
    .refine((v) => Object.keys(v).length <= 20),
  output: z
    .string()
    .min(1)
    .max(24000)
    .refine((value) => value.trim().length > 0),
  generatedAt: z.iso.datetime(),
});
const rating = z.number().int().min(1).max(5);
const reviewSchema = z.strictObject({
  caseId: name,
  inputHash: hash,
  outputHash: hash,
  reviewerId: name,
  reviewerKind: z.enum(["human", "model"]),
  rubricVersion: z.literal("jev-chat-quality-v1"),
  ratings: z.strictObject({
    correctness: rating.nullable(),
    usefulness: rating.nullable(),
    coherence: rating.nullable(),
    creativity: rating.nullable(),
  }),
  notes: z.string().trim().min(1).max(2000),
});
function bounded(value: unknown) {
  if (
    new TextEncoder().encode(JSON.stringify(value)).byteLength >
    2 * 1024 * 1024
  )
    throw Error("Comparison/review file exceeds 2 MiB.");
  return value;
}
/** Imported identity/reviews are declarations, not authenticated model or human provenance. */
export async function assessComparisons(
  report: BenchmarkReport,
  comparisons?: unknown,
  reviews?: unknown,
) {
  const imported =
    comparisons === undefined
      ? []
      : z
          .strictObject({
            version: z.literal("jev-chat-comparisons-v1"),
            entries: z.array(comparisonSchema).max(100),
          })
          .parse(bounded(comparisons)).entries;
  const judged =
    reviews === undefined
      ? []
      : z
          .strictObject({
            version: z.literal("jev-chat-reviews-v1"),
            entries: z.array(reviewSchema).max(500),
          })
          .parse(bounded(reviews)).entries;
  const outputs = new Map<string, Set<string>>();
  for (const entry of report.cases) {
    if (entry.inputHash !== (await hashValue(entry.fixture.input)))
      throw Error("Benchmark input hash does not match.");
    if (
      entry.result &&
      entry.outputHash !== (await hashValue(entry.result.text))
    )
      throw Error("Benchmark output hash does not match.");
    outputs.set(entry.id, new Set(entry.outputHash ? [entry.outputHash] : []));
  }
  const seenComparisons = new Set<string>();
  const matched = [];
  for (const entry of imported) {
    const base = report.cases.find((c) => c.id === entry.caseId);
    if (!base || base.inputHash !== entry.inputHash)
      throw Error("Comparison input does not match benchmark case.");
    const id = canonical([
      entry.caseId,
      entry.provider,
      entry.model,
      entry.modelVersion,
      entry.settings,
    ]);
    if (seenComparisons.has(id)) throw Error("Duplicate comparison output.");
    seenComparisons.add(id);
    const outputHash = await hashValue(entry.output);
    outputs.get(entry.caseId)!.add(outputHash);
    matched.push({ ...entry, outputHash });
  }
  const seenReviews = new Set<string>();
  for (const entry of judged) {
    const base = report.cases.find((c) => c.id === entry.caseId);
    if (
      !base ||
      base.inputHash !== entry.inputHash ||
      !outputs.get(entry.caseId)?.has(entry.outputHash)
    )
      throw Error("Review input/output does not match an available response.");
    const id = JSON.stringify([
      entry.caseId,
      entry.outputHash,
      entry.reviewerKind,
      entry.reviewerId,
    ]);
    if (seenReviews.has(id)) throw Error("Duplicate reviewer/output judgment.");
    seenReviews.add(id);
  }
  return {
    version: "jev-chat-assessment-v1" as const,
    runId: report.runId,
    comparisons: matched,
    reviews: judged,
    reviewAttribution: "imported-unverified" as const,
    latestLlmParity: "unproven" as const,
    summary: {
      comparisonOutputs: matched.length,
      humanJudgments: judged.filter((r) => r.reviewerKind === "human").length,
      modelJudgments: judged.filter((r) => r.reviewerKind === "model").length,
    },
    limitations: [
      "Input hashes bind the supplied context, not the external provider's actual prompt or execution.",
      "Imported model versions, settings and reviewer identities are not authenticated.",
      "Judgments remain separate from mechanical checks; these records do not establish general quality or LLM parity.",
    ],
  };
}
