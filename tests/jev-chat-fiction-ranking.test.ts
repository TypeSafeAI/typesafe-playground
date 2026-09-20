import test from "node:test";
import assert from "node:assert/strict";
import {
  fictionRubric,
  readFictionScore,
  selectFictionPlan,
} from "../lib/jev-chat/fiction-ranking";
import type { Plan } from "../lib/jev-chat/types";

function plan(id: string): Plan {
  return {
    id,
    intent: "create",
    title: id,
    status: "answered",
    sources: [],
    options: [],
    sections: [
      { text: "A fictional scene.", provenance: "authored" },
      {
        text: "The bell rang after its trapped clapper was released.",
        provenance: "hypothetical",
      },
    ],
    story: {
      version: "jev-story-v1",
      choices: {
        character: "keeper",
        setting: "coast",
        obstacle: "silence",
        resolution: "listen",
      },
      theme: null,
      tone: "reflective",
      ending: "resolved",
      variant: 0,
      style: "balanced",
    },
  };
}
const score = (value: number, confidence = 0.9) => ({
  type: "score",
  score: value,
  confidence,
  probabilities: { "0": 1 - value, "1": value },
});
const support = (value: number) => ({ type: "noul", noul: value });
function answers(plans: Plan[], accepted = 0.9): Record<string, unknown> {
  return Object.fromEntries(
    plans.flatMap((candidate) => [
      [`supported_${candidate.id}`, support(accepted)],
      [`progression_${candidate.id}`, score(0.7)],
      [`texture_${candidate.id}`, score(0.7)],
    ]),
  );
}

test("fiction rubric exposes separate two-level progression and texture dimensions", () => {
  assert.deepEqual(Object.keys(fictionRubric), ["progression", "texture"]);
  assert.equal(fictionRubric.progression.length, 2);
  assert.equal(fictionRubric.texture.length, 2);
  assert.ok(
    [...fictionRubric.progression, ...fictionRubric.texture].every(
      (entry) => typeof entry === "string" && entry.length > 0,
    ),
  );
  assert.match(fictionRubric.progression[1], /causal|actions/i);
  assert.match(fictionRubric.texture[1], /character|setting/i);
});

test("equally accepted candidates rank without a confident final Choice", () => {
  const plans = [plan("a"), plan("b"), plan("c")];
  const raw = answers(plans);
  raw.progression_b = score(0.85, 0.01);
  raw.progression_c = score(0.8, 1);
  raw.final = { type: "choice", choice: "a", confidence: 0.34 };
  assert.equal(selectFictionPlan(plans, raw), plans[1]);
});

test("high ranking scores cannot rescue rejected support and the acceptance boundary is exactly .8", () => {
  const plans = [plan("a"), plan("b")];
  const raw = answers(plans);
  raw.supported_a = support(0.8);
  raw.supported_b = support(0.799999);
  raw.progression_a = score(0);
  raw.texture_a = score(0);
  raw.progression_b = score(1);
  raw.texture_b = score(1);
  assert.equal(selectFictionPlan(plans, raw), plans[0]);
  raw.supported_a = support(0.799999);
  assert.equal(selectFictionPlan(plans, raw), null);
});

test("progression has priority, texture breaks progression ties, and exact ties retain input order", () => {
  const plans = [plan("a"), plan("b"), plan("c")];
  const raw = answers(plans);
  raw.progression_a = score(0.9);
  raw.progression_b = score(0.89);
  raw.texture_a = score(0.1);
  raw.texture_b = score(1);
  assert.equal(selectFictionPlan(plans, raw), plans[0]);
  raw.progression_b = score(0.9);
  assert.equal(selectFictionPlan(plans, raw), plans[1]);
  raw.texture_a = score(1);
  assert.equal(selectFictionPlan(plans, raw), plans[0]);
  assert.equal(
    selectFictionPlan([plans[1], plans[0], plans[2]], raw),
    plans[1],
  );
});

test("one candidate needs support only and does not inspect unused ranking answers", () => {
  const candidate = plan("only");
  const raw: Record<string, unknown> = { supported_only: support(0.8) };
  let reads = 0;
  Object.defineProperty(raw, "progression_only", {
    get() {
      reads++;
      throw new Error("unused");
    },
    enumerable: true,
  });
  assert.equal(selectFictionPlan([candidate], raw), candidate);
  assert.equal(reads, 0);
  assert.equal(
    selectFictionPlan([candidate], { supported_only: support(0.79) }),
    null,
  );
  assert.throws(
    () => selectFictionPlan([candidate], {}),
    /Invalid fiction assessment/,
  );
});

test("all required supports and scores parse even for ineligible candidates", () => {
  const plans = [plan("accepted"), plan("rejected")];
  const raw = answers(plans);
  raw.supported_rejected = support(0.1);
  for (const key of Object.keys(raw)) {
    const missing = { ...raw };
    delete missing[key];
    assert.throws(
      () => selectFictionPlan(plans, missing),
      /Invalid fiction assessment/,
      key,
    );
    assert.throws(
      () =>
        selectFictionPlan(plans, {
          ...raw,
          [key]: { type: "choice", choice: "yes" },
        }),
      /Invalid fiction assessment/,
      key,
    );
  }
  for (const noul of [-0.1, 1.1, NaN, Infinity, "0.9", undefined]) {
    assert.throws(
      () =>
        selectFictionPlan(plans, {
          ...raw,
          supported_rejected: { type: "noul", noul },
        }),
      /Invalid fiction assessment/,
    );
  }
});

test("score parsing retains only detached numeric fields and accepts low confidence", () => {
  const raw = {
    ...score(0.3, 0),
    legend: { "0": "private provider prose", "1": "more provider prose" },
    explanation: "not retained",
  };
  const parsed = readFictionScore(raw);
  assert.deepEqual(parsed, score(0.3, 0));
  assert.notEqual(parsed, raw);
  assert.notEqual(parsed.probabilities, raw.probabilities);
  raw.probabilities["1"] = 1;
  raw.score = 1;
  assert.equal(parsed.score, 0.3);
  assert.equal(parsed.probabilities["1"], 0.3);
  assert.doesNotMatch(
    JSON.stringify(parsed),
    /private|prose|legend|explanation/,
  );
});

test("score consistency uses an absolute 1e-6 tolerance without normalizing or coercing", () => {
  const accepted = {
    type: "score",
    score: 0.5,
    confidence: 0.001,
    probabilities: { "0": 0.5, "1": 0.5000005 },
  };
  assert.deepEqual(readFictionScore(accepted), accepted);
  assert.throws(
    () =>
      readFictionScore({
        ...accepted,
        probabilities: { "0": 0.5, "1": 0.500002 },
      }),
    /Invalid fiction score/,
  );
  assert.throws(
    () =>
      readFictionScore({
        ...accepted,
        score: 0.500002,
        probabilities: { "0": 0.5, "1": 0.5 },
      }),
    /Invalid fiction score/,
  );
});

test("missing, inconsistent, nonfinite and malformed score data reject", () => {
  const invalid: unknown[] = [
    null,
    [],
    "0.9",
    {},
    { ...score(0.5), type: "noul" },
    ...[-0.1, 1.1, NaN, Infinity, "0.5", undefined].flatMap((value) => [
      { ...score(0.5), score: value },
      { ...score(0.5), confidence: value },
      { ...score(0.5), probabilities: { "0": value, "1": 0.5 } },
      { ...score(0.5), probabilities: { "0": 0.5, "1": value } },
    ]),
    { ...score(0.5), probabilities: { "0": 0.5 } },
    { ...score(0.5), probabilities: { "1": 0.5 } },
    { ...score(0.5), probabilities: { "0": 0.5, "1": 0.5, "2": 0 } },
    { ...score(0.5), probabilities: [0.5, 0.5] },
    { ...score(0.5), probabilities: { "0": 0.8, "1": 0.5 } },
    { ...score(0.5), score: 0.6 },
  ];
  for (const value of invalid)
    assert.throws(
      () => readFictionScore(value),
      /^Error: Invalid fiction score\.$/,
    );
});

test("accessors are rejected without execution while ignored provider fields stay unread", () => {
  let reads = 0;
  const ignored = score(0.6);
  Object.defineProperty(ignored, "legend", {
    enumerable: true,
    get() {
      reads++;
      throw new Error("private legend");
    },
  });
  assert.deepEqual(readFictionScore(ignored), score(0.6));
  const raw = score(0.6);
  Object.defineProperty(raw, "score", {
    enumerable: true,
    get() {
      reads++;
      return 0.6;
    },
  });
  assert.throws(() => readFictionScore(raw), /Invalid fiction score/);
  const nested = score(0.6);
  Object.defineProperty(nested.probabilities, "1", {
    enumerable: true,
    get() {
      reads++;
      return 0.6;
    },
  });
  assert.throws(() => readFictionScore(nested), /Invalid fiction score/);
  const plans = [plan("a")];
  const provider = {};
  Object.defineProperty(provider, "supported_a", {
    enumerable: true,
    get() {
      reads++;
      return support(0.9);
    },
  });
  assert.throws(
    () => selectFictionPlan(plans, provider),
    /Invalid fiction assessment/,
  );
  assert.equal(reads, 0);
});

test("invalid, non-fiction, duplicate and oversized plan sets fail", () => {
  const valid = plan("a");
  const withoutStory = { ...valid };
  delete withoutStory.story;
  const sets: unknown[] = [
    null,
    [],
    [valid, valid],
    [valid, plan("b"), plan("c"), plan("d")],
    [{ ...valid, intent: "answer" }],
    [{ ...valid, status: "clarify" }],
    [withoutStory],
    [{ ...valid, story: { ...valid.story, version: "future" } }],
    [{ ...valid, id: "" }],
    [{ ...valid, id: "x".repeat(1000) }],
  ];
  for (const plans of sets)
    assert.throws(
      () => selectFictionPlan(plans as Plan[], answers([valid])),
      /Invalid fiction assessment/,
    );
});

test("selection leaves frozen candidate order and assessment data unchanged", () => {
  const plans = [plan("first"), plan("second")];
  const raw = answers(plans);
  raw.progression_second = score(0.9, 0);
  const before = structuredClone({ plans, raw });
  for (const candidate of plans) {
    Object.freeze(candidate.story!.choices);
    Object.freeze(candidate.story!);
    Object.freeze(candidate);
  }
  Object.freeze(plans);
  for (const answer of Object.values(raw)) Object.freeze(answer);
  Object.freeze(raw);
  assert.equal(selectFictionPlan(plans, raw), plans[1]);
  assert.deepEqual({ plans, raw }, before);
});
