import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { decide } from "../lib/harness/decide";
import { buildReviewPayload, JEV_MODEL, reviewProposal } from "../lib/harness/review";
import { loadFixtures } from "../lib/harness/load";
import * as harness from "../lib/harness";

const root = resolve(import.meta.dirname, "..");
const vendor = "lib/vendor/jev-harness";
const fixture = loadFixtures().find(f => f.category === "clean")!;
const favorable = {
  model: JEV_MODEL,
  answers: {
    addresses_task: { type: "noul", noul: 0.95 },
    evidence_supports: { type: "noul", noul: 0.95 },
    unrelated_changes: { type: "noul", noul: 0.05 },
    needs_clarification: { type: "noul", noul: 0.05 },
  },
};

test("vendored harness has a complete pinned source manifest and unchanged bytes", () => {
  const manifestPath = resolve(root, vendor, "manifest.json");
  assert.ok(existsSync(manifestPath), "a full upstream commit and file hashes must accompany the vendored source");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    repository: string;
    revision: string;
    status: string;
    extractedFrom: { repository: string; revision: string };
    files: Array<{ source: string; destination: string; sha256: string }>;
  };
  assert.equal(manifest.repository, "TypeSafeAI/jev-harness");
  assert.equal(manifest.revision, "a8a1a45a147c06abd197ff5d6004fb78e682e3a6");
  assert.equal(manifest.status, "merged");
  assert.deepEqual(manifest.extractedFrom, {
    repository: "TypeSafeAI/typesafe-playground",
    revision: "6fe5967dc020521a0731682b06c4d8eeeab95ffb",
  });
  const modules = {
    contract: ["index", "types", "input", "decide", "payload", "diff", "validate", "review"],
    benchmark: ["index", "bench", "fixtures", "mock", "proposer", "run"],
  };
  const sources = ["LICENSE", ...Object.entries(modules).flatMap(([dir, files]) => files.map(file => `src/${dir}/${file}.ts`)),
    ...readdirSync(resolve(root, "fixtures/proposal-review")).filter(file => file.endsWith(".json")).map(file => `fixtures/proposal-review/${file}`)];
  assert.deepEqual(manifest.files.map(file => file.source).sort(), sources.sort());
  for (const file of manifest.files) {
    const expectedDestination = file.source.startsWith("fixtures/") ? file.source : `${vendor}/${file.source}`;
    assert.equal(file.destination, expectedDestination);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    const bytes = readFileSync(resolve(root, file.destination));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, file.destination);
  }
});

test("host decisions reject inconsistent evidence triples from external callers", async () => {
  const review = await reviewProposal(fixture, fixture.proposals.good, async () => favorable);
  assert.equal(decide({ ok: true, errors: [] }, review).verdict, "permit");
  assert.ok(review.answers);
  const inconsistent = { ...review, answers: { ...review.answers,
    addresses_task: { probability: 0.05, answer: "yes" as const, confidence: 0.95 },
  } };
  assert.equal(decide({ ok: true, errors: [] }, inconsistent).verdict, "proposal_only");
  assert.equal(decide({ ok: true, errors: ["a validation error"] }, review).verdict, "reject");
});

test("host v1 payload is instruction-only before it reaches the HTTP transport", () => {
  const payload = buildReviewPayload(fixture, fixture.proposals.good);
  assert.equal(payload.model, JEV_MODEL);
  for (const question of Object.values(payload.questions))
    assert.deepEqual(Object.keys(question).sort(), ["instructions", "type"]);
});

test("host review withholds responses whose model metadata is missing or mismatched", async () => {
  for (const model of [undefined, "jev-latest", "jev-1.12.0"]) {
    const response = { ...favorable, model };
    const review = await reviewProposal(fixture, fixture.proposals.good, async () => response);
    assert.equal(decide({ ok: true, errors: [] }, review).verdict, "unavailable");
    assert.equal(review.answers, null);
  }
});

test("the host's shared barrel excludes the base verdict helper and Node fixture loader", () => {
  assert.equal("decideBase" in harness, false);
  assert.equal("loadFixtures" in harness, false);
});

test("host review withholds a pre-aborted request without calling its transport", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const review = await reviewProposal(fixture, fixture.proposals.good, async () => {
    calls++;
    return favorable;
  }, { signal: controller.signal });
  assert.equal(calls, 0);
  assert.equal(review.answers, null);
  assert.match(review.error!, /cancelled/);
  assert.equal(decide({ ok: true, errors: [] }, review).verdict, "unavailable");
});

test("host review withholds favorable answers from a transport that ignores cancellation", async () => {
  const controller = new AbortController();
  let respond!: (value: typeof favorable) => void;
  const pending = new Promise<typeof favorable>((resolve) => { respond = resolve; });
  let calls = 0;
  const reviewing = reviewProposal(fixture, fixture.proposals.good, async () => {
    calls++;
    return pending;
  }, { signal: controller.signal });
  assert.equal(calls, 1);
  controller.abort();
  respond(favorable);
  const review = await reviewing;
  assert.equal(review.answers, null);
  assert.match(review.error!, /cancelled/);
  assert.equal(decide({ ok: true, errors: [] }, review).verdict, "unavailable");
});
