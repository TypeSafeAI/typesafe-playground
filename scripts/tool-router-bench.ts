import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { RunPayload } from "../lib/api";
import {
  categoriesOf,
  contextBytes,
  contextTable,
  groupMetrics,
  metricsTable,
  mockTransport,
  outcomeOf,
  parseCatalog,
  parseTasks,
  planRoute,
  rankLexically,
  routeTask,
  TOOL_ROUTER_MODEL,
  type TaskOutcome,
  type ToolRouterTransport,
} from "../lib/tool-router";
import { serverJevTransport } from "../lib/serverJev";

const help = `Mock (no network): pnpm exec tsx scripts/tool-router-bench.ts [--output docs/tool-router-results.json]
Live: op run --env-file=.env.1password -- pnpm exec tsx scripts/tool-router-bench.ts --live --output docs/tool-router-results.live.json
Routes every task in fixtures/tool-router/tasks.json with the lexical baseline and with Jev (${TOOL_ROUTER_MODEL}),
prints Markdown tables, and writes the full result JSON. Mock mode uses a deterministic lexical stand-in for Jev
and measures only the harness. Live mode reads TYPESAFE_API_KEY from the environment; one request per task, no retries.`;

const FIXTURES = resolve(__dirname, "../fixtures/tool-router");
const LIVE_TIMEOUT_MS = 50_000;

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJsonAtomic(path: string, value: unknown) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
    });
    await rename(temporary, target);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

interface Observed {
  models: Set<string>;
  inputTokens: number;
  outputTokens: number;
  tokensKnown: boolean;
}

/** Records the model id and token usage the provider reports, without touching the payload. */
function observe(
  base: ToolRouterTransport,
  observed: Observed,
): ToolRouterTransport {
  return async (payload: RunPayload, signal?: AbortSignal) => {
    const raw = await base(payload, signal);
    if (raw && typeof raw === "object") {
      const r = raw as {
        model?: unknown;
        _playgroundUsage?: { inputTokens?: unknown; outputTokens?: unknown };
      };
      if (typeof r.model === "string") observed.models.add(r.model);
      const input = r._playgroundUsage?.inputTokens;
      const output = r._playgroundUsage?.outputTokens;
      if (typeof input === "number" && typeof output === "number") {
        observed.inputTokens += input;
        observed.outputTokens += output;
      } else observed.tokensKnown = false;
    }
    return raw;
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean" },
      live: { type: "boolean" },
      output: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    process.stdout.write(help + "\n");
    return;
  }
  const mode = values.live ? "live" : "mock";
  const output = resolve(
    values.output ??
      (mode === "live"
        ? "docs/tool-router-results.live.json"
        : "docs/tool-router-results.json"),
  );
  if (mode === "live" && !process.env.TYPESAFE_API_KEY?.trim())
    throw Error(
      "Live mode needs TYPESAFE_API_KEY in the environment (for example via op run). Nothing was sent.",
    );

  const catalog = parseCatalog(
    await readJson(resolve(FIXTURES, "catalog.json")),
  );
  const tasks = parseTasks(
    await readJson(resolve(FIXTURES, "tasks.json")),
    catalog.tools,
  ).tasks;
  const path = planRoute(catalog.tools);
  const observed: Observed = {
    models: new Set(),
    inputTokens: 0,
    outputTokens: 0,
    tokensKnown: true,
  };
  const transport = observe(
    mode === "live"
      ? (payload, signal) => serverJevTransport(payload, signal)
      : mockTransport,
    observed,
  );
  const startedAt = new Date().toISOString();

  const baselineOutcomes: TaskOutcome[] = [];
  const jevOutcomes: TaskOutcome[] = [];
  const rows = [];
  for (const task of tasks) {
    const baseline = rankLexically(task.task, catalog.tools);
    baselineOutcomes.push(outcomeOf(task, baseline));
    const jev = await routeTask(task.task, catalog.tools, {
      transport,
      timeoutMs: LIVE_TIMEOUT_MS,
    });
    jevOutcomes.push(outcomeOf(task, jev));
    process.stderr.write(
      `${task.id} baseline=${baseline.top1 ?? "none"} jev=${
        jev.unavailable
          ? `unavailable (${jev.unavailable})`
          : (jev.top1 ?? "none")
      } expected=${task.expected ?? "none"} ${jev.latencyMs}ms\n`,
    );
    rows.push({
      ...task,
      baseline: {
        top1: baseline.top1,
        top3: baseline.top3,
        none: baseline.none,
      },
      jev: {
        top1: jev.top1,
        top3: jev.top3,
        none: jev.none,
        confidence: jev.confidence,
        confidences: jev.confidences,
        latencyMs: jev.latencyMs,
        path: jev.path,
        stageCategory: jev.stageCategory,
        ...(jev.unavailable ? { unavailable: jev.unavailable } : {}),
      },
    });
  }

  const metrics = {
    baseline: groupMetrics(baselineOutcomes),
    jev: groupMetrics(jevOutcomes),
  };
  const bytes = {
    baseline: contextBytes(catalog.tools, baselineOutcomes),
    jev: contextBytes(catalog.tools, jevOutcomes),
  };
  const sampleRequest = rows.find((r) => r.expected)
    ? (
        await routeTask(tasks[0].task, catalog.tools, {
          transport: mockTransport,
        })
      ).requests[0]
    : null;
  const result = {
    version: "tool-router-bench-v1",
    mode,
    requestedModel: TOOL_ROUTER_MODEL,
    reportedModels: [...observed.models].sort(),
    startedAt,
    finishedAt: new Date().toISOString(),
    path,
    catalog: {
      tools: catalog.tools.length,
      categories: categoriesOf(catalog.tools),
      distractorPairs: catalog.distractorPairs,
    },
    taskCount: tasks.length,
    usage:
      mode === "live" && observed.tokensKnown
        ? {
            inputTokens: observed.inputTokens,
            outputTokens: observed.outputTokens,
          }
        : null,
    contextBytes: bytes,
    metrics,
    tasks: rows,
    sampleRequest,
  };
  await writeJsonAtomic(output, result);

  const modelLine =
    mode === "live"
      ? `Requested \`${TOOL_ROUTER_MODEL}\`; provider reported ${
          result.reportedModels.length
            ? result.reportedModels.map((m) => `\`${m}\``).join(", ")
            : "no model id"
        }.`
      : `Mock transport: a deterministic lexical stand-in for Jev. These numbers verify the harness, not Jev.`;
  process.stdout.write(
    [
      `Mode: **${mode}**. ${modelLine} Route path: ${path}. Started ${startedAt}.`,
      result.usage
        ? `Tokens: ${result.usage.inputTokens} input, ${result.usage.outputTokens} output across ${tasks.length} requests.`
        : "",
      "",
      metricsTable(
        "Baseline (lexical BM25-lite over name + snippet)",
        metrics.baseline,
        false,
      ),
      "",
      metricsTable(
        mode === "live" ? `Jev (${TOOL_ROUTER_MODEL})` : "Jev (mock transport)",
        metrics.jev,
        true,
      ),
      "",
      contextTable(catalog.tools.length, bytes.baseline, bytes.jev),
      "",
      `Results written to ${output}`,
    ]
      .filter((line) => line !== undefined)
      .join("\n") + "\n",
  );
  if (metrics.jev.total.unavailable) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Benchmark failed.");
  process.exitCode = 1;
});
