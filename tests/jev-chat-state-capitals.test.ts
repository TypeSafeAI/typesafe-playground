import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { respond } from "../lib/jev-chat/engine";
import {
  parseSavedResult,
  verifySavedResult,
} from "../lib/jev-chat/persistence";
import {
  runLiveBenchmark,
  parseBenchmarkReport,
} from "../lib/jev-chat/benchmark";
import type { EngineInput } from "../lib/jev-chat/types";

// Independently checked against https://www.50states.com/tools/thelist.htm.
const expected = readFileSync(
  new URL("./fixtures/us-state-capitals.txt", import.meta.url),
  "utf8",
)
  .trim()
  .split("\n")
  .map((line) => line.split("|"));
const input = (text: string): EngineInput => ({
  messages: [{ role: "user", text }],
  topic: "guide",
  notes: "",
  mode: "demo",
  style: "balanced",
});

test("all 50 state names and postal abbreviations return the correct capital without inference", async () => {
  assert.equal(expected.length, 50);
  assert.equal(new Set(expected.map((row) => row[0])).size, 50);
  for (const [code, state, capital] of expected) {
    for (const mode of ["demo", "live"] as const) {
      for (const prompt of [
        `What is the capital of ${state}?`,
        `capital of ${code}`,
      ]) {
        const result = await respond({ ...input(prompt), mode });
        assert.equal(
          result.text,
          `The capital of ${state} is ${capital}.`,
          prompt,
        );
        assert.equal(result.status, "answered");
        assert.equal(result.trace.semanticVerification, "scripted-knowledge");
        assert.equal(result.trace.calls, 0);
        assert.deepEqual(result.signal, {
          probability: null,
          confidence: null,
        });
        assert.ok(parseSavedResult(JSON.parse(JSON.stringify(result))));
        assert.equal(await verifySavedResult(result, ""), true);
      }
    }
  }
});

test("capital questions support possessives, reverse lookup, multiple states and factual correction", async () => {
  for (const [prompt, answer] of [
    ["What's Texas's capital?", "The capital of Texas is Austin."],
    ["What is New York’s capital?", "The capital of New York is Albany."],
    ["Texas capital", "The capital of Texas is Austin."],
    ["Capital of the state of NY", "The capital of New York is Albany."],
    [
      "Tell me the capital city of the state of Alaska.",
      "The capital of Alaska is Juneau.",
    ],
    [
      "Which state is Austin the capital of?",
      "Austin is the capital of Texas.",
    ],
    [
      "What state has St. Paul as its capital?",
      "Saint Paul is the capital of Minnesota.",
    ],
    ["Is Houston the capital of Texas?", "No. The capital of Texas is Austin."],
    ["Is Austin the capital of TX?", "Yes. The capital of Texas is Austin."],
    [
      "Is Austin still the capital of Texas?",
      "Yes. The capital of Texas is Austin.",
    ],
    [
      "Is Austin currently the capital of Texas?",
      "Yes. The capital of Texas is Austin.",
    ],
    [
      "Is the city of Austin the capital of Texas?",
      "Yes. The capital of Texas is Austin.",
    ],
    [
      "What are the capitals of Texas and New York?",
      "The capital of Texas is Austin.\nThe capital of New York is Albany.",
    ],
  ]) {
    const result = await respond({ ...input(prompt), personality: "playful" });
    assert.equal(result.text, answer, prompt);
  }
});

test("the complete reference lists every state exactly once without truncation", async () => {
  for (const prompt of [
    "List all 50 state capitals",
    "What are the capitals of all states?",
    "US states and capitals",
  ]) {
    const result = await respond(input(prompt));
    assert.equal(
      result.trace.semanticVerification,
      "scripted-knowledge",
      prompt,
    );
    assert.deepEqual(
      result.sections[1].text.split("\n"),
      expected.map(([, state, capital]) => `${state} — ${capital}`),
    );
    assert.equal(await verifySavedResult(result, ""), true);
  }
});

test("capital lookup leaves unsupported geography, quoted prompts and extra tasks to normal interpretation", async () => {
  for (const prompt of [
    "What is the capital of France?",
    "What is the capital of Puerto Rico?",
    "What is the capital of Washington, DC?",
    "What was the capital of Texas in 1836?",
    "What is the capital of Texas and its population?",
    "What are the capitals of Texas and Atlantis?",
    'Quote "What is the capital of Texas?"',
    "According to my notes, what is the capital of Texas?",
    "List all state capitals and their populations",
    "Texas is the capital of what?",
    "Is Austin not the capital of Texas?",
    "Is Austin or Houston the capital of Texas?",
    "Is Austin actually the capital of Texas?",
  ]) {
    const result = await respond(input(prompt));
    assert.notEqual(
      result.trace.semanticVerification,
      "scripted-knowledge",
      prompt,
    );
  }
});

test("built-in knowledge remains an honest zero-request benchmark result", async () => {
  const { mode: _mode, ...request } = input("What is the capital of Texas?");
  const report = await runLiveBenchmark(
    {
      version: "jev-chat-evaluation-v1",
      cases: [
        {
          id: "capital",
          category: "guide",
          input: request,
          expectations: {
            expectedIntent: "answer",
            requiredSubstrings: ["Austin"],
          },
          evidenceNotes: "Built-in reference lookup, not live model knowledge.",
        },
      ],
    },
    {
      caseIds: ["capital"],
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
