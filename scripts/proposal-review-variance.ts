/**
 * Variance analysis over several live proposal-review bench runs.
 *
 *   pnpm exec tsx scripts/proposal-review-variance.ts [run1.json run2.json ...]
 *
 * Defaults to run 1 (docs/proposal-review-results.live.json) plus
 * docs/proposal-review-runs/live-2026-09-22-r2..r4.json. Pure Node: reads the
 * bench JSON files and prints Markdown tables. No network, no provider calls,
 * nothing applied or executed. The pooled threshold sweep re-applies the
 * decision table in lib/harness/decide.ts to the recorded answers; it does not
 * change the threshold constant.
 */
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { decide } from "../lib/harness/decide";
import { REVIEW_QUESTION_IDS, type Receipt, type ReviewQuestionId } from "../lib/harness/types";
import type { ModeStats } from "../lib/harness/bench";

interface BenchFile {
  mode: string;
  model: string;
  at: string;
  threshold: number;
  totals: { base: ModeStats; plusJev: ModeStats };
  receipts: Receipt[];
}

interface Run {
  label: string;
  path: string;
  file: BenchFile;
  /** plus_jev receipts keyed by `${fixtureId}|${arm}`. */
  plus: Map<string, Receipt>;
}

const DEFAULT_RUNS = [
  "docs/proposal-review-results.live.json",
  "docs/proposal-review-runs/live-2026-09-22-r2.json",
  "docs/proposal-review-runs/live-2026-09-22-r3.json",
  "docs/proposal-review-runs/live-2026-09-22-r4.json",
];

const SWEEP_THRESHOLDS = Array.from({ length: 9 }, (_, i) => Number((0.5 + i * 0.05).toFixed(2)));

const md = (rows: string[][]) =>
  rows.length
    ? [rows[0], rows[0].map(() => "---"), ...rows.slice(1)]
        .map((cells) => `| ${cells.join(" | ")} |`)
        .join("\n")
    : "";
const ratio = (n: number, total: number) => `${n}/${total}`;
const fmt = (v: number, digits = 3) => v.toFixed(digits);

function loadRun(path: string, index: number): Run {
  const file = JSON.parse(readFileSync(path, "utf8")) as BenchFile;
  if (file.mode !== "live")
    throw Error(`${path}: mode is ${file.mode}, expected live.`);
  if (!Array.isArray(file.receipts))
    throw Error(`${path}: no receipts array.`);
  const plus = new Map<string, Receipt>();
  for (const r of file.receipts) {
    if (r.mode !== "plus_jev") continue;
    const key = `${r.fixtureId}|${r.arm}`;
    if (plus.has(key)) throw Error(`${path}: duplicate +Jev receipt ${key}.`);
    plus.set(key, r);
  }
  return { label: `run ${index + 1}`, path, file, plus };
}

function sampleStddev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const ss = values.reduce((acc, v) => acc + (v - mean) ** 2, 0);
  return Math.sqrt(ss / (values.length - 1));
}

function main() {
  const paths = (process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_RUNS).map((p) =>
    resolve(p),
  );
  const runs = paths.map(loadRun);
  const n = runs.length;
  const keys = [...runs[0].plus.keys()].sort();
  for (const run of runs) {
    const missing = keys.filter((k) => !run.plus.has(k));
    const extra = [...run.plus.keys()].filter((k) => !runs[0].plus.has(k));
    if (missing.length || extra.length)
      throw Error(`${run.path}: +Jev receipt set differs from ${runs[0].path} (missing ${missing.length}, extra ${extra.length}).`);
  }
  const out: string[] = [];

  // (a) Per-run totals
  out.push(`**Per-run totals (+Jev arm, threshold ${runs[0].file.threshold}).**`, "");
  out.push(
    md([
      ["Run", "File", "Model", "At", "Bad caught · +Jev", "Good blocked · +Jev", "Unavailable · +Jev", "Mean Jev ms"],
      ...runs.map((r) => {
        const t = r.file.totals.plusJev;
        return [
          r.label,
          `\`${basename(r.path)}\``,
          r.file.model,
          r.file.at,
          ratio(t.badCaught, t.badTotal),
          ratio(t.goodBlocked, t.goodTotal),
          ratio(t.unavailable, t.runs),
          String(t.meanJevLatencyMs ?? "—"),
        ];
      }),
    ]),
    "",
  );

  // (b) Verdict stability
  const flipped: { key: string; verdicts: string[] }[] = [];
  let stable = 0;
  for (const key of keys) {
    const verdicts = runs.map((r) => r.plus.get(key)!.verdict);
    if (verdicts.every((v) => v === verdicts[0])) stable++;
    else flipped.push({ key, verdicts });
  }
  out.push(`**Verdict stability (+Jev arm).** ${stable}/${keys.length} (fixture, arm) pairs had the same verdict in all ${n} runs.`, "");
  if (flipped.length) {
    out.push(
      md([
        ["Fixture", "Arm", ...runs.map((r) => r.label)],
        ...flipped.map(({ key, verdicts }) => {
          const [fixtureId, arm] = key.split("|");
          return [fixtureId, arm, ...verdicts];
        }),
      ]),
      "",
    );
  }

  // (c) Answer flips
  const flipRows: string[][] = [];
  let totalFlips = 0;
  let answeredKeys = 0;
  for (const key of keys) {
    const receipts = runs.map((r) => r.plus.get(key)!);
    const answered = receipts.filter((r) => r.jev && r.jev.answers !== null);
    if (!answered.length) continue;
    answeredKeys++;
    const [fixtureId, arm] = key.split("|");
    for (const id of REVIEW_QUESTION_IDS) {
      const answers = answered.map((r) => r.jev!.answers![id].answer);
      const yes = answers.filter((a) => a === "yes").length;
      const majority = Math.max(yes, answers.length - yes);
      const flips = answers.length - majority;
      if (flips >= 1) {
        totalFlips += flips;
        flipRows.push([
          fixtureId,
          arm,
          id,
          runs
            .map((r) => {
              const a = r.plus.get(key)!.jev?.answers?.[id];
              return a ? `${a.answer} ${Math.round(a.confidence * 100)}%` : "—";
            })
            .join(" / "),
          String(flips),
        ]);
      }
    }
  }
  out.push(
    `**Answer flips (+Jev arm, ${answeredKeys} (fixture, arm) pairs × ${REVIEW_QUESTION_IDS.length} questions).** A flip is one run disagreeing with the majority yes/no reading across the ${n} runs; a 2–2 split counts as 2. Total flips: **${totalFlips}** over ${answeredKeys * REVIEW_QUESTION_IDS.length} (fixture, arm, question) triples${flipRows.length ? "" : "; none flipped"}.`,
    "",
  );
  if (flipRows.length)
    out.push(
      md([["Fixture", "Arm", "Question", `Answers (${runs.map((r) => r.label).join(" / ")})`, "Flips"], ...flipRows]),
      "",
    );

  // (d) Confidence spread per question
  const spreadRows: string[][] = [];
  for (const id of REVIEW_QUESTION_IDS) {
    const values: number[] = [];
    for (const run of runs)
      for (const r of run.plus.values())
        if (r.jev && r.jev.answers !== null) values.push(r.jev.answers[id].confidence);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    spreadRows.push([
      `\`${id}\``,
      String(values.length),
      fmt(mean),
      fmt(Math.min(...values)),
      fmt(Math.max(...values)),
      fmt(sampleStddev(values, mean)),
    ]);
  }
  out.push(`**Confidence spread per question (all ${n} runs, every +Jev receipt where Jev answered).** Confidence is max(p, 1 − p).`, "");
  out.push(md([["Question", "n", "Mean", "Min", "Max", "Sample stddev"], ...spreadRows]), "");

  // (e) Pooled threshold sweep
  const goodTotal = keys.filter((k) => k.endsWith("|good")).length * n;
  const badTotal = keys.filter((k) => k.endsWith("|bad")).length * n;
  const sweepRows: string[][] = [];
  let badPermittedAtOrBelowConstant = 0;
  for (const threshold of SWEEP_THRESHOLDS) {
    let goodPermitted = 0;
    let badPermitted = 0;
    const badIds = new Set<string>();
    for (const run of runs)
      for (const r of run.plus.values()) {
        if (decide(r.validation, r.jev, threshold).verdict !== "permit") continue;
        if (r.arm === "good") goodPermitted++;
        else {
          badPermitted++;
          badIds.add(`${r.fixtureId} (${run.label})`);
        }
      }
    if (threshold <= runs[0].file.threshold) badPermittedAtOrBelowConstant += badPermitted;
    sweepRows.push([
      threshold.toFixed(2) + (threshold === runs[0].file.threshold ? " (current)" : ""),
      ratio(goodPermitted, goodTotal),
      ratio(badPermitted, badTotal),
      badIds.size ? [...badIds].join(", ") : "—",
    ]);
  }
  out.push(
    `**Pooled threshold sweep (post hoc, ${n} runs × ${keys.length} +Jev receipts).** Re-applies the decision table to the recorded answers: all four favorable and every confidence ≥ threshold → permit; anything else → proposal_only; validation rejects stay reject; unavailable stays unavailable.`,
    "",
  );
  out.push(md([["Threshold", `Good permitted /${goodTotal}`, `Bad permitted /${badTotal}`, "Bad permitted (fixture, run)"], ...sweepRows]), "");
  out.push(
    badPermittedAtOrBelowConstant
      ? `**Warning:** ${badPermittedAtOrBelowConstant} bad-arm receipt(s) would be permitted at a threshold ≤ ${runs[0].file.threshold}. See the rows above.`
      : `No bad proposal is permitted at any threshold in the sweep; on these ${n} runs the threshold only moves good proposals.`,
  );

  process.stdout.write(`${out.join("\n")}\n`);
}

main();
