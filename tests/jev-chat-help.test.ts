import test from "node:test";
import assert from "node:assert/strict";
import { respond } from "../lib/jev-chat/engine";
import { clarification } from "../lib/jev-chat/grammar";
import { buildContext } from "../lib/jev-chat/knowledge";
import {
  parseSavedResult,
  verifySavedResult,
} from "../lib/jev-chat/persistence";
import {
  runLiveBenchmark,
  parseBenchmarkReport,
} from "../lib/jev-chat/benchmark";
import type { EngineInput, JevTransport } from "../lib/jev-chat/types";

const input = (text: string): EngineInput => ({
  topic: "guide",
  notes: "",
  style: "balanced",
  mode: "live",
  messages: [{ role: "user", text }],
});
const uncertain: JevTransport = async (payload) => ({
  answers: Object.fromEntries(
    Object.entries(payload.questions).map(([id, q]) => [
      id,
      q.type === "noul"
        ? { type: "noul", noul: id === "conflict" ? 0 : 0.95 }
        : {
            type: "choice",
            choice: id === "intent" ? "explain" : Object.keys(q.criteria!)[0],
            confidence: 0.28,
          },
    ]),
  ),
});

test("documented help answers in live mode without asking a probabilistic classifier", async () => {
  let calls = 0;
  const result = await respond(input("Explain how Jev works"), {
    transport: async (...args) => {
      calls++;
      return uncertain(...args);
    },
  });
  assert.equal(result.status, "answered");
  assert.match(result.text, /Jev evaluates typed questions/);
  assert.equal(calls, 0);
  assert.equal(result.trace.calls, 0);
  assert.equal(result.trace.semanticVerification, "scripted-help");
  assert.deepEqual(result.signal, { probability: null, confidence: null });
  assert.equal(result.trace.inputTokens, 0);
  assert.equal(result.trace.outputTokens, 0);
  assert.equal(
    await verifySavedResult(
      parseSavedResult(JSON.parse(JSON.stringify(result)))!,
      "",
    ),
    true,
  );
});

test("repetition feedback acknowledges a failed reply and recovers the actual previous help request", async () => {
  const request = input("Explain how Jev works");
  const failed = clarification("uncertain", buildContext(request));
  request.messages.push(
    {
      role: "assistant",
      text: failed.sections[0].text,
      options: failed.options,
    },
    { role: "user", text: "why are you repeating yourself?" },
  );
  const result = await respond(request, { transport: uncertain });
  assert.equal(result.status, "answered");
  assert.match(result.text, /previous reply/i);
  assert.match(result.text, /Jev evaluates typed questions/);
  assert.ok(!result.text.includes("I’m not sure which task you mean"));
  assert.equal(result.trace.calls, 0);
});

test("an unresolved request after a clarification receives recovery guidance", async () => {
  const request = input("Something not in the help menu");
  const first = await respond(request, { transport: uncertain });
  request.messages.push(
    { role: "assistant", text: first.text, options: first.options },
    { role: "user", text: "Please answer my question" },
  );
  const second = await respond(request, { transport: uncertain });
  assert.equal(second.status, "clarify");
  assert.notEqual(second.text, first.text);
  assert.match(second.text, /selection checks|reliable response/);
  assert.ok(second.options.includes("Explain how Jev works"));
});

test("help routing never discards extra instructions, negation, or source questions", async () => {
  for (const text of [
    "Do not explain how Jev works",
    "Explain how Jev works and compare it to the latest model",
    'Quote "Explain how Jev works"',
    "Why are you repeating yourself? Also calculate my taxes.",
    "How does the Atlas project work?",
  ]) {
    const result = await respond(input(text), { transport: uncertain });
    assert.equal(result.status, "clarify", text);
    assert.equal(result.trace.calls, 1);
    assert.notEqual(result.trace.semanticVerification, "scripted-help");
  }
  await assert.rejects(
    () =>
      respond(input("Explain the warranty in my notes"), {
        transport: async () => {
          throw Error("provider failed");
        },
      }),
    /provider failed/,
  );
});

test("zero-request help is honestly recorded and replayed by the benchmark", async () => {
  const { mode: _mode, ...request } = input("Explain how Jev works");
  const report = await runLiveBenchmark(
    {
      version: "jev-chat-evaluation-v1",
      cases: [
        {
          id: "help",
          category: "guide",
          input: request,
          expectations: { expectedIntent: "explain", mustClarify: false },
          evidenceNotes: "Documented help, not a measurement of model quality.",
        },
      ],
    },
    {
      caseIds: ["help"],
      maxRequests: 2,
      execution: "mocked",
      transport: uncertain,
    },
  );
  assert.equal(report.summary.requests, 0);
  assert.equal(report.cases[0].mechanical!.passed, true);
  assert.equal(
    (await parseBenchmarkReport(JSON.parse(JSON.stringify(report)))).summary
      .completed,
    1,
  );
  const forged = structuredClone(report);
  forged.cases[0].result!.trace.semanticVerification = "not-assessed";
  await assert.rejects(() => parseBenchmarkReport(forged));
});
