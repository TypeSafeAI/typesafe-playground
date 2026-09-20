import test from "node:test";
import assert from "node:assert/strict";
import {
  calculate,
  extractQuantities,
  verifyCalculation,
  type CalculationProof,
  type QuantityOperation,
} from "../lib/jev-chat/quantities";
import { hashValue } from "../lib/jev-chat/graph";
import type { Evidence } from "../lib/jev-chat/types";

function source(text: string, id = "note_1"): Evidence {
  return { id, title: id, text, source: id, provenance: "source", terms: [] };
}

async function compute(text: string, operation: QuantityOperation) {
  const evidence = [source(text)];
  const extracted = extractQuantities(evidence);
  assert.equal(extracted.overflow, false);
  assert.equal(extracted.facts.length, 2);
  const proof = await calculate(operation, extracted.facts, evidence);
  assert.ok(proof);
  assert.equal(await verifyCalculation(proof, evidence), true);
  return proof;
}

test("decimal addition uses exact rational values and source spans", async () => {
  const evidence = [source("Alpha costs 0.1 credits. Beta costs 0.2 credits.")];
  const { facts } = extractQuantities(evidence);
  assert.equal(facts.length, 2);
  assert.deepEqual(
    facts.map((fact) => fact.value),
    [
      { numerator: "1", denominator: "10" },
      { numerator: "1", denominator: "5" },
    ],
  );
  for (const fact of facts) {
    assert.equal(
      evidence[0].text.slice(fact.span.start, fact.span.end),
      fact.raw,
    );
    assert.equal(
      evidence[0].text.slice(fact.contextSpan.start, fact.contextSpan.end),
      fact.context,
    );
    assert.equal(fact.sourceId, "note_1");
    assert.equal(fact.attribute, "price");
  }
  const proof = await calculate("sum", facts, evidence);
  assert.ok(proof);
  assert.equal(proof.result.display, "0.3 credits");
  assert.deepEqual(proof.result.value, { numerator: "3", denominator: "10" });
});

test("absolute difference is symmetric and minimum/maximum preserve ties", async () => {
  const text = "Alpha costs 12 credits. Beta costs 18 credits.";
  assert.equal((await compute(text, "difference")).result.display, "6 credits");
  assert.equal((await compute(text, "minimum")).result.display, "12 credits");
  assert.equal((await compute(text, "maximum")).result.display, "18 credits");
  const evidence = [source(text)];
  const facts = extractQuantities(evidence).facts;
  const reversed = await calculate(
    "difference",
    [...facts].reverse(),
    evidence,
  );
  assert.equal(reversed?.result.display, "6 credits");
  for (const operation of ["minimum", "maximum"] as const) {
    assert.equal(
      (
        await compute(
          "Alpha costs 12 credits. Beta costs 12 credits.",
          operation,
        )
      ).result.display,
      "12 credits",
    );
  }
});

test("compatible explicit units convert exactly", async () => {
  const cases = [
    ["Alpha takes 1 hour. Beta takes 30 minutes.", "5400 seconds"],
    ["Alpha length is 1 km. Beta length is 25 cm.", "1000.25 meters"],
    ["Alpha mass is 2 kg. Beta mass is 250 mg.", "2000.25 grams"],
    ["Alpha size is 1 KiB. Beta size is 1 kB.", "2024 bytes"],
    ["Alpha costs $1.25. Beta costs USD 2.5.", "3.75 USD"],
    ["Alpha costs €1.25. Beta costs 2.5 EUR.", "3.75 EUR"],
    ["Alpha costs £1.25. Beta costs GBP 2.5.", "3.75 GBP"],
    ["Alpha has 2 seats. Beta has 3 seats.", "5 seats"],
  ];
  for (const [text, expected] of cases) {
    assert.equal((await compute(text, "sum")).result.display, expected, text);
  }
});

test("incompatible currencies, dimensions, attributes, and count nouns reject", async () => {
  const cases = [
    "Alpha costs $12. Beta costs €18.",
    "Alpha takes 12 seconds. Beta length is 18 meters.",
    "Alpha price is $12. Beta budget is $18.",
    "Alpha length is 12 meters. Beta width is 18 meters.",
    "Alpha has 12 seats. Beta has 18 users.",
  ];
  for (const text of cases) {
    const evidence = [source(text)];
    const { facts } = extractQuantities(evidence);
    assert.equal(facts.length, 2, text);
    for (const operation of [
      "sum",
      "difference",
      "minimum",
      "maximum",
      "ratio",
    ] as const) {
      assert.equal(
        await calculate(operation, facts, evidence),
        null,
        `${operation}: ${text}`,
      );
    }
  }
});

test("ratio remains exact for repeating decimals and rejects zero divisor", async () => {
  const fraction = await compute(
    "Alpha costs 1 credit. Beta costs 3 credits.",
    "ratio",
  );
  assert.equal(fraction.result.display, "1/3");
  assert.equal(fraction.result.dimension, "dimensionless");
  assert.equal(
    (await compute("Alpha costs 1 credit. Beta costs 8 credits.", "ratio"))
      .result.display,
    "0.125",
  );
  const evidence = [source("Alpha costs 1 credit. Beta costs 0 credits.")];
  assert.equal(
    await calculate("ratio", extractQuantities(evidence).facts, evidence),
    null,
  );
});

test("qualified, ranged, dated, signed, scientific, and malformed quantities are not exact facts", () => {
  const cases = [
    "Alpha costs about 12 credits.",
    "Alpha costs approximately 12 credits.",
    "Alpha costs roughly 12 credits.",
    "Alpha costs at least 12 credits.",
    "Alpha costs up to 12 credits.",
    "Alpha costs less than 12 credits.",
    "Alpha does not cost 12 credits.",
    "Alpha never costs 12 credits.",
    "If enrolled, Alpha costs 12 credits.",
    "Alpha costs 12 credits if enrolled.",
    "Alpha costs 12 credits unless sponsored.",
    "Alpha may cost 12 credits.",
    "Alpha costs 12-18 credits.",
    "Alpha costs 12–18 credits.",
    "Alpha costs between 12 and 18 credits.",
    "Alpha costs 12 to 18 credits.",
    "Alpha costs 12 credits per month.",
    "Alpha costs 12 credits/month.",
    "Alpha costs 12 credits in 2026.",
    "On 2026-09-18 Alpha costs 12 credits.",
    "On September 18 Alpha costs 12 credits.",
    "Alpha costs 12% credits.",
    "Alpha costs -12 credits.",
    "Alpha costs +12 credits.",
    "Alpha costs ~12 credits.",
    "Alpha costs 1e3 credits.",
    "Alpha costs 1,20 credits.",
    "Alpha costs 1.2.3 credits.",
  ];
  for (const text of cases)
    assert.deepEqual(extractQuantities([source(text)]).facts, [], text);
});

test("extraction does not treat authored guides as source facts or truncate overflows", () => {
  assert.deepEqual(
    extractQuantities([
      { ...source("Alpha costs 12 credits."), provenance: "authored" },
    ]),
    { facts: [], overflow: false },
  );
  const many = Array.from(
    { length: 33 },
    (_, i) => `Plan ${String.fromCharCode(65 + i)} costs ${i} credits.`,
  ).join(" ");
  assert.deepEqual(extractQuantities([source(many)]), {
    facts: [],
    overflow: true,
  });
  assert.deepEqual(extractQuantities([source("x".repeat(12001))]), {
    facts: [],
    overflow: true,
  });
  assert.deepEqual(
    extractQuantities([
      source("a".repeat(6001)),
      source("b".repeat(6000), "note_2"),
    ]),
    { facts: [], overflow: true },
  );
});

test("ordinary four-digit amounts are quantities, while cross-line conditions and alternatives are excluded", () => {
  const facts = extractQuantities([
    source("Alpha costs 2000 credits. Beta costs 1,000 credits."),
  ]).facts;
  assert.equal(facts.length, 2);
  assert.deepEqual(
    facts.map((fact) => fact.value.numerator),
    ["2000", "1000"],
  );
  for (const text of [
    "If enrolled,\nAlpha costs 12 credits.",
    "Alpha costs 12 credits. This only applies if enrolled.",
    "Alpha costs either 12 or 18 credits.",
    "Does Alpha cost 12 credits?",
    "Alpha costs 12 credits per-month.",
    "Alpha costs 12 credits/month.",
  ])
    assert.deepEqual(extractQuantities([source(text)]).facts, [], text);
});

test("currency ranges, non-ASCII negatives, date headings, and conditional rates are rejected", () => {
  for (const text of [
    "Alpha costs $12–$18.",
    "Alpha costs 12 credits–18 credits.",
    "Alpha costs −12 credits.",
    "Alpha won't cost 12 credits.",
    "Alpha costs 12 credits after enrolling.",
    "2026: Alpha costs 12 credits.",
    "Alpha costs $12 USD per month.",
    "Alpha costs twice 12 credits.",
    "Alpha costs 12 credits, excluding tax.",
    "Alpha costs $12 credits.",
    "Alpha costs 12 credits (maximum).",
  ])
    assert.deepEqual(extractQuantities([source(text)]).facts, [], text);
});

test("unknown predicates and fractional counts remain outside the arithmetic contract", async () => {
  const evidence = [source("Alpha: 12 credits. Beta: 18 credits.")];
  const facts = extractQuantities(evidence).facts;
  assert.equal(facts.length, 2);
  assert.equal(await calculate("sum", facts, evidence), null);
  assert.deepEqual(
    extractQuantities([source("Alpha has 1.5 seats.")]).facts,
    [],
  );
});

test("unsupported magnitude suffixes cannot become unscaled currency operands", async () => {
  for (const text of [
    "Alpha costs $12 million. Beta costs $18 million.",
    "Alpha costs USD 12 billion. Beta costs GBP 18 thousand.",
    "Alpha costs $12 trillion. Beta costs $18 hundred.",
  ]) {
    const evidence = [source(text)];
    const { facts } = extractQuantities(evidence);
    assert.deepEqual(facts, [], text);
    assert.equal(await calculate("sum", facts, evidence), null);
  }
});

test("currency prefixes require a complete amount rather than an accepted numeric prefix", async () => {
  for (const text of [
    "Alpha costs $12 bn. Beta costs $18 bn.",
    "Alpha costs $1,23. Beta costs $2,34.",
    "Alpha costs $1'000. Beta costs $2'000.",
    "Alpha costs $1\u2009000. Beta costs $2\u2009000.",
    "Alpha costs USD 12 mn. Beta costs EUR 18 mn.",
    "Alpha costs $12\nbn. Beta costs $18\nbn.",
    "Alpha costs $12 / quarter. Beta costs $18 / quarter.",
  ]) {
    const evidence = [source(text)];
    const { facts } = extractQuantities(evidence);
    assert.deepEqual(facts, [], text);
    assert.equal(await calculate("sum", facts, evidence), null);
  }
  assert.equal(
    (await compute("Alpha costs $1,000.25. Beta costs USD 2,000.75.", "sum"))
      .result.display,
    "3001 USD",
  );
});

test("all unit quantities require a complete representation boundary", async () => {
  for (const text of [
    "Alpha length is 12 meters^2. Beta length is 18 meters^2.",
    "Alpha costs 12 credits * 2. Beta costs 18 credits * 2.",
    "Alpha mass is 12 grams squared. Beta mass is 18 grams squared.",
    "Alpha costs 12 credits\n* 2. Beta costs 18 credits\n* 2.",
  ]) {
    const evidence = [source(text)];
    const { facts } = extractQuantities(evidence);
    assert.deepEqual(facts, [], text);
    assert.equal(await calculate("sum", facts, evidence), null);
  }
});

test("numeric expressions and space-grouped numbers cannot expose literal tails", async () => {
  for (const text of [
    "Alpha costs 1 × 10^3 credits. Beta costs 2 × 10^3 credits.",
    "Alpha costs 1 000 credits. Beta costs 2 000 credits.",
    "Alpha costs 1\u202f000 credits. Beta costs 2\u00a0000 credits.",
    "Alpha costs 1 + 2 credits. Beta costs 2 * 3 credits.",
    "Alpha costs $1 000. Beta costs $2 000.",
  ]) {
    const evidence = [source(text)];
    const { facts } = extractQuantities(evidence);
    assert.deepEqual(facts, [], text);
    assert.equal(await calculate("sum", facts, evidence), null);
  }
});

test("attributes require a supported predicate immediately local to each quantity", async () => {
  for (const text of [
    "Alpha price is 12 credits; Beta refund is 18 credits.",
    "Alpha price is 12 credits and Beta refund is 18 credits.",
    "Alpha sold 12 items. Beta returned 18 items.",
    "Alpha has 12 items. Beta returned 18 items.",
    "Alpha sold 12 items. Beta sold 18 items.",
  ]) {
    const evidence = [source(text)];
    const { facts } = extractQuantities(evidence);
    assert.equal(facts.at(-1)?.attribute, "unspecified", text);
    assert.equal(await calculate("sum", facts, evidence), null, text);
  }
  assert.equal(
    (
      await compute(
        "Alpha price is 12 credits; Beta price is 18 credits.",
        "sum",
      )
    ).result.display,
    "30 credits",
  );
  assert.equal(
    (await compute("Alpha has 12 items. Beta has 18 items.", "sum")).result
      .display,
    "30 items",
  );
});

test("parenthesized year qualifications are excluded rather than discarded", async () => {
  for (const text of [
    "Alpha price (2026): 12 credits. Beta price (2027): 18 credits.",
    "Alpha costs 12 credits (2026). Beta costs 18 credits (2027).",
    "Alpha price [2026]: 12 credits. Beta price [2027]: 18 credits.",
  ]) {
    const evidence = [source(text)];
    const { facts } = extractQuantities(evidence);
    assert.deepEqual(facts, [], text);
    assert.equal(await calculate("sum", facts, evidence), null);
  }
});

test("direct extraction rejects accessors and malformed input without executing getters", () => {
  let reads = 0;
  for (const field of [
    "provenance",
    "text",
    "id",
    "source",
    "title",
  ] as const) {
    const item = source("Alpha costs 12 credits.");
    Object.defineProperty(item, field, {
      enumerable: true,
      get() {
        reads++;
        throw new Error("Must not execute");
      },
    });
    assert.deepEqual(extractQuantities([item]), { facts: [], overflow: true });
  }
  assert.equal(reads, 0);
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  for (const input of [
    null,
    new Array(2),
    [cycle],
    [{ text: "x".repeat(1_000_000) }],
  ]) {
    assert.deepEqual(extractQuantities(input as Evidence[]), {
      facts: [],
      overflow: true,
    });
  }
});

test("attribute names never resolve inherited object properties", () => {
  const facts = extractQuantities([
    source("Alpha constructor is 12 credits."),
  ]).facts;
  assert.equal(facts.length, 1);
  assert.equal(facts[0].attribute, "unspecified");
});

test("oversized property names reject before canonical serialization", async (context) => {
  const descriptors = context.mock.method(Object, "getOwnPropertyDescriptors");
  assert.equal(
    await verifyCalculation({ ["x".repeat(512 * 1024 + 1)]: true }, []),
    false,
  );
  // One read inspects the input. A second would mean the detached oversized
  // object reached canonical serialization instead of failing at its key.
  assert.equal(descriptors.mock.callCount(), 1);
});

test("calculation requires unique exact extracted operands and bounded valid arity", async () => {
  const evidence = [
    source(
      "Alpha costs 12 credits. Beta costs 18 credits. Gamma costs 3 credits.",
    ),
  ];
  const facts = extractQuantities(evidence).facts;
  assert.equal(facts.length, 3);
  assert.equal(
    (await calculate("sum", facts, evidence))?.result.display,
    "33 credits",
  );
  assert.equal(await calculate("sum", [facts[0]], evidence), null);
  assert.equal(await calculate("sum", [facts[0], facts[0]], evidence), null);
  assert.equal(await calculate("difference", facts, evidence), null);
  assert.equal(await calculate("ratio", facts, evidence), null);
  assert.equal(
    await calculate("execute" as QuantityOperation, facts, evidence),
    null,
  );
  assert.equal(
    await calculate(
      "sum",
      [{ ...facts[0], raw: "999 credits" }, facts[1]],
      evidence,
    ),
    null,
  );
  assert.equal(
    await calculate(
      "sum",
      [
        { ...facts[0], value: { numerator: "999", denominator: "1" } },
        facts[1],
      ],
      evidence,
    ),
    null,
  );
});

test("proof addresses source-bound operands and an ordered arithmetic root deterministically", async () => {
  const text = "Alpha costs 12 credits. Beta costs 18 credits.";
  const first = await compute(text, "difference");
  assert.deepEqual(first, await compute(text, "difference"));
  for (const operand of first.operands) {
    assert.equal(
      operand.hash,
      await hashValue({
        kind: "quantity",
        fact: operand.fact,
        sourceHash: operand.sourceHash,
      }),
    );
  }
  assert.equal(
    first.root,
    await hashValue({
      kind: "calculation",
      operation: first.operation,
      children: first.operands.map((operand) => operand.hash),
      result: first.result,
      equation: first.equation,
    }),
  );
  assert.match(first.equation, /12 credits/);
  assert.match(first.equation, /18 credits/);
  assert.match(first.equation, /6 credits/);
});

test("replay rejects any altered proof content, extra fields, refs, and edited source", async () => {
  const evidence = [source("Alpha costs 12 credits. Beta costs 18 credits.")];
  const original = await calculate(
    "difference",
    extractQuantities(evidence).facts,
    evidence,
  );
  assert.ok(original);
  const mutations: Array<(proof: CalculationProof) => void> = [
    (proof) => {
      proof.root = "0".repeat(64);
    },
    (proof) => {
      proof.operation = "sum";
    },
    (proof) => {
      proof.result.value.numerator = "30";
    },
    (proof) => {
      proof.result.unit = "EUR";
    },
    (proof) => {
      proof.equation = "12 + 18 = 6";
    },
    (proof) => {
      proof.operands[0].fact.value.numerator = "13";
    },
    (proof) => {
      proof.operands[0].fact.span.start = 0;
    },
    (proof) => {
      proof.operands[0].fact.sourceId = "missing";
    },
    (proof) => {
      proof.operands[0].hash = proof.operands[1].hash;
    },
    (proof) => {
      proof.operands[0].sourceHash = "0".repeat(64);
    },
    (proof) => {
      proof.operands[1] = proof.operands[0];
    },
    (proof) => {
      proof.operands.reverse();
    },
  ];
  for (const mutate of mutations) {
    const edited = structuredClone(original);
    mutate(edited);
    assert.equal(await verifyCalculation(edited, evidence), false);
  }
  assert.equal(
    await verifyCalculation({ ...original, extra: "unknown" }, evidence),
    false,
  );
  assert.equal(
    await verifyCalculation(
      { ...original, equation: "x".repeat(200000) },
      evidence,
    ),
    false,
  );
  assert.equal(
    await verifyCalculation(original, [
      source(evidence[0].text.replace("12", "13")),
    ]),
    false,
  );
  assert.equal(
    await verifyCalculation(original, [
      { ...evidence[0], provenance: "authored" },
    ]),
    false,
  );
  assert.equal(
    await verifyCalculation(original, [
      source(evidence[0].text + " More source context."),
    ]),
    false,
  );
  assert.equal(await verifyCalculation(null, evidence), false);
});

test("rehashed false results and unknown nested fields still fail replay", async () => {
  const evidence = [source("Alpha costs 12 credits. Beta costs 18 credits.")];
  const original = await calculate(
    "difference",
    extractQuantities(evidence).facts,
    evidence,
  );
  assert.ok(original);
  const falseResult = structuredClone(original);
  falseResult.result.value.numerator = "7";
  falseResult.result.display = "7 credits";
  falseResult.equation = "|12 credits − 18 credits| = 7 credits";
  falseResult.root = await hashValue({
    kind: "calculation",
    operation: falseResult.operation,
    children: falseResult.operands.map((operand) => operand.hash),
    result: falseResult.result,
    equation: falseResult.equation,
  });
  assert.equal(await verifyCalculation(falseResult, evidence), false);
  const extra = structuredClone(original);
  Object.assign(extra.operands[0].fact, { extra: "ignored?" });
  assert.equal(await verifyCalculation(extra, evidence), false);
  Object.assign(original.result, { extra: true });
  assert.equal(await verifyCalculation(original, evidence), false);
});

test("verification snapshots proofs and sources before asynchronous work", async () => {
  const evidence = [source("Alpha costs 12 credits. Beta costs 18 credits.")];
  const original = await calculate(
    "difference",
    extractQuantities(evidence).facts,
    evidence,
  );
  assert.ok(original);
  const pending = verifyCalculation(original, evidence);
  original.result.value.numerator = "7";
  evidence[0].text = "Edited source";
  assert.equal(await pending, true);
});

test("malformed and oversized imported data reject without evaluating accessors", async () => {
  const evidence = [source("Alpha costs 12 credits. Beta costs 18 credits.")];
  let reads = 0;
  const accessor = Object.defineProperty({}, "version", {
    enumerable: true,
    get() {
      reads++;
      return "jev-calculation-v1";
    },
  });
  assert.equal(await verifyCalculation(accessor, evidence), false);
  assert.equal(reads, 0);
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  for (const value of [
    cycle,
    { huge: "x".repeat(1_000_000) },
    new Date(),
    NaN,
    new Array(10000),
    { [Symbol("extra")]: true },
  ]) {
    assert.equal(await verifyCalculation(value, evidence), false);
  }
  assert.equal(await calculate("sum", [], evidence), null);
  assert.deepEqual(extractQuantities([evidence[0], evidence[0]]), {
    facts: [],
    overflow: true,
  });
});
