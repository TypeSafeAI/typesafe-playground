import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph } from "../lib/jev-chat/graph";
import {
  evaluateArtifact,
  parseEvaluationFixtures,
  runOfflineEvaluation,
  summarizeMeasurements,
  type EvaluationArtifact,
  type EvaluationFixture,
} from "../lib/jev-chat/evaluation";

const fixture: EvaluationFixture = {
  id: "independent-count",
  category: "source-evidence",
  input: {
    topic: "notes",
    style: "balanced",
    notes: "The synthetic survey counted 47 birds.",
    messages: [{ role: "user", text: "How many birds did the survey count?" }],
  },
  expectations: {
    expectedIntent: "answer",
    requiredSubstrings: ["47"],
    forbiddenSubstrings: ["48"],
    requiredSources: ["note_1"],
  },
  evidenceNotes:
    "The only supplied count is 47. Substring checks cannot verify how the answer uses the count.",
};

async function artifact(text: string): Promise<EvaluationArtifact> {
  return {
    engine: "composition",
    outcome: "completed",
    text,
    intent: "answer",
    responseStatus: "answered",
    selected: "test-answer",
    provenance: "demo",
    sources: [
      {
        id: "note_1",
        text: fixture.input.notes,
        source: "Your notes · paragraph 1",
      },
    ],
    graph: await buildGraph([{ text, provenance: "authored" }]),
    elapsedMs: 1,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
}

test("a valid graph does not make an independently wrong answer pass", async () => {
  const result = await evaluateArtifact(
    fixture,
    await artifact("The survey counted 48 birds."),
  );
  assert.equal(result.graphIntegrity.status, "verified");
  assert.equal(result.mechanical.passed, false);
  assert.equal(
    result.mechanical.assertions.find((a) => a.id === "required-substring:0")
      ?.passed,
    false,
  );
  assert.equal(
    result.mechanical.assertions.find((a) => a.id === "forbidden-substring:0")
      ?.passed,
    false,
  );
  assert.equal(result.quality.semantic, "unmeasured");
});

test("the evaluator independently rejects a corrupted graph and mismatched rendered text", async () => {
  const corrupted = await artifact("The survey counted 47 birds.");
  const leaf = Object.values(corrupted.graph!.nodes).find(
    (node) => node.kind === "text",
  )!;
  leaf.text = "The survey counted 48 birds.";
  const bad = await evaluateArtifact(fixture, corrupted);
  assert.equal(bad.graphIntegrity.status, "failed");
  assert.equal(bad.mechanical.passed, false);

  const mismatch = await artifact("The survey counted 47 birds.");
  mismatch.text = "An unrelated answer.";
  const checked = await evaluateArtifact(fixture, mismatch);
  assert.equal(checked.graphIntegrity.status, "failed");
  assert.match(checked.graphIntegrity.error!, /text/i);
});

test("source and clarification requirements can fail despite a matching word", async () => {
  const missing = await artifact("The survey counted 47 birds.");
  missing.sources = [];
  const checked = await evaluateArtifact(
    {
      ...fixture,
      expectations: {
        ...fixture.expectations,
        mustClarify: true,
        expectedIntent: undefined,
        allowedIntents: ["clarify", "unsupported"],
      },
    },
    missing,
  );
  const checks = checked.mechanical.assertions;
  assert.equal(
    checks.find((a) => a.id === "required-source:note_1")?.passed,
    false,
  );
  assert.equal(checks.find((a) => a.id === "must-clarify")?.passed, false);
  assert.equal(checks.find((a) => a.id === "intent")?.passed, false);
});

test("an attributed source cannot silently change its original note text", async () => {
  const changed = await artifact("The survey counted 47 birds.");
  changed.sources[0].text = "The synthetic survey counted 48 birds.";
  const result = await evaluateArtifact(fixture, changed);
  assert.equal(result.graphIntegrity.status, "verified");
  assert.equal(
    result.mechanical.assertions.find((a) => a.id === "exact-note-sources")
      ?.passed,
    false,
  );
});

test("failed execution remains a failed artifact with no verified graph", async () => {
  const failed: EvaluationArtifact = {
    engine: "composition",
    outcome: "failed",
    text: null,
    intent: null,
    responseStatus: null,
    selected: null,
    provenance: null,
    sources: [],
    graph: null,
    elapsedMs: 2,
    calls: null,
    inputTokens: null,
    outputTokens: null,
    error: "Synthetic failure.",
  };
  const result = await evaluateArtifact(fixture, failed);
  assert.equal(result.mechanical.passed, false);
  assert.equal(result.graphIntegrity.status, "not-available");
  assert.equal(result.artifact.calls, null);
  assert.equal(result.quality.semantic, "unmeasured");
});

test("missing measurements stay unknown instead of becoming zero or a full total", () => {
  assert.deepEqual(summarizeMeasurements([3, null, 2]), {
    knownCount: 2,
    unknownCount: 1,
    knownSubtotal: 5,
    total: null,
  });
  assert.deepEqual(summarizeMeasurements([0, 0]), {
    knownCount: 2,
    unknownCount: 0,
    knownSubtotal: 0,
    total: 0,
  });
  assert.deepEqual(summarizeMeasurements([null]), {
    knownCount: 0,
    unknownCount: 1,
    knownSubtotal: null,
    total: null,
  });
});

test("fixture validation rejects live configuration, credentials, oversized input, and duplicate ids", () => {
  const document = { version: "jev-chat-evaluation-v1", cases: [fixture] };
  assert.equal(parseEvaluationFixtures(document).cases.length, 1);
  for (const input of [
    { ...fixture.input, mode: "live" },
    { ...fixture.input, apiKey: "synthetic-not-a-real-key" },
    { ...fixture.input, notes: "x".repeat(12001) },
    {
      ...fixture.input,
      messages: [{ role: "assistant", text: "No user question." }],
    },
  ]) {
    assert.throws(
      () =>
        parseEvaluationFixtures({
          ...document,
          cases: [{ ...fixture, input }],
        }),
      /fixture/i,
    );
  }
  assert.throws(
    () => parseEvaluationFixtures({ ...document, cases: [fixture, fixture] }),
    /duplicate/i,
  );
  assert.throws(
    () =>
      parseEvaluationFixtures({
        ...document,
        cases: Array.from({ length: 101 }, (_, i) => ({
          ...fixture,
          id: `case-${i}`,
        })),
      }),
    /fixture/i,
  );
  assert.throws(
    () =>
      parseEvaluationFixtures({
        ...document,
        cases: [
          {
            ...fixture,
            expectations: {
              expectedIntent: "answer",
              allowedIntents: ["answer"],
            },
          },
        ],
      }),
    /fixture/i,
  );
});

test("offline runs preserve both responses and leave human, creative, live, and model comparisons unmeasured", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("Network must not be called by offline evaluation.");
  };
  try {
    const report = await runOfflineEvaluation({
      version: "jev-chat-evaluation-v1",
      cases: [fixture],
    });
    assert.equal(report.cases.length, 1);
    assert.equal(report.cases[0].baseline.artifact.outcome, "completed");
    assert.equal(report.cases[0].composition.artifact.outcome, "completed");
    assert.ok(report.cases[0].baseline.artifact.text);
    assert.ok(report.cases[0].composition.artifact.text);
    assert.equal(report.cases[0].composition.graphIntegrity.status, "verified");
    assert.equal(report.summary.composition.calls.total, 0);
    assert.equal(report.summary.composition.inputTokens.total, 0);
    assert.equal(report.modelComparison, "unmeasured");
    assert.equal(report.liveJevQuality, "unmeasured");
    assert.equal(report.quality.semantic, "unmeasured");
    assert.equal(report.quality.creative, "unmeasured");
    assert.equal(report.quality.humanReviewedCases, 0);
    assert.equal(report.latestLlmParity, "unproven");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the authored fixture collection covers every capability topic and semantic boundaries", async () => {
  const raw = JSON.parse(
    await readFile(
      new URL("./fixtures/jev-chat-evaluation.json", import.meta.url),
      "utf8",
    ),
  );
  const fixtures = parseEvaluationFixtures(raw).cases;
  assert.ok(fixtures.length >= 20 && fixtures.length <= 30);
  assert.deepEqual(
    new Set(
      fixtures
        .filter((entry) => entry.expectations.expectedIntent === "capabilities")
        .map((entry) => entry.input.topic),
    ),
    new Set(["guide", "notes", "support", "creative"]),
  );
  for (const category of [
    "source-evidence",
    "comparison",
    "summary",
    "ambiguity",
    "support",
    "creative",
    "source-instructions",
  ])
    assert.ok(
      fixtures.some((entry) => entry.category === category),
      `Missing ${category}`,
    );
});

test("CLI preserves failed assertions in custom reports and rejects live options", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jev-chat-eval-"));
  const script = fileURLToPath(
    new URL("../scripts/jev-chat-eval.ts", import.meta.url),
  );
  const run = (...args: string[]) =>
    spawnSync("pnpm", ["exec", "tsx", script, ...args], {
      encoding: "utf8",
      timeout: 15000,
    });
  try {
    const input = join(directory, "fixtures.json");
    const output = join(directory, "reports", "report.json");
    await writeFile(
      input,
      JSON.stringify({
        version: "jev-chat-evaluation-v1",
        cases: [
          {
            ...fixture,
            expectations: {
              requiredSubstrings: ["deliberately absent sentinel 901"],
            },
          },
        ],
      }),
    );
    const completed = run("--fixtures", input, "--output", output);
    assert.equal(completed.status, 0, completed.stderr);
    const report = JSON.parse(await readFile(output, "utf8"));
    assert.equal(report.caseCount, 1);
    assert.equal(report.summary.baseline.mechanicalFailedCases, 1);
    assert.equal(report.summary.composition.mechanicalFailedCases, 1);
    assert.equal(report.liveJevQuality, "unmeasured");

    const rejected = run("--live");
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /Offline demo only/);

    await writeFile(input, "{");
    const malformed = run("--fixtures", input);
    assert.equal(malformed.status, 1);
    assert.match(malformed.stderr, /valid JSON/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
