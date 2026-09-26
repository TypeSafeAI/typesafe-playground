import { jsonBytes } from "./catalog";
import type { TaskFixture, ToolSnippet } from "./types";

/** One task's routing outcome, from either the baseline or Jev. */
export interface TaskOutcome {
  id: string;
  category: string | null;
  expected: string | null;
  acceptable: string[];
  top1: string | null;
  top3: string[];
  none: boolean;
  unavailable?: string;
  latencyMs?: number;
}

export interface Metrics {
  tasks: number;
  /** Tasks whose expected answer is a tool (the accuracy denominator). */
  withTool: number;
  top1Exact: number;
  top1Acceptable: number;
  top3: number;
  noneTruePositive: number;
  noneFalsePositive: number;
  noneFalseNegative: number;
  unavailable: number;
  meanLatencyMs: number | null;
}

export const NONE_CATEGORY = "none";

export function outcomeOf(
  task: TaskFixture,
  result: {
    top1: string | null;
    top3: string[];
    none: boolean;
    unavailable?: string;
    latencyMs?: number;
  },
): TaskOutcome {
  return {
    id: task.id,
    category: task.category,
    expected: task.expected,
    acceptable: task.acceptable,
    top1: result.top1,
    top3: result.top3,
    none: result.none,
    ...(result.unavailable ? { unavailable: result.unavailable } : {}),
    ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
  };
}

export function scoreOutcomes(outcomes: TaskOutcome[]): Metrics {
  const m: Metrics = {
    tasks: outcomes.length,
    withTool: 0,
    top1Exact: 0,
    top1Acceptable: 0,
    top3: 0,
    noneTruePositive: 0,
    noneFalsePositive: 0,
    noneFalseNegative: 0,
    unavailable: 0,
    meanLatencyMs: null,
  };
  const latencies: number[] = [];
  for (const o of outcomes) {
    if (o.unavailable) m.unavailable++;
    else if (o.latencyMs !== undefined) latencies.push(o.latencyMs);
    const predictedNone = !o.unavailable && o.none;
    if (o.expected === null) {
      if (predictedNone) m.noneTruePositive++;
      else m.noneFalseNegative++;
      continue;
    }
    m.withTool++;
    if (predictedNone) m.noneFalsePositive++;
    if (o.unavailable || o.none) continue;
    if (o.top1 === o.expected) m.top1Exact++;
    if (o.top1 !== null && o.acceptable.includes(o.top1)) m.top1Acceptable++;
    if (o.top3.includes(o.expected)) m.top3++;
  }
  if (latencies.length)
    m.meanLatencyMs = Math.round(
      latencies.reduce((a, b) => a + b, 0) / latencies.length,
    );
  return m;
}

export function groupMetrics(outcomes: TaskOutcome[]) {
  const byCategory: Record<string, Metrics> = {};
  const categories = [
    ...new Set(outcomes.map((o) => o.category ?? NONE_CATEGORY)),
  ].sort((a, b) =>
    a === NONE_CATEGORY ? 1 : b === NONE_CATEGORY ? -1 : a.localeCompare(b),
  );
  for (const category of categories)
    byCategory[category] = scoreOutcomes(
      outcomes.filter((o) => (o.category ?? NONE_CATEGORY) === category),
    );
  return { byCategory, total: scoreOutcomes(outcomes) };
}

export interface ContextBytes {
  /** Every full schema, what a router-less agent would load. */
  allSchemas: number;
  /** Name + snippet for every tool, what the router itself costs. */
  snippetsOnly: number;
  /** Mean per task of snippetsOnly plus the top-3 schemas (all schemas when unavailable, none when routed to `none`). */
  meanSnippetsPlusTop3: number;
  /** Same with only the top-1 schema. */
  meanSnippetsPlusTop1: number;
}

export function contextBytes(
  tools: ToolSnippet[],
  outcomes: TaskOutcome[],
): ContextBytes {
  const schemaBytes = new Map(
    tools.map((t) => [t.name, jsonBytes({ name: t.name, schema: t.schema })]),
  );
  const allSchemas = [...schemaBytes.values()].reduce((a, b) => a + b, 0);
  const snippetsOnly = jsonBytes(
    tools.map((t) => ({ name: t.name, snippet: t.snippet })),
  );
  const loaded = (names: string[], o: TaskOutcome) =>
    o.unavailable
      ? allSchemas
      : names.reduce((sum, n) => sum + (schemaBytes.get(n) ?? 0), 0);
  const mean = (values: number[]) =>
    values.length
      ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
      : 0;
  return {
    allSchemas,
    snippetsOnly,
    meanSnippetsPlusTop3: mean(
      outcomes.map((o) => snippetsOnly + loaded(o.none ? [] : o.top3, o)),
    ),
    meanSnippetsPlusTop1: mean(
      outcomes.map(
        (o) =>
          snippetsOnly + loaded(o.none || o.top1 === null ? [] : [o.top1], o),
      ),
    ),
  };
}

const ratio = (hits: number, total: number) =>
  total ? `${((100 * hits) / total).toFixed(1)}% (${hits}/${total})` : "n/a";

export function metricsRow(label: string, m: Metrics, latency: boolean) {
  const cells = [
    label,
    String(m.tasks),
    ratio(m.top1Exact, m.withTool),
    ratio(m.top1Acceptable, m.withTool),
    ratio(m.top3, m.withTool),
    ratio(m.noneTruePositive, m.noneTruePositive + m.noneFalsePositive),
    ratio(m.noneTruePositive, m.noneTruePositive + m.noneFalseNegative),
    String(m.unavailable),
  ];
  if (latency)
    cells.push(m.meanLatencyMs === null ? "n/a" : String(m.meanLatencyMs));
  return cells;
}

export function markdownTable(header: string[], rows: string[][]) {
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join(
    "\n",
  );
}

export function metricsTable(
  title: string,
  grouped: ReturnType<typeof groupMetrics>,
  latency: boolean,
) {
  const header = [
    "Category",
    "Tasks",
    "Top-1",
    "Top-1 (acceptable)",
    "Top-3",
    "None precision",
    "None recall",
    "Unavailable",
    ...(latency ? ["Mean Jev ms"] : []),
  ];
  const rows = Object.entries(grouped.byCategory).map(([category, m]) =>
    metricsRow(category, m, latency),
  );
  rows.push(metricsRow("**Total**", grouped.total, latency));
  return `### ${title}\n\n${markdownTable(header, rows)}`;
}

export function contextTable(
  toolCount: number,
  baseline: ContextBytes,
  jev: ContextBytes,
) {
  const pct = (n: number) => `${((100 * n) / baseline.allSchemas).toFixed(1)}%`;
  const rows: string[][] = [
    [
      `All ${toolCount} full schemas`,
      String(baseline.allSchemas),
      pct(baseline.allSchemas),
    ],
    [
      "Snippets only (router input)",
      String(baseline.snippetsOnly),
      pct(baseline.snippetsOnly),
    ],
    [
      "Snippets + baseline top-3 schemas",
      String(baseline.meanSnippetsPlusTop3),
      pct(baseline.meanSnippetsPlusTop3),
    ],
    [
      "Snippets + baseline top-1 schema",
      String(baseline.meanSnippetsPlusTop1),
      pct(baseline.meanSnippetsPlusTop1),
    ],
    [
      "Snippets + Jev top-3 schemas",
      String(jev.meanSnippetsPlusTop3),
      pct(jev.meanSnippetsPlusTop3),
    ],
    [
      "Snippets + Jev top-1 schema",
      String(jev.meanSnippetsPlusTop1),
      pct(jev.meanSnippetsPlusTop1),
    ],
  ];
  return `### Context bytes (mean per task)\n\n${markdownTable(["Strategy", "Bytes", "Of all schemas"], rows)}`;
}
