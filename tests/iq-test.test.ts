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
  assert.equal(q.length, 24);
  assert.equal(new Set(q.map((item) => item.id)).size, 24);
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
    String((160 * 115 * 85) / 10000),
    `${24 / (12 / 4 + 12 / 6)} km/h`,
    "12/25",
    String(
      Array.from({ length: 100 }, (_, i) => i + 1).find(
        (n) => n % 5 === 2 && n % 7 === 4,
      ),
    ),
    "K is signed and not audited.",
    "No; a red indicator is possible but not required.",
    "Exactly one of B and D is on.",
    "A B D C",
    "1 4 7 / 2 5 8 / 3 6 9",
    String(9.5 / 2),
    (0b1011 ^ 0b0110).toString(2).slice(1) + (0b1011 ^ 0b0110).toString(2)[0],
    String(3 * (3 * 5 - 2 * 2) - 2 * (3 * 2 - 2 * 5)),
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
      id: IQ_QUESTIONS[IQ_QUESTIONS.length - 1].id,
      status: "failed",
      choice: null,
      confidence: null,
      probabilities: null,
    } as IqResult,
  ];
  assert.equal(summarizeIq(partial).percentage, null);
  assert.equal(summarizeIq(partial).iqEstimate, null);
  assert.equal(summarizeIq(partial).answered, 23);
  assert.throws(() => summarizeIq([...all, all[0]]), /Duplicate/);
});

test("the provisional IQ conversion is bounded, monotonic and reproducible for every score", () => {
  const values = Array.from(
    { length: 25 },
    (_, correct) => estimateIq(correct, 24).value,
  );
  assert.deepEqual(
    values,
    [
      55, 59, 63, 66, 70, 74, 78, 81, 85, 89, 93, 96, 100, 104, 108, 111, 115,
      119, 123, 126, 130, 134, 138, 141, 145,
    ],
  );
  const estimate = estimateIq(12, 24);
  assert.deepEqual(estimate, {
    value: 100,
    method: "assumed-reference-v2",
    calibration: "uncalibrated",
    questionCount: 24,
    assumedRawMean: 12,
    assumedRawStandardDeviation: 4,
    scaleMean: 100,
    scaleStandardDeviation: 15,
  });
});

test("the IQ conversion rejects invalid scores and other question-set sizes", () => {
  for (const correct of [-1, 25, 0.5, NaN, Infinity])
    assert.throws(() => estimateIq(correct, 24), /integer score/);
  for (const total of [0, 4, 12, 23, 25, NaN, Infinity])
    assert.throws(() => estimateIq(3, total), /24-question/);
});

test("reported confidence does not raise or lower the IQ estimate", () => {
  const answers = IQ_QUESTIONS.map((q) => resolveIqAnswer(q, response("a")));
  const low = answers.map((r) => ({ ...r, confidence: 0.01 }));
  const high = answers.map((r) => ({ ...r, confidence: 1 }));
  assert.equal(summarizeIq(low).iqEstimate?.value, 78);
  assert.deepEqual(summarizeIq(low).iqEstimate, summarizeIq(high).iqEstimate);
});

test("live runs make exactly twenty-four isolated requests and emit results in order", async () => {
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
  assert.equal(count, 24);
  assert.deepEqual(
    spacing,
    Array(24).fill(2000),
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
  assert.equal(summary.incorrect, 18);
  assert.equal(summary.unscored, 0);
  assert.deepEqual(
    summary.categories,
    ["Numerical", "Logical", "Patterns"].map((category) => ({
      category,
      total: 8,
      answered: 8,
      correct: 2,
      incorrect: 6,
      unscored: 0,
      percentage: 25,
    })),
  );
  const partial = summarizeIq(
    results.filter((_, i) => i < 4 || (i >= 12 && i < 16) || i === 4),
  );
  assert.equal(partial.percentage, null);
  assert.equal(partial.categories[0].percentage, 25);
  assert.equal(partial.categories[1].percentage, null);
  assert.equal(partial.categories[1].unscored, 7);
  assert.equal(partial.categories[2].unscored, 8);
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
    Array.from({ length: 24 }, () => ["request", "answer", "read"]).flat(),
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
  assert.equal(results.length, 24);
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

test("expanded set balances categories, answer positions and editorial difficulty", () => {
  for (const category of ["Numerical", "Logical", "Patterns"]) {
    const questions = IQ_QUESTIONS.filter((q) => q.category === category);
    assert.equal(questions.length, 8);
    for (const choice of ["a", "b", "c", "d"])
      assert.equal(questions.filter((q) => q.expected === choice).length, 2);
  }
  assert.deepEqual(
    ["Warm-up", "Intermediate", "Challenge"].map(
      (level) => IQ_QUESTIONS.filter((q) => q.difficulty === level).length,
    ),
    [6, 12, 6],
  );
});

test("new probability, logic and spatial references have independent exhaustive checks", () => {
  const byId = (id: string) => IQ_QUESTIONS.find((q) => q.id === id)!;
  // Enumerate five equally likely first draws and five equally likely second draws.
  const bag = ["r", "r", "r", "b", "b"];
  let red = 0;
  for (let first = 0; first < bag.length; first++) {
    const next = [...bag.filter((_, i) => i !== first), "b"];
    red += next.filter((colour) => colour === "r").length;
  }
  const replacement = byId("replacement-bag");
  assert.equal(replacement.options[replacement.expected], `${red}/25`);
  const models = Array.from({ length: 16 }, (_, bits) =>
    [0, 1, 2, 3].map((i) => !!(bits & (1 << i))),
  );
  const switches = models.filter(
    ([a, b, c, d]) =>
      [a, b, c, d].filter(Boolean).length === 2 &&
      (!a || b) &&
      (!b || !c) &&
      (!c || d) &&
      (!d || !b),
  );
  assert.deepEqual(switches, [
    [true, true, false, false],
    [false, false, true, true],
  ]);
  const universal = [
    ([a]: boolean[]) => a,
    ([, , c]: boolean[]) => !c,
    ([a, , , d]: boolean[]) => a && d,
    ([, b, , d]: boolean[]) => b !== d,
  ].map((predicate) => switches.every(predicate));
  assert.deepEqual(universal, [false, false, false, true]);
  assert.equal(byId("two-active-switches").expected, "d");
  const inspected = models
    .map(([cracked, red, inspected]) => ({ cracked, red, inspected }))
    .filter(
      (m) => m.inspected && (!m.cracked || m.red) && (!m.red || m.inspected),
    );
  assert.deepEqual(
    new Set(inspected.map((m) => m.red)),
    new Set([false, true]),
  );
  const audit = models.filter(
    ([signed, audited]) => (signed || audited) && !audited,
  );
  assert.ok(audit.every(([signed, audited]) => signed && !audited));
  const order = byId("constrained-order");
  const valid = Object.entries(order.options).filter(([, value]) => {
    const tiles = value.split(" ");
    return (
      tiles.indexOf("A") < tiles.indexOf("B") &&
      tiles.indexOf("C") === tiles.indexOf("D") + 1 &&
      [1, 2].includes(tiles.indexOf("B"))
    );
  });
  assert.deepEqual(
    valid.map(([key]) => key),
    [order.expected],
  );
  const grid = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ];
  const transformed = grid.map((row, r) =>
    row.map((_, c) => grid[2 - c][r]).reverse(),
  );
  const spatial = byId("rotate-reflect");
  assert.equal(
    transformed.map((row) => row.join(" ")).join(" / "),
    spatial.options[spatial.expected],
  );
});
