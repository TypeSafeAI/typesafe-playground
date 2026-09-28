import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePayload } from "../lib/api";
import {
  IQ_QUESTIONS,
  buildIqPayload,
  resolveIqAnswer,
  summarizeIq,
  type IqResult,
} from "../lib/iq-test";
import { runIqTest } from "../lib/iq-test-runner";
import { estimateIq } from "../lib/iq-estimate";

const response = (choice = "a") => ({
  answers: {
    answer: {
      type: "choice",
      choice,
      confidence: 0.8,
      probabilities: { a: 0.7, b: 0.1, c: 0.1, d: 0.1 },
    },
  },
});

test("the reference key agrees with independently worked solutions", () => {
  const q = IQ_QUESTIONS;
  assert.equal(q.length, 12);
  assert.equal(new Set(q.map((item) => item.id)).size, 12);
  // Work from the stated rules instead of the implementation's answer IDs.
  const solutions = [
    String(27 + (27 - 18) + 2),
    String(25 * 2 - 1),
    String(8 + 3),
    String((6 / 4 / 3) * 10 * 5),
    "No wugs are mips.",
    "Gold box",
    "Cannot be determined",
    "The beacon is off.",
    (0b1110 ^ 0b0101).toString(2).padStart(4, "0"),
    String(6 * 2 + 5),
    "3 1 / 4 2",
    String(2 * (2 * 3 + 4) + 5),
  ];
  q.forEach((item, i) => {
    assert.equal(item.options[item.expected], solutions[i], item.id);
    assert.equal(new Set(Object.values(item.options)).size, 4);
    assert.ok(item.assumption.length && item.explanation.length);
  });
  // Exactly one of the three labels is true only for the gold placement.
  const validBoxes = ["gold", "silver", "wood"].filter(
    (box) =>
      [box === "silver", box !== "silver", box !== "gold"].filter(Boolean)
        .length === 1,
  );
  assert.deepEqual(validBoxes, ["gold"]);
  // Both blue and nonblue glass models satisfy the premises: no entailment.
  for (const glassIsBlue of [true, false]) {
    const tokens = [
      { glass: true, round: true, blue: glassIsBlue },
      { glass: false, round: true, blue: true },
    ];
    assert.ok(tokens.every((t) => !t.glass || t.round));
    assert.ok(tokens.some((t) => t.round && t.blue));
    assert.equal(
      tokens.some((t) => t.glass && t.blue),
      glassIsBlue,
    );
  }
});

test("requests are valid closed choices with no reference key or previous answers", () => {
  for (const question of IQ_QUESTIONS) {
    const payload = buildIqPayload(question);
    assert.doesNotThrow(() => validatePayload(payload));
    assert.deepEqual(Object.keys(payload.questions), ["answer"]);
    assert.deepEqual(payload.questions.answer.criteria, question.options);
    assert.deepEqual(Object.keys(payload.state).sort(), [
      "assumption",
      "prompt",
    ]);
    const text = JSON.stringify(payload);
    assert.ok(!text.includes(question.explanation));
    assert.ok(!/"expected"|"explanation"|"correct"|"history"/.test(text));
  }
});

test("malformed answers cannot become correct guesses", () => {
  const question = IQ_QUESTIONS[0];
  const valid = resolveIqAnswer(question, response(question.expected));
  assert.equal(valid.status, "correct");
  assert.equal(valid.confidence, 0.8);
  const base = response().answers.answer;
  for (const answer of [
    null,
    {},
    { ...base, type: "noul" },
    { ...base, choice: "toString" },
    { ...base, confidence: NaN },
    { ...base, probabilities: { a: 1 } },
    { ...base, probabilities: { a: 0.7, b: 0.1, c: 0.1, d: 0.2 } },
    { ...base, probabilities: { ...base.probabilities, extra: 0 } },
    { ...base, probabilities: { ...base.probabilities, b: -0.1 } },
  ]) {
    const result = resolveIqAnswer(question, { answers: { answer } });
    assert.equal(result.status, "invalid");
    assert.equal(result.choice, null);
  }
});

test("only fully answered tests get a final percentage", () => {
  const all = IQ_QUESTIONS.map((q) => resolveIqAnswer(q, response(q.expected)));
  assert.equal(summarizeIq(all).percentage, 100);
  assert.equal(summarizeIq(all).iqEstimate?.value, 145);
  assert.equal(summarizeIq(all.slice(0, 1)).iqEstimate, null);
  assert.equal(summarizeIq([]).iqEstimate, null);
  assert.equal(summarizeIq(all.slice(0, 1)).percentage, null);
  assert.equal(summarizeIq([]).correct, 0);
  const partial = [
    ...all.slice(0, -1),
    {
      id: IQ_QUESTIONS[11].id,
      status: "failed",
      choice: null,
      confidence: null,
      probabilities: null,
    } as IqResult,
  ];
  assert.equal(summarizeIq(partial).percentage, null);
  assert.equal(summarizeIq(partial).iqEstimate, null);
  assert.equal(summarizeIq(partial).answered, 11);
  assert.throws(() => summarizeIq([...all, all[0]]), /Duplicate/);
});

test("the provisional IQ conversion is bounded, monotonic and reproducible for every score", () => {
  const values = Array.from(
    { length: 13 },
    (_, correct) => estimateIq(correct, 12).value,
  );
  assert.deepEqual(
    values,
    [55, 63, 70, 78, 85, 93, 100, 108, 115, 123, 130, 138, 145],
  );
  const estimate = estimateIq(6, 12);
  assert.deepEqual(estimate, {
    value: 100,
    method: "assumed-reference-v1",
    calibration: "uncalibrated",
    questionCount: 12,
    assumedRawMean: 6,
    assumedRawStandardDeviation: 2,
    scaleMean: 100,
    scaleStandardDeviation: 15,
  });
});

test("the IQ conversion rejects invalid scores and other question-set sizes", () => {
  for (const correct of [-1, 13, 0.5, NaN, Infinity])
    assert.throws(() => estimateIq(correct, 12), /integer score/);
  for (const total of [0, 4, 11, 13, NaN, Infinity])
    assert.throws(() => estimateIq(3, total), /12-question/);
});

test("reported confidence does not raise or lower the IQ estimate", () => {
  const answers = IQ_QUESTIONS.map((q) => resolveIqAnswer(q, response("a")));
  const low = answers.map((r) => ({ ...r, confidence: 0.01 }));
  const high = answers.map((r) => ({ ...r, confidence: 1 }));
  assert.equal(summarizeIq(low).iqEstimate?.value, 78);
  assert.deepEqual(summarizeIq(low).iqEstimate, summarizeIq(high).iqEstimate);
});

test("live runs make exactly twelve isolated requests and emit results in order", async () => {
  let count = 0;
  const spacing: number[] = [];
  const observed: IqResult[] = [];
  const results = await runIqTest({
    mode: "live",
    signal: new AbortController().signal,
    transport: async (payload) => {
      assert.deepEqual(payload, buildIqPayload(IQ_QUESTIONS[count++]));
      return response();
    },
    onResult: (result) => observed.push(result),
    wait: async (ms) => {
      spacing.push(ms);
    },
  });
  assert.equal(count, 12);
  assert.deepEqual(
    spacing,
    Array(12).fill(2000),
    "every answer remains visible, including the last",
  );
  assert.deepEqual(results, observed);
  assert.deepEqual(
    results.map((r) => r.id),
    IQ_QUESTIONS.map((q) => q.id),
  );
});

test("category breakdowns count wrong answers separately and leave unfinished categories unscored", () => {
  const results = IQ_QUESTIONS.map((q) => resolveIqAnswer(q, response("a")));
  const summary = summarizeIq(results);
  assert.equal(summary.incorrect, 9);
  assert.equal(summary.unscored, 0);
  assert.deepEqual(
    summary.categories,
    ["Numerical", "Logical", "Patterns"].map((category) => ({
      category,
      total: 4,
      answered: 4,
      correct: 1,
      incorrect: 3,
      unscored: 0,
      percentage: 25,
    })),
  );
  const partial = summarizeIq(results.slice(0, 5));
  assert.equal(partial.percentage, null);
  assert.equal(partial.categories[0].percentage, 25);
  assert.equal(partial.categories[1].percentage, null);
  assert.equal(partial.categories[1].unscored, 3);
  assert.equal(partial.categories[2].unscored, 4);
});

test("the answer is emitted before its reading pause, and the next request waits", async () => {
  const order: string[] = [];
  await runIqTest({
    mode: "live",
    signal: new AbortController().signal,
    transport: async () => {
      order.push("request");
      return response();
    },
    onResult: () => {
      order.push("answer");
    },
    wait: async (ms) => {
      assert.equal(ms, 2000);
      order.push("read");
    },
  });
  assert.deepEqual(
    order,
    Array.from({ length: 12 }, () => ["request", "answer", "read"]).flat(),
  );
});

test("cancellation before or between questions never dispatches another request", async () => {
  for (const before of [true, false]) {
    const controller = new AbortController();
    if (before) controller.abort();
    let calls = 0;
    const results = await runIqTest({
      mode: "live",
      signal: controller.signal,
      transport: async () => {
        calls++;
        return response();
      },
      wait: async () => {
        controller.abort();
      },
    });
    assert.equal(calls, before ? 0 : 1);
    assert.equal(results.length, before ? 0 : 1);
    assert.equal(summarizeIq(results).complete, false);
  }
});

test("demo is explicitly local and never calls the injected provider", async () => {
  const results = await runIqTest({
    mode: "demo",
    signal: new AbortController().signal,
    transport: async () => {
      throw Error("Must not call provider");
    },
    wait: async () => {},
  });
  assert.equal(results.length, 12);
  assert.ok(
    results.every(
      (r) => r.choice === "a" && r.confidence === null && r.latencyMs === null,
    ),
  );
});

test("provider and malformed-response failures stop without filling unanswered items", async () => {
  for (const malformed of [false, true]) {
    let calls = 0;
    const results = await runIqTest({
      mode: "live",
      signal: new AbortController().signal,
      transport: async () => {
        calls++;
        if (calls === 1) return response();
        if (malformed) return {};
        throw Error("Provider unavailable");
      },
      wait: async () => {},
    });
    assert.equal(calls, 2);
    assert.equal(results[1].status, malformed ? "invalid" : "failed");
    assert.equal(summarizeIq(results).percentage, null);
  }
});

test("cancellation discards a late response and never starts another request", async () => {
  const controller = new AbortController();
  let calls = 0;
  const results = await runIqTest({
    mode: "live",
    signal: controller.signal,
    transport: async () => {
      calls++;
      controller.abort();
      return response();
    },
    wait: async () => {},
  });
  assert.equal(calls, 1);
  assert.equal(results[0].status, "cancelled");
  assert.equal(results[0].choice, null);
  assert.equal(summarizeIq(results).answered, 0);
});
