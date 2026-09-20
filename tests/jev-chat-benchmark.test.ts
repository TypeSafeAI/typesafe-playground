import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runLiveBenchmark,
  createBenchmarkPlan,
  assessComparisons,
  parseBenchmarkReport,
} from "../lib/jev-chat/benchmark";
import { hashValue } from "../lib/jev-chat/graph";
import type { JevTransport } from "../lib/jev-chat/types";

const fixture = (id: string, question = "What can you do?") => ({
  id,
  category: "capabilities",
  input: {
    topic: "guide",
    notes: "",
    messages: [{ role: "user", text: question }],
  },
  expectations: { requiredSubstrings: ["fiction"] },
  evidenceNotes:
    "Capabilities include explicitly fictional composition; this is not a quality rating.",
});
const fixtures = {
  version: "jev-chat-evaluation-v1",
  cases: [fixture("capabilities"), fixture("story", "Write a short story.")],
};
const transport: JevTransport = async (payload) => ({
  model: "synthetic-jev-test-version",
  answers: Object.fromEntries(
    Object.entries(payload.questions).map(([id, q]) => [
      id,
      q.type === "noul"
        ? { type: "noul", noul: id === "conflict" ? 0 : 0.95 }
        : q.type === "score"
          ? {
              type: "score",
              score: 0.5,
              confidence: 0.3,
              probabilities: { "0": 0.5, "1": 0.5 },
            }
          : {
              type: "choice",
              choice:
                id === "intent"
                  ? String((payload.state as any).resolved_question).includes(
                      "story",
                    )
                    ? "create"
                    : "capabilities"
                  : Object.keys(q.criteria!)[0],
              confidence: 0.95,
            },
    ]),
  ),
  usage: { input_tokens: 100, output_tokens: 10 },
});

test("planning validates explicit case/request bounds without any transport", async () => {
  const plan = await createBenchmarkPlan(fixtures, {
    caseIds: ["capabilities"],
    maxRequests: 2,
  });
  assert.equal(plan.mode, "plan");
  assert.equal(plan.cases.length, 1);
  assert.equal(plan.maxRequests, 2);
  assert.match(plan.cases[0].inputHash, /^[a-f0-9]{64}$/);
  for (const options of [
    { caseIds: [], maxRequests: 2 },
    { caseIds: ["missing"], maxRequests: 2 },
    { caseIds: ["story", "story"], maxRequests: 2 },
    { caseIds: ["story"], maxRequests: 21 },
  ])
    await assert.rejects(
      () => createBenchmarkPlan(fixtures, options),
      /case|request|budget/i,
    );
});
test("mocked benchmark records measured attempts, inputs and outputs without claiming live quality", async () => {
  const states: string[] = [];
  const result = await runLiveBenchmark(fixtures, {
    caseIds: ["capabilities"],
    maxRequests: 2,
    execution: "mocked",
    transport,
    onUpdate: async (report) => {
      states.push(report.cases[0].requests.at(-1)?.status ?? "none");
    },
  });
  assert.equal(result.status, "completed");
  assert.equal(result.execution, "mocked");
  assert.equal(result.cases[0].status, "completed");
  assert.equal(result.cases[0].requests.length, 1);
  assert.equal(
    result.cases[0].requests[0].returnedModel,
    "synthetic-jev-test-version",
  );
  assert.equal(result.summary.inputTokens.total, 100);
  assert.equal(result.summary.requests, 1);
  assert.equal(result.quality.latestLlmParity, "unproven");
  assert.equal(result.quality.semantic, "unmeasured");
  assert.ok(states.includes("pending"));
  assert.ok(states.includes("completed"));
  assert.equal(
    result.cases[0].outputHash,
    await hashValue(result.cases[0].result!.text),
  );
});
test("request budget stops a dependent call and does not manufacture a completed answer", async () => {
  let calls = 0;
  const result = await runLiveBenchmark(fixtures, {
    caseIds: ["story", "capabilities"],
    maxRequests: 1,
    execution: "mocked",
    transport: async (payload, signal) => {
      calls++;
      return transport(payload, signal);
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "stopped");
  assert.equal(result.stopReason, "request-budget");
  assert.equal(result.cases[0].status, "failed");
  assert.equal(result.cases[0].result, null);
  assert.equal(result.cases[1].status, "not-run");
});
test("provider rate limits halt remaining cases and errors do not expose arbitrary provider messages", async () => {
  let calls = 0;
  const result = await runLiveBenchmark(fixtures, {
    caseIds: ["capabilities", "story"],
    maxRequests: 4,
    execution: "mocked",
    transport: async () => {
      calls++;
      throw Object.assign(Error("synthetic-secret-must-not-appear"), {
        status: 429,
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.stopReason, "provider-limit");
  assert.equal(result.summary.inputTokens.total, null);
  assert.equal(result.cases[1].status, "not-run");
  assert.ok(!JSON.stringify(result).includes("synthetic-secret"));
});
test("missing usage and malformed decisions remain unknown and failed", async () => {
  const result = await runLiveBenchmark(fixtures, {
    caseIds: ["capabilities"],
    maxRequests: 2,
    execution: "mocked",
    transport: async () => ({ answers: {} }),
  });
  assert.equal(result.cases[0].status, "failed");
  assert.equal(result.cases[0].outputHash, null);
  assert.equal(result.summary.inputTokens.total, null);
  assert.equal(result.summary.failed, 1);
});
test("cancelled runs stop without invoking the transport", async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await runLiveBenchmark(fixtures, {
    caseIds: ["capabilities"],
    maxRequests: 2,
    execution: "mocked",
    signal: controller.signal,
    transport: async () => {
      throw Error("must not call");
    },
  });
  assert.equal(result.status, "stopped");
  assert.equal(result.stopReason, "cancelled");
  assert.equal(result.summary.requests, 0);
  assert.equal(result.cases[0].status, "not-run");
});
test("comparison/review records bind exact inputs and outputs and cannot establish parity", async () => {
  const report = await runLiveBenchmark(fixtures, {
    caseIds: ["capabilities"],
    maxRequests: 2,
    execution: "mocked",
    transport,
  });
  const entry = report.cases[0];
  const comparison = {
    caseId: entry.id,
    inputHash: entry.inputHash,
    provider: "external",
    model: "synthetic-reference",
    modelVersion: "test-v1",
    settings: { temperature: 0 },
    output: "A synthetic comparison answer.",
    generatedAt: "2026-09-18T00:00:00.000Z",
  };
  const review = {
    caseId: entry.id,
    inputHash: entry.inputHash,
    outputHash: entry.outputHash,
    reviewerId: "reviewer-a",
    reviewerKind: "human",
    rubricVersion: "jev-chat-quality-v1",
    ratings: { correctness: 4, usefulness: 3, coherence: 4, creativity: null },
    notes: "Synthetic review fixture; not a real human evaluation.",
  };
  const assessed = await assessComparisons(
    report,
    { version: "jev-chat-comparisons-v1", entries: [comparison] },
    { version: "jev-chat-reviews-v1", entries: [review] },
  );
  assert.equal(assessed.reviews.length, 1);
  assert.equal(assessed.comparisons.length, 1);
  assert.equal(assessed.latestLlmParity, "unproven");
  assert.equal(assessed.reviewAttribution, "imported-unverified");
  await assert.rejects(
    () =>
      assessComparisons(report, {
        version: "jev-chat-comparisons-v1",
        entries: [{ ...comparison, inputHash: "0".repeat(64) }],
      }),
    /match|input/i,
  );
  await assert.rejects(
    () =>
      assessComparisons(report, undefined, {
        version: "jev-chat-reviews-v1",
        entries: [{ ...review, outputHash: "0".repeat(64) }],
      }),
    /match|output/i,
  );
  await assert.rejects(
    () =>
      assessComparisons(report, undefined, {
        version: "jev-chat-reviews-v1",
        entries: [review, review],
      }),
    /duplicate/i,
  );
});
test("imported reports verify source inputs and response graphs rather than trusting summaries", async () => {
  const report = await runLiveBenchmark(fixtures, {
    caseIds: ["capabilities"],
    maxRequests: 2,
    execution: "mocked",
    transport,
  });
  const restored = await parseBenchmarkReport(
    JSON.parse(JSON.stringify(report)),
  );
  assert.equal(restored.cases[0].outputHash, report.cases[0].outputHash);
  const changed = structuredClone(report);
  changed.cases[0].fixture.input.messages[0].text = "A different request";
  await assert.rejects(() => parseBenchmarkReport(changed), /input/i);
  const damaged = structuredClone(report);
  Object.values(damaged.cases[0].result!.graph.nodes).find(
    (n) => n.kind === "text",
  )!.text = "Changed";
  await assert.rejects(
    () => parseBenchmarkReport(damaged),
    /integrity|graph|response/i,
  );
});
test("imports replay recorded decisions and reject detached context or request hashes", async () => {
  const report = await runLiveBenchmark(fixtures, {
    caseIds: ["story"],
    maxRequests: 2,
    execution: "mocked",
    transport,
  });
  await parseBenchmarkReport(report);
  for (const mutation of [
    "context",
    "first-request",
    "second-request",
    "question",
    "answers",
  ] as const) {
    const changed = structuredClone(report);
    const entry = changed.cases[0];
    if (mutation === "context")
      entry.result!.trace.contextHash = "0".repeat(64);
    if (mutation === "first-request")
      entry.requests[0].payloadHash = "0".repeat(64);
    if (mutation === "second-request")
      entry.requests[1].payloadHash = "0".repeat(64);
    if (mutation === "question") {
      entry.fixture.input.messages[0].text =
        "Write a story about a different topic.";
      entry.inputHash = await hashValue(entry.fixture.input);
    }
    if (mutation === "answers") entry.requests[0].answers = null;
    await assert.rejects(
      () => parseBenchmarkReport(changed),
      /context|request|replay|hash|answers/i,
      mutation,
    );
  }
});

test("an ignored abort cannot mutate a terminal report or write a late checkpoint", async () => {
  const controller = new AbortController();
  let release!: (value: unknown) => void;
  let started!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const checkpoints: unknown[] = [];
  const running = runLiveBenchmark(fixtures, {
    caseIds: ["capabilities", "story"],
    maxRequests: 4,
    execution: "mocked",
    signal: controller.signal,
    transport: async (payload, signal) => {
      const response = await transport(payload, signal);
      started();
      return new Promise((resolve) => {
        release = () => resolve(response);
      });
    },
    onUpdate: async (report) => {
      checkpoints.push(report);
    },
  });
  await requestStarted;
  controller.abort();
  const report = await running;
  const snapshot = structuredClone(report);
  const checkpointCount = checkpoints.length;
  release(undefined);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(
    report,
    snapshot,
    "Late provider results must not mutate a returned report",
  );
  assert.equal(
    checkpoints.length,
    checkpointCount,
    "Late provider results must not write checkpoints",
  );
  assert.equal(report.stopReason, "cancelled");
  assert.equal(report.cases[0].requests[0].status, "interrupted");
  assert.equal(report.cases[0].requests[0].inputTokens, null);
  assert.equal(report.summary.inputTokens.total, null);
  assert.equal(report.cases[1].status, "not-run");
  await parseBenchmarkReport(report);
});

test("every saved checkpoint is importable as a consistent partial report", async () => {
  const checkpoints: unknown[] = [];
  await runLiveBenchmark(fixtures, {
    caseIds: ["capabilities", "story"],
    maxRequests: 4,
    execution: "mocked",
    transport,
    onUpdate: async (report) => {
      checkpoints.push(report);
    },
  });
  for (const checkpoint of checkpoints) await parseBenchmarkReport(checkpoint);
});

test("checkpoint failures halt future requests and return a stopped report", async () => {
  let calls = 0;
  const report = await runLiveBenchmark(fixtures, {
    caseIds: ["capabilities", "story"],
    maxRequests: 4,
    execution: "mocked",
    transport: async (payload, signal) => {
      calls++;
      return transport(payload, signal);
    },
    onUpdate: async (report) => {
      if (report.cases[0].requests[0]?.status === "completed")
        throw Error("Synthetic disk failure");
    },
  });
  assert.equal(calls, 1);
  assert.equal(report.status, "stopped");
  assert.equal(report.stopReason, "checkpoint");
  assert.equal(report.cases[0].status, "failed");
  assert.equal(report.cases[1].status, "not-run");
  await parseBenchmarkReport(report);
});

test("import rejects contradictory report and case lifecycle states", async () => {
  const report = await runLiveBenchmark(fixtures, {
    caseIds: ["capabilities"],
    maxRequests: 2,
    execution: "mocked",
    transport,
  });
  for (const mutate of [
    (r: typeof report) => {
      r.finishedAt = null;
    },
    (r: typeof report) => {
      r.stopReason = "cancelled";
    },
    (r: typeof report) => {
      r.cases[0].requests[0].status = "pending";
    },
    (r: typeof report) => {
      r.cases[0].status = "not-run";
      r.cases[0].result = null;
      r.cases[0].outputHash = null;
    },
    (r: typeof report) => {
      r.cases[0].failure = "response-failed";
    },
  ]) {
    const contradictory = structuredClone(report);
    mutate(contradictory);
    await assert.rejects(
      () => parseBenchmarkReport(contradictory),
      /status|lifecycle|pending|not-run|failure/i,
    );
  }
});

test("comparison output preserves exact whitespace and hashes unchanged text", async () => {
  const report = await runLiveBenchmark(fixtures, {
    caseIds: ["capabilities"],
    maxRequests: 2,
    execution: "mocked",
    transport,
  });
  const entry = report.cases[0];
  const output = "  A synthetic comparison answer.\r\n\n";
  const assessed = await assessComparisons(report, {
    version: "jev-chat-comparisons-v1",
    entries: [
      {
        caseId: entry.id,
        inputHash: entry.inputHash,
        provider: "external",
        model: "synthetic",
        modelVersion: "test-v1",
        settings: { temperature: 0 },
        output,
        generatedAt: "2026-09-18T00:00:00.000Z",
      },
    ],
  });
  assert.equal(assessed.comparisons[0].output, output);
  assert.equal(assessed.comparisons[0].outputHash, await hashValue(output));
});

test("comparison identity does not depend on settings key order", async () => {
  const report = await runLiveBenchmark(fixtures, {
    caseIds: ["capabilities"],
    maxRequests: 2,
    execution: "mocked",
    transport,
  });
  const entry = report.cases[0];
  const comparison = {
    caseId: entry.id,
    inputHash: entry.inputHash,
    provider: "external",
    model: "synthetic",
    modelVersion: "test-v1",
    settings: { temperature: 0, seed: 7 },
    output: "Synthetic answer",
    generatedAt: "2026-09-18T00:00:00.000Z",
  };
  await assert.rejects(
    () =>
      assessComparisons(report, {
        version: "jev-chat-comparisons-v1",
        entries: [
          comparison,
          { ...comparison, settings: { seed: 7, temperature: 0 } },
        ],
      }),
    /duplicate/i,
  );
});

test("abort while saving a pending request serializes checkpoints and prevents dispatch", async () => {
  const controller = new AbortController();
  let release!: () => void;
  let saving!: () => void;
  const checkpointStarted = new Promise<void>((resolve) => {
    saving = resolve;
  });
  const checkpoints: unknown[] = [];
  let writes = 0;
  let concurrentWrites = 0;
  let calls = 0;
  const running = runLiveBenchmark(fixtures, {
    caseIds: ["capabilities"],
    maxRequests: 2,
    execution: "mocked",
    signal: controller.signal,
    transport: async (payload, signal) => {
      calls++;
      return transport(payload, signal);
    },
    onUpdate: async (report) => {
      writes++;
      concurrentWrites = Math.max(concurrentWrites, writes);
      if (report.cases[0].requests[0]?.status === "pending") {
        saving();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      checkpoints.push(report);
      writes--;
    },
  });
  await checkpointStarted;
  controller.abort();
  await new Promise<void>((resolve) => setImmediate(resolve));
  release();
  const report = await running;
  assert.equal(calls, 0);
  assert.equal(concurrentWrites, 1);
  assert.equal(report.cases[0].requests[0].status, "interrupted");
  assert.equal(report.stopReason, "cancelled");
  assert.deepEqual(checkpoints.at(-1), report);
  for (const checkpoint of checkpoints) await parseBenchmarkReport(checkpoint);
});

test("initial and pre-dispatch checkpoint failures never invoke transport", async () => {
  for (const failAt of [1, 3]) {
    let writes = 0;
    let calls = 0;
    const report = await runLiveBenchmark(fixtures, {
      caseIds: ["capabilities", "story"],
      maxRequests: 4,
      execution: "mocked",
      transport: async (payload, signal) => {
        calls++;
        return transport(payload, signal);
      },
      onUpdate: async () => {
        if (++writes === failAt) throw Error("Synthetic checkpoint failure");
      },
    });
    assert.equal(calls, 0);
    assert.equal(writes, failAt);
    assert.equal(report.stopReason, "checkpoint");
    await parseBenchmarkReport(report);
  }
});

test("invalid HTTP metadata is unknown and emitted reports remain importable", async () => {
  const report = await runLiveBenchmark(fixtures, {
    caseIds: ["capabilities"],
    maxRequests: 2,
    execution: "mocked",
    transport: async (payload, signal) => ({
      ...((await transport(payload, signal)) as object),
      _playgroundUsage: { status: 700 },
    }),
  });
  assert.equal(report.cases[0].requests[0].statusCode, null);
  await parseBenchmarkReport(report);
});

test("import rejects response traces that contradict per-request usage", async () => {
  const report = await runLiveBenchmark(fixtures, {
    caseIds: ["capabilities"],
    maxRequests: 2,
    execution: "mocked",
    transport,
  });
  report.cases[0].result!.trace.inputTokens = 1;
  await assert.rejects(() => parseBenchmarkReport(report), /usage|token/i);
});

test("human and model reviews with the same declared label remain separate", async () => {
  const report = await runLiveBenchmark(fixtures, {
    caseIds: ["capabilities"],
    maxRequests: 2,
    execution: "mocked",
    transport,
  });
  const entry = report.cases[0];
  const review = {
    caseId: entry.id,
    inputHash: entry.inputHash,
    outputHash: entry.outputHash,
    reviewerId: "synthetic-reviewer",
    reviewerKind: "human",
    rubricVersion: "jev-chat-quality-v1",
    ratings: {
      correctness: null,
      usefulness: 3,
      coherence: 4,
      creativity: null,
    },
    notes: "Synthetic imported rating.",
  };
  const assessment = await assessComparisons(report, undefined, {
    version: "jev-chat-reviews-v1",
    entries: [review, { ...review, reviewerKind: "model" }],
  });
  assert.equal(assessment.summary.humanJudgments, 1);
  assert.equal(assessment.summary.modelJudgments, 1);
  assert.equal(assessment.reviews.length, 2);
  assert.equal(report.quality.semantic, "unmeasured");
});

test("CLI defaults to offline planning and rejects live execution without output or an environment key", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jev-benchmark-cli-"));
  try {
    const input = join(directory, "fixtures.json");
    const output = join(directory, "plan.json");
    await writeFile(input, JSON.stringify(fixtures));
    const invoke = (...args: string[]) =>
      spawnSync(
        "pnpm",
        ["exec", "tsx", "scripts/jev-chat-benchmark.ts", ...args],
        {
          env: { ...process.env, TYPESAFE_API_KEY: "" },
          encoding: "utf8",
          timeout: 10000,
        },
      );
    const base = [
      "--fixtures",
      input,
      "--cases",
      "capabilities",
      "--max-requests",
      "2",
    ];
    const plan = invoke(...base);
    assert.equal(plan.status, 0, plan.stderr);
    assert.equal(JSON.parse(plan.stdout).mode, "plan");
    assert.equal(invoke(...base, "--output", output).status, 0);
    const saved = await readFile(output, "utf8");
    assert.equal(JSON.parse(saved).mode, "plan");
    const existing = invoke(...base, "--output", output);
    assert.equal(existing.status, 1);
    assert.match(existing.stderr, /EEXIST/);
    assert.equal(await readFile(output, "utf8"), saved);
    const missingOutput = invoke(...base, "--live");
    assert.equal(missingOutput.status, 1);
    assert.match(missingOutput.stderr, /explicit new --output/);
    const missingKey = invoke(
      ...base,
      "--live",
      "--output",
      join(directory, "live.json"),
    );
    assert.equal(missingKey.status, 1);
    assert.match(missingKey.stderr, /TYPESAFE_API_KEY.*No .env file is loaded/);
    await assert.rejects(readFile(join(directory, "live.json")), {
      code: "ENOENT",
    });
    const excessive = invoke(
      "--fixtures",
      input,
      "--cases",
      "capabilities",
      "--max-requests",
      "21",
    );
    assert.equal(excessive.status, 1);
    assert.match(excessive.stderr, /Limits/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
