/**
 * Pure aggregation for the base-vs-+Jev bench. No fs, no fetch: the script
 * in scripts/proposal-review-bench.ts feeds receipts in and prints what comes
 * out, so the numbers are testable without running anything.
 *
 * Definitions the table reports:
 *   bad caught     a `bad` arm ended in proposal_only or reject
 *   good blocked   a `good` arm ended in proposal_only or reject
 *   unavailable    either arm ended in unavailable (Jev not consulted or failed)
 *   mean Jev ms    mean review latency over runs where Jev returned answers
 */
import { FIXTURE_CATEGORIES } from "./fixtures";
import type {
  Fixture,
  FixtureCategory,
  Receipt,
  ReviewArm,
  ReviewMode,
  ReviewVerdict,
} from "./types";

export interface BenchRun {
  fixtureId: string;
  category: FixtureCategory;
  arm: ReviewArm;
  mode: ReviewMode;
  verdict: ReviewVerdict;
  expected: ReviewVerdict;
  /** Review latency when Jev returned answers; null otherwise. */
  jevLatencyMs: number | null;
  jevError: string | null;
}

export interface ModeStats {
  runs: number;
  badTotal: number;
  badCaught: number;
  goodTotal: number;
  goodBlocked: number;
  unavailable: number;
  /** Runs whose verdict equals the fixture's expected verdict. */
  expectedMet: number;
  jevAnswered: number;
  meanJevLatencyMs: number | null;
}

export interface BenchRow {
  category: FixtureCategory | "total";
  fixtures: number;
  base: ModeStats;
  plusJev: ModeStats;
}

export interface BenchAggregate {
  rows: BenchRow[];
  totals: BenchRow;
}

const BLOCKING: ReadonlySet<ReviewVerdict> = new Set(["proposal_only", "reject"]);

export function benchRun(fixture: Fixture, receipt: Receipt): BenchRun {
  if (receipt.fixtureId !== fixture.id)
    throw Error(
      `Receipt for ${receipt.fixtureId} does not belong to fixture ${fixture.id}.`,
    );
  return {
    fixtureId: fixture.id,
    category: fixture.category,
    arm: receipt.arm,
    mode: receipt.mode,
    verdict: receipt.verdict,
    expected: fixture.expected[receipt.arm],
    jevLatencyMs:
      receipt.jev && receipt.jev.answers !== null ? receipt.jev.latencyMs : null,
    jevError: receipt.jev?.error ?? null,
  };
}

function emptyStats(): ModeStats {
  return {
    runs: 0,
    badTotal: 0,
    badCaught: 0,
    goodTotal: 0,
    goodBlocked: 0,
    unavailable: 0,
    expectedMet: 0,
    jevAnswered: 0,
    meanJevLatencyMs: null,
  };
}

function statsFor(runs: BenchRun[]): ModeStats {
  const s = emptyStats();
  let latency = 0;
  for (const run of runs) {
    s.runs++;
    if (run.arm === "bad") {
      s.badTotal++;
      if (BLOCKING.has(run.verdict)) s.badCaught++;
    } else {
      s.goodTotal++;
      if (BLOCKING.has(run.verdict)) s.goodBlocked++;
    }
    if (run.verdict === "unavailable") s.unavailable++;
    if (run.verdict === run.expected) s.expectedMet++;
    if (run.jevLatencyMs !== null && Number.isFinite(run.jevLatencyMs)) {
      s.jevAnswered++;
      latency += run.jevLatencyMs;
    }
  }
  s.meanJevLatencyMs = s.jevAnswered ? Math.round(latency / s.jevAnswered) : null;
  return s;
}

function rowFor(category: BenchRow["category"], runs: BenchRun[]): BenchRow {
  return {
    category,
    fixtures: new Set(runs.map((r) => r.fixtureId)).size,
    base: statsFor(runs.filter((r) => r.mode === "base")),
    plusJev: statsFor(runs.filter((r) => r.mode === "plus_jev")),
  };
}

/** One row per category (in the fixed category order) plus a totals row. */
export function aggregateBench(runs: BenchRun[]): BenchAggregate {
  const seen = new Set<string>();
  for (const run of runs) {
    const key = `${run.fixtureId}|${run.arm}|${run.mode}`;
    if (seen.has(key)) throw Error(`Duplicate bench run ${key}.`);
    seen.add(key);
  }
  const rows = FIXTURE_CATEGORIES.filter((c) =>
    runs.some((r) => r.category === c),
  ).map((c) => rowFor(c, runs.filter((r) => r.category === c)));
  return { rows, totals: rowFor("total", runs) };
}

const ratio = (n: number, total: number) => (total ? `${n}/${total}` : "—");
const ms = (v: number | null) => (v === null ? "—" : String(v));

/** Markdown table: one row per category, then totals. */
export function renderBenchTable({ rows, totals }: BenchAggregate): string {
  const header = [
    "Category",
    "Fixtures",
    "Bad caught · base",
    "Bad caught · +Jev",
    "Good blocked · base",
    "Good blocked · +Jev",
    "Unavailable · +Jev",
    "Mean Jev ms",
  ];
  const line = (row: BenchRow) => [
    row.category === "total" ? "**Total**" : row.category,
    String(row.fixtures),
    ratio(row.base.badCaught, row.base.badTotal),
    ratio(row.plusJev.badCaught, row.plusJev.badTotal),
    ratio(row.base.goodBlocked, row.base.goodTotal),
    ratio(row.plusJev.goodBlocked, row.plusJev.goodTotal),
    ratio(row.plusJev.unavailable, row.plusJev.runs),
    ms(row.plusJev.meanJevLatencyMs),
  ];
  const table = [header, header.map(() => "---"), ...rows.map(line), line(totals)];
  return table.map((cells) => `| ${cells.join(" | ")} |`).join("\n");
}
