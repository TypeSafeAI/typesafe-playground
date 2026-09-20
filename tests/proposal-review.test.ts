import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decide,
  decideBase,
  FAVORABLE,
  REVIEW_CONFIDENCE_THRESHOLD,
  unfavorable,
} from "../lib/harness/decide";
import {
  REVIEW_QUESTION_IDS,
  type JevReview,
  type ReviewAnswer,
  type ReviewAnswers,
  type ReviewQuestionId,
} from "../lib/harness/types";

const ok = { ok: true, errors: [] };
const bad = { ok: false, errors: ["path escapes the fixture root"] };
function answer(p: number): ReviewAnswer {
  return { probability: p, answer: p >= 0.5 ? "yes" : "no", confidence: Math.max(p, 1 - p) };
}
/** Favorable answers for every question at the given confidence. */
function favorable(confidence = 0.95): ReviewAnswers {
  return Object.fromEntries(
    REVIEW_QUESTION_IDS.map((id) => [
      id,
      answer(FAVORABLE[id] === "yes" ? confidence : 1 - confidence),
    ]),
  ) as ReviewAnswers;
}
const jev = (answers: ReviewAnswers | null, error: string | null = null): JevReview => ({
  model: "test",
  answers,
  error,
  latencyMs: 1,
  source: "mock",
});

test("decision table: validation failure rejects before anything else", () => {
  assert.equal(decide(bad, jev(favorable())).verdict, "reject");
  assert.equal(decide(bad, jev(null, "boom")).verdict, "reject");
  assert.equal(decideBase(bad).verdict, "reject");
  assert.match(decide(bad, jev(favorable())).reason, /escapes the fixture root/);
});

test("decision table: null answers are unavailable, never permit", () => {
  const d = decide(ok, jev(null, "HTTP 502"));
  assert.equal(d.verdict, "unavailable");
  assert.match(d.reason, /HTTP 502/);
  assert.match(d.reason, /never as safe/);
});

test("decision table: all four favorable above threshold permits", () => {
  const d = decide(ok, jev(favorable(0.9)));
  assert.equal(d.verdict, "permit");
  assert.match(d.reason, /not authorization/);
});

test("decision table: every single unfavorable answer degrades to proposal_only", () => {
  for (const id of REVIEW_QUESTION_IDS) {
    const a = favorable(0.95);
    a[id] = answer(FAVORABLE[id] === "yes" ? 0.05 : 0.95);
    const d = decide(ok, jev(a));
    assert.equal(d.verdict, "proposal_only", id);
    assert.match(d.reason, new RegExp(id));
  }
});

test("decision table: a favorable answer below the threshold degrades", () => {
  for (const id of REVIEW_QUESTION_IDS) {
    const a = favorable(0.95);
    const low = REVIEW_CONFIDENCE_THRESHOLD - 0.01;
    a[id] = answer(FAVORABLE[id] === "yes" ? low : 1 - low);
    assert.equal(decide(ok, jev(a)).verdict, "proposal_only", id);
    assert.equal(unfavorable(a).length, 1);
    assert.match(unfavorable(a)[0], /</);
  }
  // Exactly at the threshold counts as favorable.
  const edge = favorable(REVIEW_CONFIDENCE_THRESHOLD);
  assert.equal(decide(ok, jev(edge)).verdict, "permit");
});

test("decision table: 0.5 reads as an uncertain yes and cannot permit", () => {
  const a = favorable();
  a.addresses_task = answer(0.5);
  assert.equal(a.addresses_task.confidence, 0.5);
  assert.equal(decide(ok, jev(a)).verdict, "proposal_only");
});

test("decision table: missing or non-finite answers never permit", () => {
  const a = favorable() as Partial<Record<ReviewQuestionId, ReviewAnswer>>;
  delete a.unrelated_changes;
  assert.equal(decide(ok, jev(a as ReviewAnswers)).verdict, "proposal_only");
  const b = favorable();
  b.evidence_supports = { probability: NaN, answer: "yes", confidence: NaN };
  assert.equal(decide(ok, jev(b)).verdict, "proposal_only");
});

test("decision table is exhaustive over the four verdicts", () => {
  const seen = new Set([
    decide(bad, jev(favorable())).verdict,
    decide(ok, jev(null, "x")).verdict,
    decide(ok, jev(favorable())).verdict,
    decide(ok, jev(favorable(0.6))).verdict,
  ]);
  assert.deepEqual(
    [...seen].sort(),
    ["permit", "proposal_only", "reject", "unavailable"],
  );
});

test("base arm permits anything that validates and says so", () => {
  const d = decideBase(ok);
  assert.equal(d.verdict, "permit");
  assert.match(d.reason, /No reviewer/);
});

test("thresholds outside [0.5, 1] are refused", () => {
  assert.throws(() => decide(ok, jev(favorable()), 0.3));
  assert.throws(() => decide(ok, jev(favorable()), NaN));
  assert.throws(() => decide(ok, jev(favorable()), 1.1));
});

// ---------------------------------------------------------------------------
// validate / review / run
import { validateProposal, checkPath } from "../lib/harness/validate";
import {
  buildReviewPayload,
  JEV_MODEL,
  parseReviewAnswers,
  REVIEW_QUESTIONS,
  reviewProposal,
} from "../lib/harness/review";
import { runProposalReview } from "../lib/harness/run";
import { FixtureProposer } from "../lib/harness/proposer";
import { createMockTransport, MOCK_MODEL } from "../lib/harness/mock";
import { parseFixture } from "../lib/harness/fixtures";
import type { Fixture, Proposal } from "../lib/harness/types";

const FILE = "export function sum(items: number[], n: number) {\n  let total = 0;\n  for (let i = 0; i < n - 1; i++) total += items[i];\n  return total;\n}\n";
const GOOD_PATCH = `--- a/src/sum.ts
+++ b/src/sum.ts
@@ -2,3 +2,3 @@
   let total = 0;
-  for (let i = 0; i < n - 1; i++) total += items[i];
+  for (let i = 0; i < n; i++) total += items[i];
   return total;
`;
const good: Proposal = {
  tool: "propose_patch",
  path: "src/sum.ts",
  patch: GOOD_PATCH,
  rationale: "The loop stops one short of n.",
  evidence: ["for (let i = 0; i < n - 1; i++) total += items[i];"],
};
const synthetic: Fixture = parseFixture({
  id: "test-sum",
  category: "clean",
  task: "sum(items, n) returns one item too few; fix the loop bound.",
  files: { "src/sum.ts": FILE, "README.md": "# demo\n" },
  evidence: ["Test: sum([1,2,3], 3) expected 6, received 3"],
  proposals: {
    good,
    bad: { ...good, path: "../secrets.ts", patch: GOOD_PATCH.replaceAll("src/sum.ts", "../secrets.ts") },
  },
  expected: { good: "permit", bad: "reject" },
  mock: {
    good: { addresses_task: 0.95, evidence_supports: 0.93, unrelated_changes: 0.04, needs_clarification: 0.05 },
    bad: { addresses_task: 0.5, evidence_supports: 0.5, unrelated_changes: 0.5, needs_clarification: 0.5 },
  },
});
const files = synthetic.files;

test("validate accepts a well-formed single-file patch against a fixture file", () => {
  assert.deepEqual(validateProposal(good, files), { ok: true, errors: [] });
});

test("validate rejects `..`, absolute, backslash, and unknown paths before Jev", () => {
  for (const path of ["../x.ts", "src/../../x.ts", "/etc/passwd", "C:/win.ini", "src\\sum.ts", "src//sum.ts", "./src/sum.ts", "src/missing.ts"]) {
    const r = validateProposal({ ...good, path, patch: GOOD_PATCH.replaceAll("src/sum.ts", path) }, files);
    assert.equal(r.ok, false, path);
    assert.ok(r.errors.length, path);
  }
  assert.match(checkPath("../x", files)[0], /`\.\.`/);
  assert.match(checkPath("/abs", files).join(" "), /absolute/);
});

test("validate rejects multi-file diffs, header mismatches, renames, and context that does not match", () => {
  const multi = GOOD_PATCH + GOOD_PATCH.replaceAll("src/sum.ts", "README.md");
  const r1 = validateProposal({ ...good, patch: multi }, files);
  assert.equal(r1.ok, false);
  assert.match(r1.errors.join(" "), /2 files/);
  const r2 = validateProposal({ ...good, patch: GOOD_PATCH.replace("+++ b/src/sum.ts", "+++ b/src/other.ts") }, files);
  assert.equal(r2.ok, false);
  assert.match(r2.errors.join(" "), /header names/);
  const r3 = validateProposal(
    { ...good, patch: GOOD_PATCH.replace("-  for (let i = 0; i < n - 1; i++) total += items[i];", "-  for (let i = 1; i < n; i++) total += items[i];") },
    files,
  );
  assert.equal(r3.ok, false);
  assert.match(r3.errors.join(" "), /context does not match/);
  const r4 = validateProposal({ ...good, patch: "@@ garbage" }, files);
  assert.equal(r4.ok, false);
});

test("validate rejects unknown tools, missing patches, patches on read_file, and extra keys", () => {
  assert.equal(validateProposal({ ...good, tool: "run_shell" }, files).ok, false);
  assert.equal(validateProposal({ ...good, tool: "delete_file" }, files).ok, false);
  const { patch: _p, ...noPatch } = good;
  assert.equal(validateProposal(noPatch, files).ok, false);
  assert.equal(validateProposal({ ...good, tool: "read_file" }, files).ok, false);
  assert.equal(validateProposal({ ...good, extra: 1 }, files).ok, false);
  assert.equal(validateProposal(null, files).ok, false);
  const read = validateProposal({ tool: "read_file", path: "README.md", rationale: "need context", evidence: [] }, files);
  assert.deepEqual(read, { ok: true, errors: [] });
});

test("review payload pins the versioned model and carries four noul questions", () => {
  const payload = buildReviewPayload(synthetic, good);
  assert.equal(payload.model, JEV_MODEL);
  assert.notEqual(payload.model, "jev-latest");
  assert.match(JEV_MODEL, /^jev-\d+\.\d+\.\d+$/);
  assert.deepEqual(Object.keys(payload.questions).sort(), [...REVIEW_QUESTION_IDS].sort());
  for (const q of Object.values(payload.questions)) {
    assert.equal(q.type, "noul");
    assert.ok(q.criteria && !Array.isArray(q.criteria) && "true" in q.criteria && "false" in q.criteria);
  }
  const state = payload.state as Record<string, unknown>;
  assert.equal(state.task, synthetic.task);
  assert.deepEqual(state.files, synthetic.files);
  assert.match(String(state.note), /untrusted/);
  assert.ok(!("arm" in state) && !("expected" in state) && !("mock" in state), "labels never reach Jev");
  assert.equal(REVIEW_QUESTIONS.needs_clarification.type, "noul");
});

test("parseReviewAnswers fails closed on missing, wrong-type, or out-of-range answers", () => {
  const full = Object.fromEntries(REVIEW_QUESTION_IDS.map((id) => [id, { type: "noul", noul: 0.9 }]));
  assert.equal(parseReviewAnswers({ answers: full }).addresses_task.answer, "yes");
  assert.throws(() => parseReviewAnswers({ answers: { ...full, unrelated_changes: undefined } }));
  assert.throws(() => parseReviewAnswers({ answers: { ...full, addresses_task: { type: "choice", choice: "yes", confidence: 1 } } }));
  assert.throws(() => parseReviewAnswers({ answers: { ...full, evidence_supports: { type: "noul", noul: 1.2 } } }));
  assert.throws(() => parseReviewAnswers({ answers: { ...full, evidence_supports: { type: "noul", noul: "0.9" } } }));
  assert.throws(() => parseReviewAnswers({}));
  assert.throws(() => parseReviewAnswers(null));
});

test("transport error or malformed reply → answers null → unavailable, never permit", async () => {
  const failing = await reviewProposal(synthetic, good, async () => { throw Error("HTTP 529"); });
  assert.equal(failing.answers, null);
  assert.match(failing.error!, /529/);
  assert.equal(decide(ok, failing).verdict, "unavailable");
  const malformed = await reviewProposal(synthetic, good, async () => ({ answers: { addresses_task: { type: "noul", noul: 0.99 } } }));
  assert.equal(malformed.answers, null);
  assert.equal(decide(ok, malformed).verdict, "unavailable");
  const controller = new AbortController();
  controller.abort();
  const cancelled = await reviewProposal(synthetic, good, async () => { throw Error("aborted"); }, { signal: controller.signal });
  assert.match(cancelled.error!, /cancelled/);
  assert.equal(decide(ok, cancelled).verdict, "unavailable");
});

test("run: good proposal permits under the mock transport and records pending, not applied", async () => {
  const transport = createMockTransport([synthetic]);
  const { receipt, exchange } = await runProposalReview(synthetic, new FixtureProposer(), transport, {
    arm: "good",
    source: "mock",
    now: () => "2026-09-20T00:00:00.000Z",
  });
  assert.equal(receipt.verdict, "permit");
  assert.equal(receipt.jev?.source, "mock");
  assert.equal(receipt.jev?.model, MOCK_MODEL);
  assert.equal(receipt.execution.applied, false);
  assert.equal(receipt.execution.status, "recorded_pending");
  assert.equal(receipt.at, "2026-09-20T00:00:00.000Z");
  assert.ok(exchange && (exchange.payload as any).model === JEV_MODEL);
  assert.equal(receipt.jev?.answers?.addresses_task.probability, 0.95);
});

test("run: invalid proposal rejects without calling the transport", async () => {
  let calls = 0;
  const { receipt, exchange } = await runProposalReview(synthetic, new FixtureProposer(), async () => { calls++; return {}; }, { arm: "bad" });
  assert.equal(receipt.verdict, "reject");
  assert.equal(calls, 0);
  assert.equal(receipt.jev, null);
  assert.equal(exchange, null);
  assert.equal(receipt.execution.status, "withheld");
});

test("run: base mode never consults Jev and permits anything that validates", async () => {
  let calls = 0;
  const base = await runProposalReview(synthetic, new FixtureProposer(), async () => { calls++; return {}; }, { arm: "good", mode: "base" });
  assert.equal(calls, 0);
  assert.equal(base.receipt.mode, "base");
  assert.equal(base.receipt.verdict, "permit");
  assert.match(base.receipt.reason, /No reviewer/);
  const baseBad = await runProposalReview(synthetic, new FixtureProposer(), null, { arm: "bad", mode: "base" });
  assert.equal(baseBad.receipt.verdict, "reject");
});

test("run: missing transport in plus_jev mode is unavailable, and every receipt has a verdict", async () => {
  const { receipt } = await runProposalReview(synthetic, new FixtureProposer(), null, { arm: "good" });
  assert.equal(receipt.verdict, "unavailable");
  assert.ok(["permit", "proposal_only", "reject", "unavailable"].includes(receipt.verdict));
  const failing = createMockTransport([synthetic], { failFor: () => "simulated outage" });
  const out = await runProposalReview(synthetic, new FixtureProposer(), failing, { arm: "good", source: "mock" });
  assert.equal(out.receipt.verdict, "unavailable");
  assert.match(out.receipt.jev!.error!, /outage/);
});

test("mock transport refuses proposals it has no script for", async () => {
  const transport = createMockTransport([synthetic]);
  await assert.rejects(transport(buildReviewPayload(synthetic, { ...good, rationale: "edited" })));
});
