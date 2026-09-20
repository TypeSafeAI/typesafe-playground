/**
 * Base-vs-+Jev bench over fixtures/proposal-review.
 *
 *   pnpm exec tsx scripts/proposal-review-bench.ts            # mock transport, no credentials
 *   pnpm exec tsx scripts/proposal-review-bench.ts --live     # real Jev via TYPESAFE_API_KEY
 *
 * Runs every fixture × {good, bad} × {base, plus_jev}. `base` validates only
 * (no reviewer); `plus_jev` validates, then asks Jev the four questions.
 * Only synthetic fixture content is sent. Nothing is applied or executed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadFixtures } from "../lib/harness/load";
import { createMockTransport, MOCK_MODEL } from "../lib/harness/mock";
import { FixtureProposer } from "../lib/harness/proposer";
import { runProposalReview } from "../lib/harness/run";
import { JEV_MODEL, REVIEW_QUESTION_SET_VERSION } from "../lib/harness/review";
import { REVIEW_CONFIDENCE_THRESHOLD } from "../lib/harness/decide";
import {
  aggregateBench,
  benchRun,
  renderBenchTable,
  type BenchRun,
} from "../lib/harness/bench";
import type { JevTransport, Receipt } from "../lib/harness/types";

const usage =
  "Usage: pnpm exec tsx scripts/proposal-review-bench.ts [--live] [--output path.json]\n" +
  "Mock transport by default: no credentials and no provider calls. --live sends the synthetic fixtures to Jev using TYPESAFE_API_KEY from the environment.";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  let live = false;
  let output = resolve("docs/proposal-review-results.json");
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--live") live = true;
    else if (arg === "--output" && args[i + 1] && !args[i + 1].startsWith("--"))
      output = resolve(args[++i]);
    else throw Error(usage);
  }
  const fixtures = loadFixtures();
  const proposer = new FixtureProposer();
  let transport: JevTransport;
  if (live) {
    if (!process.env.TYPESAFE_API_KEY?.trim())
      throw Error(
        "--live needs TYPESAFE_API_KEY in the environment (for example via `op run --env-file=.env.1password -- …`). No request was sent.",
      );
    const { serverJevTransport } = await import("../lib/serverJev");
    transport = (payload, signal) => serverJevTransport(payload, signal, null);
  } else transport = createMockTransport(fixtures);
  const source = live ? "jev" : "mock";
  const runs: BenchRun[] = [];
  const receipts: Receipt[] = [];
  let model: string | null = null;
  for (const fixture of fixtures)
    for (const arm of ["good", "bad"] as const) {
      const base = await runProposalReview(fixture, proposer, null, {
        arm,
        mode: "base",
      });
      runs.push(benchRun(fixture, base.receipt));
      receipts.push(base.receipt);
      // Sequential on purpose: the server limiter allows two concurrent
      // requests per key, and a bench should not compete with the workspace.
      const plus = await runProposalReview(fixture, proposer, transport, {
        arm,
        mode: "plus_jev",
        source,
      });
      runs.push(benchRun(fixture, plus.receipt));
      receipts.push(plus.receipt);
      if (plus.receipt.jev?.answers && !model) model = plus.receipt.jev.model;
      if (live)
        process.stderr.write(
          `${fixture.id} ${arm}: ${plus.receipt.verdict}${plus.receipt.jev?.error ? ` (${plus.receipt.jev.error})` : ""}\n`,
        );
    }
  const aggregate = aggregateBench(runs);
  const table = renderBenchTable(aggregate);
  const at = new Date().toISOString();
  const result = {
    schemaVersion: 1,
    mode: live ? "live" : "mock",
    model: model ?? (live ? JEV_MODEL : MOCK_MODEL),
    requestedModel: JEV_MODEL,
    questionSetVersion: REVIEW_QUESTION_SET_VERSION,
    threshold: REVIEW_CONFIDENCE_THRESHOLD,
    at,
    fixtures: fixtures.length,
    rows: aggregate.rows,
    totals: aggregate.totals,
    runs,
    receipts,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(
    `${live ? "LIVE" : "MOCK"} · model ${result.model} · requested ${JEV_MODEL} · question set v${REVIEW_QUESTION_SET_VERSION} · threshold ${REVIEW_CONFIDENCE_THRESHOLD} · ${at}\n\n${table}\n\nWrote ${output}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
