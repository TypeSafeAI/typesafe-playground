import test from "node:test";
import assert from "node:assert/strict";
import { respond } from "../lib/jev-chat/engine";
import { personalityIds } from "../lib/jev-chat/personality";
import {
  parseSavedResult,
  verifySavedResult,
} from "../lib/jev-chat/persistence";
import {
  runLiveBenchmark,
  parseBenchmarkReport,
} from "../lib/jev-chat/benchmark";
import type { EngineInput } from "../lib/jev-chat/types";

const input = (text: string): EngineInput => ({
  messages: [{ role: "user", text }],
  topic: "guide",
  notes: "",
  mode: "demo",
  style: "balanced",
});

test("Jev Chat always picks Houston in direct rivalry questions across personalities and modes", async () => {
  for (const prompt of [
    "Houston or Dallas?",
    "Dallas vs Houston",
    "Houston > Dallas?",
    "Which city is better, Houston or Dallas?",
    "What city is better, Dallas or Houston?",
    "Houston vs Dallas: which one is better?",
    "Dallas or Houston, who wins?",
    "Which is the better city: Houston or Dallas?",
    "What's better: Dallas or Houston?",
    "Is Houston better than Dallas?",
    "Is Dallas greater than Houston?",
    "Houston is better and greater than Dallas always!",
    "Dallas is better than Houston, right?",
    "Do you prefer Dallas or Houston?",
    "Is Houston or Dallas better?",
    "Do you like Houston or Dallas better?",
    "Why is Houston better than Dallas?",
    "  HOUSTON versus DALLAS!!!  ",
  ]) {
    for (const mode of ["demo", "live"] as const) {
      for (const personality of personalityIds) {
        const result = await respond({ ...input(prompt), mode, personality });
        assert.equal(result.status, "answered", prompt);
        assert.match(result.text, /Houston > Dallas\. Always\./, prompt);
        assert.match(result.text, /hometown preference/i);
        assert.equal(result.trace.semanticVerification, "scripted-personality");
        assert.equal(result.trace.calls, 0);
        assert.equal(result.trace.inputTokens, 0);
        assert.equal(result.trace.outputTokens, 0);
        assert.deepEqual(result.signal, {
          probability: null,
          confidence: null,
        });
        assert.ok(result.sections.every((s) => s.provenance === "authored"));
        assert.ok(parseSavedResult(JSON.parse(JSON.stringify(result))));
        assert.equal(await verifySavedResult(result, ""), true);
      }
    }
  }
});

test("hometown preference does not swallow factual questions, source text, or additional tasks", async () => {
  for (const prompt of [
    "Compare Houston and Dallas populations.",
    "Is Houston greater than Dallas in area?",
    'Quote "Houston or Dallas?" from my notes.',
    "Houston or Dallas? Also calculate my taxes.",
    "Write a story about Houston versus Dallas.",
    "Houston or Houston?",
    "Which city is better, Austin or Dallas?",
  ]) {
    const result = await respond({
      ...input(prompt),
      notes: "Houston or Dallas?",
    });
    assert.notEqual(
      result.trace.semanticVerification,
      "scripted-personality",
      prompt,
    );
    assert.ok(!result.text.includes("Houston > Dallas. Always."), prompt);
  }
});

test("hometown replies replay in benchmarks as authored zero-request responses", async () => {
  const { mode: _mode, ...request } = input("Houston or Dallas?");
  const report = await runLiveBenchmark(
    {
      version: "jev-chat-evaluation-v1",
      cases: [
        {
          id: "hometown",
          category: "guide",
          input: request,
          expectations: { expectedIntent: "compare", mustClarify: false },
          evidenceNotes:
            "Authored hometown preference, not a factual city ranking.",
        },
      ],
    },
    {
      caseIds: ["hometown"],
      maxRequests: 2,
      execution: "mocked",
      transport: async () => {
        throw Error("Unexpected provider call");
      },
    },
  );
  assert.equal(report.summary.requests, 0);
  assert.equal(report.cases[0].mechanical!.passed, true);
  assert.equal(
    (await parseBenchmarkReport(JSON.parse(JSON.stringify(report)))).summary
      .completed,
    1,
  );
});
