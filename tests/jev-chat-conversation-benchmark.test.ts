import test from "node:test";
import assert from "node:assert/strict";
import {
  createConversationPlan,
  runConversationBenchmark,
  parseConversationReport,
  type ConversationReport,
} from "../lib/jev-chat/conversation-benchmark";
import { runLiveBenchmark } from "../lib/jev-chat/benchmark";
import { hashValue } from "../lib/jev-chat/graph";
import type { JevTransport } from "../lib/jev-chat/types";

const turn = (
  id: string,
  question = "What can you do?",
  style?: "concise" | "balanced" | "detailed",
) => ({
  id,
  question,
  ...(style ? { style } : {}),
  expectations: { mustClarify: false },
  evidenceNotes: "Synthetic continuity check, not a quality judgment.",
});
const fixture = (turns = [turn("discover"), turn("again")]) => ({
  version: "jev-chat-conversation-v1",
  id: "conversation",
  category: "continuity",
  input: { topic: "guide", notes: "", seed: 42 },
  turns,
});
const transport: JevTransport = async (payload) => {
  const state = payload.state as Record<string, any>;
  const question = String(state.resolved_question ?? "");
  const revise = /shorter|suspense|ending|keep/i.test(question);
  const story = /fiction|story|shorter|suspense|ending|keep/i.test(question);
  return {
    answers: Object.fromEntries(
      Object.entries(payload.questions).map(([id, q]) => {
        if (q.type === "noul")
          return [
            id,
            {
              type: "noul",
              noul:
                id === "conflict"
                  ? 0
                  : id.startsWith("story_allows_style_")
                    ? id.endsWith("concise")
                      ? 0.95
                      : 0.05
                    : id.startsWith("story_allows_tone_")
                      ? id.endsWith("suspenseful")
                        ? 0.95
                        : 0.05
                      : 0.95,
            },
          ];
        if (q.type === "score")
          return [
            id,
            {
              type: "score",
              score: 0.5,
              confidence: 0.1,
              probabilities: { "0": 0.5, "1": 0.5 },
            },
          ];
        const choice =
          id === "intent"
            ? story
              ? "create"
              : "capabilities"
            : id === "story_action"
              ? revise
                ? "revise"
                : "new"
              : id === "story_mode_style"
                ? /shorter/i.test(question)
                  ? "constrained"
                  : "preserved"
                : id === "story_mode_tone" && /suspense/i.test(question)
                  ? "constrained"
                  : id.startsWith("story_mode_")
                    ? revise
                      ? "preserved"
                      : "delegated"
                    : Object.keys(q.criteria!)[0];
        return [id, { type: "choice", choice, confidence: 0.95 }];
      }),
    ),
    usage: { input_tokens: 10, output_tokens: 2 },
  };
};
const run = (
  value: unknown = fixture(),
  options: Partial<Parameters<typeof runConversationBenchmark>[1]> = {},
) =>
  runConversationBenchmark(value, {
    maxRequests: 20,
    execution: "mocked",
    transport,
    ...options,
  });

test("planning normalizes immutable shared input and expectations without inventing future artifacts", async () => {
  const source = fixture();
  const original = structuredClone(source);
  const plan = await createConversationPlan(source, { maxRequests: 4 });
  assert.equal(plan.mode, "plan");
  assert.equal(plan.fixture.input.style, "balanced");
  assert.deepEqual(plan.fixture.turns[0].expectations.requiredSources, []);
  assert.equal(plan.fixtureHash, await hashValue(plan.fixture));
  assert.deepEqual(Object.keys(plan).sort(), [
    "engine",
    "fixture",
    "fixtureHash",
    "maxRequests",
    "mode",
    "version",
  ]);
  assert.ok(!JSON.stringify(plan).includes("inputHash"));
  assert.deepEqual(source, original);
  plan.fixture.turns[0].question = "changed";
  assert.deepEqual(source, original);
});

test("fixture validation rejects initial history, unknown fields, duplicates and input bounds", async () => {
  const base = fixture();
  const invalid: unknown[] = [
    null,
    {},
    { ...base, extra: true },
    { ...base, turns: [] },
    { ...base, turns: [turn("same"), turn("same")] },
    { ...base, turns: Array.from({ length: 11 }, (_, i) => turn(`turn-${i}`)) },
    {
      ...base,
      input: {
        ...base.input,
        messages: [{ role: "assistant", text: "fabricated" }],
      },
    },
    { ...base, input: { ...base.input, mode: "live" } },
    { ...base, input: { ...base.input, notes: "x".repeat(12001) } },
    { ...base, turns: [turn("bad", " ")] },
    { ...base, turns: [turn("bad", "x".repeat(2001))] },
    { ...base, turns: [{ ...turn("bad"), expectations: {} }] },
    { ...base, turns: [{ ...turn("bad"), answer: "fabricated" }] },
    { ...base, ignored: "x".repeat(2 * 1024 * 1024) },
  ];
  for (const value of invalid)
    await assert.rejects(() =>
      createConversationPlan(value, { maxRequests: 4 }),
    );
  for (const maxRequests of [0, 21, 1.5, NaN])
    await assert.rejects(() => createConversationPlan(base, { maxRequests }));
});

test("actual ordinal options, story frames, and successful story detail flow into subsequent turns", async () => {
  const report = await run(
    fixture([
      turn("discover"),
      turn("choose", "The second one, please."),
      turn("shorten", "Make it shorter"),
      turn("tone", "Make it suspenseful"),
      turn("detail", "Keep the story, make it suspenseful", "detailed"),
    ]),
  );
  assert.equal(report.status, "completed");
  assert.equal(report.summary.completed, 5);
  assert.equal(report.summary.requests, 9);
  const entries = report.turns.map((entry) => entry.benchmark!.cases[0]);
  assert.ok(entries[0].result!.options[1].includes("story"));
  assert.equal(entries[1].result!.intent, "create");
  assert.equal(entries[2].result!.story!.style, "concise");
  assert.equal(entries[3].fixture.input.style, "concise");
  assert.equal(entries[4].fixture.input.style, "detailed");
  assert.deepEqual(entries[3].fixture.input.messages[5], {
    role: "assistant",
    text: entries[2].result!.text,
    options: entries[2].result!.options,
    story: entries[2].result!.story,
  });
  assert.deepEqual(
    entries[3].result!.story!.choices,
    entries[1].result!.story!.choices,
  );
  assert.deepEqual(
    entries.map((entry) => entry.fixture.input.messages.length),
    [1, 3, 5, 7, 9],
  );
  assert.deepEqual(
    report.turns.map((entry) => entry.benchmark!.maxRequests),
    [20, 19, 17, 15, 13],
  );
  assert.equal(report.summary.inputTokens.total, 90);
  assert.equal(report.quality.semantic, "unmeasured");
  assert.equal(report.quality.creative, "unmeasured");
  assert.equal(report.quality.latestLlmParity, "unproven");
  assert.deepEqual(await parseConversationReport(report), report);
});

test("valid clarification continues the conversation while preserving unknown usage", async () => {
  let calls = 0;
  const report = await run(fixture(), {
    transport: async (payload, signal) => {
      calls++;
      const response = (await transport(payload, signal)) as any;
      delete response.usage;
      if (calls === 1) response.answers.intent.confidence = 0.2;
      return response;
    },
  });
  assert.equal(report.status, "completed");
  assert.equal(report.turns[0].benchmark!.cases[0].result!.status, "clarify");
  assert.equal(report.turns[1].status, "completed");
  assert.equal(report.summary.inputTokens.total, null);
  assert.equal(report.summary.inputTokens.unknownCount, 2);
  await parseConversationReport(report);
});

test("global request budget applies between turns and within a dependent story response", async () => {
  for (const maxRequests of [1, 2]) {
    let calls = 0;
    const report = await run(
      fixture([
        turn("discover"),
        turn("story", "Write a story"),
        turn("later"),
      ]),
      {
        maxRequests,
        transport: async (payload, signal) => {
          calls++;
          return transport(payload, signal);
        },
      },
    );
    assert.equal(calls, maxRequests);
    assert.equal(report.summary.requests, maxRequests);
    assert.equal(report.stopReason, "request-budget");
    assert.equal(
      report.turns[1].status,
      maxRequests === 1 ? "not-run" : "failed",
    );
    assert.equal(report.turns[2].status, "not-run");
    await parseConversationReport(report);
  }
});

test("ordinary and provider-limit failures stop later turns without exposing provider text", async () => {
  for (const status of [500, 429, 402]) {
    let calls = 0;
    const report = await run(fixture(), {
      transport: async () => {
        calls++;
        throw Object.assign(Error("synthetic-secret-provider-message"), {
          status,
        });
      },
    });
    assert.equal(calls, 1);
    assert.equal(report.status, "stopped");
    assert.equal(
      report.stopReason,
      status === 500 ? "turn-failed" : "provider-limit",
    );
    assert.equal(report.turns[0].status, "failed");
    assert.equal(report.turns[1].status, "not-run");
    assert.ok(!JSON.stringify(report).includes("synthetic-secret"));
    await parseConversationReport(report);
  }
});

test("every detached serialized checkpoint is importable, including outer-running null and completed inner reports", async () => {
  const checkpoints: ConversationReport[] = [];
  let writing = false;
  const report = await run(fixture(), {
    onUpdate: async (snapshot) => {
      assert.equal(writing, false);
      writing = true;
      checkpoints.push(JSON.parse(JSON.stringify(snapshot)));
      await new Promise<void>((resolve) => setImmediate(resolve));
      snapshot.plan.fixture.input.notes = "Mutated external checkpoint";
      writing = false;
    },
  });
  assert.equal(report.plan.fixture.input.notes, "");
  assert.ok(
    checkpoints.some((r) =>
      r.turns.some((t) => t.status === "running" && t.benchmark === null),
    ),
  );
  assert.ok(
    checkpoints.some((r) =>
      r.turns.some(
        (t) => t.status === "running" && t.benchmark?.status === "completed",
      ),
    ),
  );
  for (const checkpoint of checkpoints)
    await parseConversationReport(checkpoint);
});

test("checkpoint failure stops dispatch and uses no arbitrary callback error text", async () => {
  for (const failAt of ["initial", "pending", "complete"] as const) {
    let calls = 0;
    const report = await run(fixture(), {
      transport: async (payload, signal) => {
        calls++;
        return transport(payload, signal);
      },
      onUpdate: async (snapshot) => {
        const requests = snapshot.turns[0].benchmark?.cases[0].requests;
        if (
          failAt === "initial" ||
          (failAt === "pending" && requests?.at(-1)?.status === "pending") ||
          (failAt === "complete" && snapshot.turns[0].status === "completed")
        )
          throw Error("synthetic-secret-checkpoint");
      },
    });
    assert.equal(report.stopReason, "checkpoint");
    assert.equal(calls, failAt === "complete" ? 1 : 0);
    assert.equal(report.turns[1].status, "not-run");
    assert.ok(!JSON.stringify(report).includes("synthetic-secret"));
    await parseConversationReport(report);
  }
});

test("pre-cancellation and a transport ignoring cancellation produce no later writes or turn executions", async () => {
  const pre = new AbortController();
  pre.abort();
  const initial = await run(fixture(), {
    signal: pre.signal,
    transport: async () => {
      throw Error("must not dispatch");
    },
  });
  assert.equal(initial.stopReason, "cancelled");
  assert.equal(initial.summary.requests, 0);
  await parseConversationReport(initial);
  const controller = new AbortController();
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const snapshots: ConversationReport[] = [];
  const pending = run(fixture(), {
    signal: controller.signal,
    transport: async (payload, signal) => {
      const response = await transport(payload, signal);
      started();
      return new Promise((resolve) => {
        release = () => resolve(response);
      });
    },
    onUpdate: async (snapshot) => {
      snapshots.push(snapshot);
    },
  });
  await ready;
  controller.abort();
  const report = await pending;
  const copy = structuredClone(report),
    count = snapshots.length;
  release();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(report, copy);
  assert.equal(snapshots.length, count);
  assert.equal(report.stopReason, "cancelled");
  assert.equal(report.turns[1].status, "not-run");
  assert.equal(report.summary.inputTokens.total, null);
  await parseConversationReport(report);
});

test("import binds the exact chain even when an altered nested input has valid independently regenerated hashes", async () => {
  const report = await run(fixture());
  const changed = structuredClone(report);
  const entry = changed.turns[1].benchmark!.cases[0].fixture;
  entry.input.messages[1].options = ["A fabricated option"];
  changed.turns[1].benchmark = await runLiveBenchmark(
    { version: "jev-chat-evaluation-v1", cases: [entry] },
    {
      caseIds: [entry.id],
      maxRequests: 19,
      execution: "mocked",
      transport,
    },
  );
  await assert.rejects(
    () => parseConversationReport(changed),
    /chain|input|fixture/i,
  );
  for (const mutate of [
    (r: ConversationReport) => {
      r.plan.fixtureHash = "0".repeat(64);
    },
    (r: ConversationReport) => {
      r.turns[1].benchmark!.fixtureHash = "0".repeat(64);
    },
    (r: ConversationReport) => {
      r.turns[1].benchmark!.maxRequests = 20;
    },
    (r: ConversationReport) => {
      r.turns[1].benchmark!.execution = "live";
    },
    (r: ConversationReport) => {
      r.turns.reverse();
    },
    (r: ConversationReport) => {
      r.turns[0].status = "not-run";
      r.turns[0].benchmark = null;
    },
    (r: ConversationReport) => {
      r.finishedAt = null;
    },
    (r: ConversationReport) => {
      r.turns[0].benchmark!.cases.push(
        structuredClone(r.turns[0].benchmark!.cases[0]),
      );
    },
    (r: ConversationReport) => {
      r.status = "stopped";
      r.stopReason = "turn-failed";
    },
    (r: ConversationReport) => {
      r.plan.engine = "old-engine";
    },
  ]) {
    const altered = structuredClone(report);
    mutate(altered);
    await assert.rejects(() => parseConversationReport(altered));
  }
  const incorrectSummary = structuredClone(report);
  incorrectSummary.summary.requests = 0;
  assert.equal(
    (await parseConversationReport(incorrectSummary)).summary.requests,
    2,
  );
});

test("growing source-answer history fails before transport without truncating prior replies", async () => {
  const source = fixture(
    Array.from({ length: 7 }, (_, index) =>
      turn(`answer-${index}`, "Explain the note."),
    ),
  );
  source.input.topic = "notes";
  source.input.notes = `Synthetic facts: ${"material ".repeat(1308).trim()}`;
  let calls = 0;
  const report = await run(source, {
    transport: async (payload) => {
      calls++;
      return {
        answers: Object.fromEntries(
          Object.entries(payload.questions).map(([id, question]) => [
            id,
            question.type === "noul"
              ? {
                  type: "noul",
                  noul:
                    id === "conflict" ||
                    (id.startsWith("evidence_") && id !== "evidence_note_1")
                      ? 0
                      : 0.95,
                }
              : {
                  type: "choice",
                  choice:
                    id === "intent"
                      ? "answer"
                      : Object.keys(question.criteria!)[0],
                  confidence: 0.95,
                },
          ]),
        ),
      };
    },
  });
  assert.equal(report.status, "stopped");
  assert.equal(report.stopReason, "turn-failed");
  assert.equal(report.summary.completed, 5);
  assert.equal(calls, 10);
  assert.equal(report.turns[5].status, "failed");
  assert.equal(report.turns[5].benchmark, null);
  assert.equal(report.turns[6].status, "not-run");
  const lastInput = report.turns[4].benchmark!.cases[0].fixture.input;
  assert.equal(lastInput.messages.length, 9);
  assert.equal(lastInput.notes, source.input.notes);
  for (const message of lastInput.messages.filter(
    (entry) => entry.role === "assistant",
  ))
    assert.ok(message.text.includes(source.input.notes));
  await parseConversationReport(report);
});

test("import rejects execution after an inner stop", async () => {
  const report = await run();
  const afterStop = structuredClone(report);
  afterStop.turns[0].benchmark!.status = "stopped";
  afterStop.turns[0].benchmark!.stopReason = "checkpoint";
  await assert.rejects(
    () => parseConversationReport(afterStop),
    /prefix|stop|lifecycle/i,
  );
});

test("a failed outer turn always records a stop reason, including running checkpoints", async () => {
  const report = await run(fixture(), {
    transport: async () => {
      throw Error("Synthetic transport failure");
    },
  });
  assert.equal(report.turns[0].status, "failed");
  assert.equal(report.turns[0].benchmark!.status, "completed");
  assert.equal(report.turns[0].benchmark!.cases[0].status, "failed");
  const impossible = structuredClone(report);
  impossible.status = "running";
  impossible.finishedAt = null;
  impossible.stopReason = null;
  await assert.rejects(
    () => parseConversationReport(impossible),
    /stop|lifecycle/i,
  );
  const transient = structuredClone(impossible);
  transient.turns[0].status = "running";
  await parseConversationReport(transient);
});

test("finished outer turns propagate inner stop reasons even while the conversation is running", async () => {
  const snapshots: ConversationReport[] = [];
  const limited = await run(fixture(), {
    transport: async () => {
      throw Object.assign(Error("Synthetic limit"), { status: 429 });
    },
    onUpdate: async (snapshot) => {
      snapshots.push(snapshot);
    },
  });
  const checkpoint = await run(fixture(), {
    onUpdate: async (snapshot) => {
      if (
        snapshot.turns[0].status === "running" &&
        snapshot.turns[0].benchmark?.status === "completed"
      )
        throw Error("Synthetic checkpoint failure");
    },
  });
  assert.equal(limited.turns[0].status, "failed");
  assert.equal(checkpoint.turns[0].status, "completed");
  for (const report of [limited, checkpoint]) {
    assert.ok(report.turns[0].benchmark!.stopReason);
    await parseConversationReport(report);
    const contradictory = structuredClone(report);
    contradictory.status = "running";
    contradictory.finishedAt = null;
    contradictory.stopReason = "cancelled";
    await assert.rejects(
      () => parseConversationReport(contradictory),
      /stop|lifecycle/i,
    );
    const transient = structuredClone(contradictory);
    transient.turns[0].status = "running";
    transient.stopReason = null;
    await parseConversationReport(transient);
  }
  assert.ok(
    snapshots.some(
      (snapshot) =>
        snapshot.turns[0].status === "running" &&
        snapshot.turns[0].benchmark?.stopReason === "provider-limit",
    ),
  );
  for (const snapshot of snapshots) await parseConversationReport(snapshot);
});

test("import rejects a failed null benchmark when its preflight input was valid", async () => {
  const report = await run();
  const missing = structuredClone(report);
  missing.status = "stopped";
  missing.stopReason = "turn-failed";
  missing.turns[0] = {
    id: missing.turns[0].id,
    status: "failed",
    benchmark: null,
  };
  missing.turns[1] = {
    id: missing.turns[1].id,
    status: "not-run",
    benchmark: null,
  };
  await assert.rejects(
    () => parseConversationReport(missing),
    /validation|preflight|missing/i,
  );
});

test("finishing every turn at the exact budget is completed rather than a budget stop", async () => {
  const report = await run();
  const exhaustedAfterCompletion = structuredClone(report);
  exhaustedAfterCompletion.plan.maxRequests = 2;
  exhaustedAfterCompletion.turns[0].benchmark!.maxRequests = 2;
  exhaustedAfterCompletion.turns[1].benchmark!.maxRequests = 1;
  exhaustedAfterCompletion.status = "stopped";
  exhaustedAfterCompletion.stopReason = "request-budget";
  await assert.rejects(
    () => parseConversationReport(exhaustedAfterCompletion),
    /budget|stop/i,
  );
});

test("fixtures and imported reports reject accessors, extra fields, and non-JSON data without executing them", async () => {
  let reads = 0;
  const source = fixture();
  Object.defineProperty(source, "id", {
    enumerable: true,
    get() {
      reads++;
      return "secret";
    },
  });
  await assert.rejects(
    () => createConversationPlan(source, { maxRequests: 2 }),
    /JSON/i,
  );
  assert.equal(reads, 0);
  const report = await run();
  for (const altered of [
    { ...report, extra: true },
    { ...report, ignored: "x".repeat(16 * 1024 * 1024) },
    { ...report, quality: { ...report.quality, semantic: "verified" } },
    { ...report, summary: { ...report.summary, extra: true } },
  ])
    await assert.rejects(() => parseConversationReport(altered));
  Object.defineProperty(report, "toJSON", {
    get() {
      reads++;
      return () => ({});
    },
  });
  await assert.rejects(() => parseConversationReport(report), /JSON/i);
  assert.equal(reads, 0);
});
