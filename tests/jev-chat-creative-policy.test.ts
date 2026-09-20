import test from "node:test";
import assert from "node:assert/strict";
import {
  creativeFields,
  resolveCreativeCandidates,
  resolveCreativePolicy,
  type CreativeAcceptance,
  type CreativeFieldMode,
  type CreativeFieldModes,
  type CreativeResolution,
  type CreativeValues,
} from "../lib/jev-chat/creative-policy";
import {
  creativeLexicon,
  seededChoices,
  type StoryFrame,
} from "../lib/jev-chat/story";

const values = (): CreativeValues => ({
  choices: {
    character: "keeper",
    setting: "coast",
    obstacle: "silence",
    resolution: "listen",
  },
  tone: "reflective",
  ending: "resolved",
  style: "balanced",
});
const accepted = (): CreativeAcceptance => ({
  character: ["keeper"],
  setting: ["coast"],
  obstacle: ["silence"],
  resolution: ["listen"],
  tone: ["reflective"],
  ending: ["resolved"],
  style: ["balanced"],
});
const empty = (): CreativeAcceptance => ({
  character: [],
  setting: [],
  obstacle: [],
  resolution: [],
  tone: [],
  ending: [],
  style: [],
});
const modes = (mode: CreativeFieldMode): CreativeFieldModes => ({
  character: mode,
  setting: mode,
  obstacle: mode,
  resolution: mode,
  tone: mode,
  ending: mode,
  style: "preserved",
});
const prior = (): StoryFrame => ({
  version: "jev-story-v1",
  ...values(),
  theme: "shared work",
  variant: 1,
});
type PolicyInput = Parameters<typeof resolveCreativePolicy>[0];
const input = (changes: Partial<PolicyInput> = {}): PolicyInput => ({
  action: "new",
  accepted: accepted(),
  modes: modes("delegated"),
  previous: null,
  requestedStyle: "balanced",
  seed: 42,
  ...changes,
});

test("creative fields have a stable public order", () => {
  assert.deepEqual(creativeFields, [
    "character",
    "setting",
    "obstacle",
    "resolution",
    "tone",
    "ending",
    "style",
  ]);
});

test("delegated creation retains seeded choices independently of ignored acceptance sets", () => {
  const other: CreativeAcceptance = {
    character: ["archivist"],
    setting: ["valley"],
    obstacle: ["storm"],
    resolution: ["question"],
    tone: ["hopeful"],
    ending: ["open"],
    style: ["detailed"],
  };
  for (const seed of [0, 1, 42, 123456789, 0xffffffff]) {
    const result = resolveCreativePolicy(input({ seed }));
    assert.ok(result);
    assert.deepEqual(result.choices, seededChoices(seed));
    assert.deepEqual(
      result,
      resolveCreativePolicy(input({ seed, accepted: other })),
    );
    assert.deepEqual(
      result,
      resolveCreativePolicy(input({ seed, accepted: empty() })),
    );
    assert.equal(result.style, "balanced");
    assert.deepEqual(result.edits, [
      "character",
      "setting",
      "obstacle",
      "resolution",
      "tone",
      "ending",
    ]);
  }
});

test("singleton constrained sets determine their fields while delegated fields keep their seed positions", () => {
  const baseline = resolveCreativePolicy(input());
  assert.ok(baseline);
  const result = resolveCreativePolicy(
    input({
      accepted: { ...empty(), character: ["mechanic"], tone: ["hopeful"] },
      modes: {
        ...modes("delegated"),
        character: "constrained",
        tone: "constrained",
      },
    }),
  );
  assert.ok(result);
  assert.equal(result.choices.character, "mechanic");
  assert.equal(result.tone, "hopeful");
  assert.equal(result.choices.setting, baseline.choices.setting);
  assert.equal(result.choices.obstacle, baseline.choices.obstacle);
  assert.equal(result.choices.resolution, baseline.choices.resolution);
  assert.equal(result.ending, baseline.ending);
});

test("multiple accepted constraints are canonicalized, seeded, and never escape their sets", () => {
  const permitted: CreativeAcceptance = {
    character: ["courier", "mechanic"],
    setting: ["library", "coast", "valley"],
    obstacle: ["map", "light"],
    resolution: ["wait", "share"],
    tone: ["hopeful", "suspenseful"],
    ending: ["open"],
    style: ["detailed", "concise"],
  };
  const reversed: CreativeAcceptance = { ...permitted };
  for (const field of creativeFields)
    reversed[field] = [...permitted[field]].reverse();
  const allConstrained = {
    ...modes("constrained"),
    style: "constrained" as const,
  };
  const observed = new Set<string>();
  for (let seed = 0; seed < 40; seed++) {
    const result = resolveCreativePolicy(
      input({ seed, accepted: permitted, modes: allConstrained }),
    );
    assert.ok(result);
    const flattened = {
      ...result.choices,
      tone: result.tone,
      ending: result.ending,
      style: result.style,
    };
    for (const field of creativeFields)
      assert.ok(permitted[field].includes(flattened[field]), field);
    assert.deepEqual(
      result,
      resolveCreativePolicy(
        input({ seed, accepted: reversed, modes: allConstrained }),
      ),
    );
    observed.add(result.choices.character);
  }
  assert.deepEqual([...observed].sort(), ["courier", "mechanic"]);
  const constrained = resolveCreativePolicy(
    input({ accepted: permitted, modes: allConstrained }),
  );
  const mixed = resolveCreativePolicy(
    input({
      accepted: permitted,
      modes: {
        ...allConstrained,
        setting: "delegated",
        resolution: "delegated",
      },
    }),
  );
  assert.ok(constrained && mixed);
  assert.equal(mixed.choices.character, constrained.choices.character);
  assert.equal(mixed.choices.obstacle, constrained.choices.obstacle);
  assert.equal(mixed.tone, constrained.tone);
  assert.equal(mixed.ending, constrained.ending);
  assert.equal(mixed.style, constrained.style);
});

test("common seeds retain variety in five-value constraint and revision pools", () => {
  const nonKeeper = [
    "cartographer",
    "mechanic",
    "gardener",
    "courier",
    "archivist",
  ];
  const constrained = new Set<string>();
  const revised = new Set<string>();
  for (const seed of [0, 1, 2, 42, 0xffffffff]) {
    const request = input({
      seed,
      accepted: { ...empty(), character: nonKeeper },
      modes: { ...modes("delegated"), character: "constrained" },
    });
    const result = resolveCreativePolicy(request);
    const revision = resolveCreativePolicy(
      input({
        seed,
        action: "revise",
        previous: prior(),
        accepted: empty(),
        modes: { ...modes("preserved"), character: "delegated" },
      }),
    );
    assert.ok(result && revision);
    assert.ok(nonKeeper.includes(result.choices.character));
    assert.ok(nonKeeper.includes(revision.choices.character));
    assert.deepEqual(result, resolveCreativePolicy(request));
    constrained.add(result.choices.character);
    revised.add(revision.choices.character);
  }
  assert.ok(
    constrained.size > 1,
    "common seeds must not all choose one accepted character",
  );
  assert.ok(
    revised.size > 1,
    "common seeds must not all choose one alternative to the previous character",
  );
});

test("empty constrained sets decline while empty delegated and preserved sets are valid", () => {
  for (const field of creativeFields) {
    assert.equal(
      resolveCreativePolicy(
        input({
          accepted: { ...accepted(), [field]: [] },
          modes: { ...modes("delegated"), [field]: "constrained" },
        }),
      ),
      null,
      field,
    );
  }
  assert.ok(resolveCreativePolicy(input({ accepted: empty() })));
  const revision = resolveCreativePolicy(
    input({
      action: "revise",
      previous: prior(),
      accepted: empty(),
      modes: { ...modes("preserved"), setting: "delegated" },
    }),
  );
  assert.ok(revision);
  assert.equal(revision.choices.character, "keeper");
  assert.notEqual(revision.choices.setting, "coast");
});

test("revisions preserve unedited values even when their acceptance sets exclude the previous value", () => {
  const previous = prior();
  const result = resolveCreativePolicy(
    input({
      action: "revise",
      previous,
      accepted: {
        character: ["courier"],
        setting: ["island"],
        obstacle: ["map"],
        resolution: ["return"],
        tone: ["hopeful"],
        ending: ["open"],
        style: ["concise"],
      },
      modes: { ...modes("preserved"), ending: "constrained" },
    }),
  );
  assert.ok(result);
  assert.deepEqual(result.choices, previous.choices);
  assert.equal(result.tone, previous.tone);
  assert.equal(result.ending, "open");
  assert.equal(result.style, previous.style);
  assert.deepEqual(result.edits, ["ending"]);
});

test("delegated revisions exclude prior values without being restricted by ignored accepted sets", () => {
  const previous = prior();
  for (let seed = 0; seed < 40; seed++) {
    const request = input({ action: "revise", previous, seed });
    const result = resolveCreativePolicy(request);
    assert.ok(result);
    for (const field of [
      "character",
      "setting",
      "obstacle",
      "resolution",
    ] as const)
      assert.notEqual(result.choices[field], previous.choices[field], field);
    assert.notEqual(result.tone, previous.tone);
    assert.notEqual(result.ending, previous.ending);
    assert.equal(result.style, previous.style);
    assert.deepEqual(
      result,
      resolveCreativePolicy({ ...request, accepted: empty() }),
    );
  }
});

test("all-preserved revisions decline except explicit UI detail changes", () => {
  const request = input({
    action: "revise",
    previous: prior(),
    modes: modes("preserved"),
    accepted: empty(),
  });
  assert.equal(resolveCreativePolicy(request), null);
  const result = resolveCreativePolicy({
    ...request,
    requestedStyle: "detailed",
  });
  assert.ok(result);
  assert.equal(result.style, "detailed");
  assert.deepEqual(result.choices, request.previous!.choices);
  assert.equal(result.tone, request.previous!.tone);
  assert.equal(result.ending, request.previous!.ending);
  assert.deepEqual(result.edits, ["style"]);
});

test("constrained style prefers an accepted UI style, otherwise samples only accepted styles", () => {
  const request = input({
    accepted: { ...empty(), style: ["concise", "balanced", "detailed"] },
    modes: { ...modes("delegated"), style: "constrained" },
  });
  for (const requestedStyle of ["concise", "balanced", "detailed"] as const) {
    for (const seed of [0, 1, 42, 0xffffffff])
      assert.equal(
        resolveCreativePolicy({ ...request, requestedStyle, seed })?.style,
        requestedStyle,
      );
  }
  assert.equal(
    resolveCreativePolicy({
      ...request,
      accepted: { ...empty(), style: ["detailed"] },
      requestedStyle: "concise",
    })?.style,
    "detailed",
  );
  const revised = resolveCreativePolicy({
    ...request,
    action: "revise",
    previous: prior(),
    requestedStyle: "concise",
    modes: { ...modes("preserved"), style: "constrained" },
  });
  assert.equal(revised?.style, "concise");
  assert.deepEqual(revised?.choices, prior().choices);
  assert.deepEqual(revised?.edits, ["style"]);
  assert.equal(
    resolveCreativePolicy(
      input({ modes: { ...modes("delegated"), style: "delegated" } }),
    ),
    null,
  );
});

test("new scenes cannot preserve non-style fields and revisions require a valid frame", () => {
  for (const field of creativeFields.filter((field) => field !== "style"))
    assert.equal(
      resolveCreativePolicy(
        input({ modes: { ...modes("delegated"), [field]: "preserved" } }),
      ),
      null,
    );
  assert.equal(resolveCreativePolicy(input({ action: "revise" })), null);
  assert.equal(
    resolveCreativePolicy(
      input({
        action: "revise",
        previous: { ...prior(), version: "future" } as unknown as StoryFrame,
      }),
    ),
    null,
  );
  assert.equal(
    resolveCreativePolicy(
      input({ previous: { ...prior(), theme: "x".repeat(101) } }),
    ),
    null,
  );
});

test("all acceptance arrays validate even for ignored fields without holes, extra keys, duplicates or unknown IDs", () => {
  const extra = Object.assign(["keeper"], { extra: "courier" });
  const hidden = Object.defineProperty(["keeper"], "0", {
    value: "keeper",
    enumerable: false,
  });
  class OtherArray extends Array<string> {}
  const invalid = [
    undefined,
    null,
    "keeper",
    {},
    ["keeper", "keeper"],
    ["constructor"],
    [42],
    new Array(1),
    ["keeper", undefined],
    extra,
    hidden,
    new OtherArray("keeper"),
    Array.from({ length: 7 }, () => "keeper"),
  ];
  for (const character of invalid) {
    const broken = { ...accepted(), character } as CreativeAcceptance;
    assert.equal(resolveCreativePolicy(input({ accepted: broken })), null);
    assert.equal(
      resolveCreativePolicy(
        input({
          action: "revise",
          previous: prior(),
          accepted: broken,
          modes: { ...modes("preserved"), tone: "delegated" },
        }),
      ),
      null,
    );
  }
  for (const field of creativeFields) {
    const incomplete = { ...accepted() } as Record<string, unknown>;
    delete incomplete[field];
    assert.equal(
      resolveCreativePolicy(
        input({ accepted: incomplete as CreativeAcceptance }),
      ),
      null,
    );
  }
});

test("invalid action, mode, seed, acceptance shape and legacy selections fail without coercion", () => {
  const invalid: unknown[] = [
    null,
    [],
    {},
    { ...input(), extra: true },
    { ...input(), action: "execute" },
    { ...input(), requestedStyle: "huge" },
    ...[-1, 0x100000000, 0.5, NaN, Infinity, "42", null].map((seed) => ({
      ...input(),
      seed,
    })),
    { ...input(), modes: { ...modes("delegated"), tone: "automatic" } },
    { ...input(), modes: { ...modes("delegated"), extra: "delegated" } },
    { ...input(), accepted: { ...accepted(), tone: ["angry"] } },
    { ...input(), accepted: { ...accepted(), extra: [] } },
    {
      ...input(),
      accepted: { ...accepted(), character: ["x".repeat(1_000_000)] },
    },
  ];
  const legacy = { ...input(), selections: values() } as Record<
    string,
    unknown
  >;
  delete legacy.accepted;
  invalid.push(legacy);
  const missingMode = { ...modes("delegated") } as Record<string, unknown>;
  delete missingMode.ending;
  invalid.push({ ...input(), modes: missingMode });
  for (const value of invalid)
    assert.equal(resolveCreativePolicy(value as PolicyInput), null);
});

test("acceptance accessors stay unread and frozen input remains detached from output", () => {
  let reads = 0;
  const getter = () => {
    reads++;
    throw new Error("do not evaluate");
  };
  const root = input();
  Object.defineProperty(root, "action", { enumerable: true, get: getter });
  assert.equal(resolveCreativePolicy(root), null);
  const nested = input();
  Object.defineProperty(nested.accepted, "character", {
    enumerable: true,
    get: getter,
  });
  assert.equal(resolveCreativePolicy(nested), null);
  const element = ["keeper"];
  Object.defineProperty(element, "0", { enumerable: true, get: getter });
  assert.equal(
    resolveCreativePolicy(
      input({ accepted: { ...accepted(), character: element } }),
    ),
    null,
  );
  assert.equal(reads, 0);
  const request = input({
    action: "revise",
    previous: prior(),
    modes: { ...modes("preserved"), tone: "constrained" },
    accepted: { ...empty(), tone: ["hopeful", "suspenseful"] },
  });
  const original = structuredClone(request);
  Object.freeze(request.previous!.choices);
  Object.freeze(request.previous!);
  for (const set of Object.values(request.accepted)) Object.freeze(set);
  Object.freeze(request.accepted);
  Object.freeze(request.modes);
  Object.freeze(request);
  const result = resolveCreativePolicy(request);
  assert.ok(result);
  assert.deepEqual(request, original);
  result.choices.character = "courier";
  result.edits.push("character");
  assert.deepEqual(request, original);
  assert.equal(resolveCreativePolicy(request)?.choices.character, "keeper");
});

const flat = (result: CreativeValues) => ({
  ...result.choices,
  tone: result.tone,
  ending: result.ending,
  style: result.style,
});
const distance = (left: CreativeValues, right: CreativeValues) => {
  const a = flat(left);
  const b = flat(right);
  return creativeFields.filter((field) => a[field] !== b[field]).length;
};

test("two binary constraints yield three distinct assignments with maximal minimum field distance", () => {
  const request = input({
    accepted: {
      ...accepted(),
      character: ["keeper", "mechanic"],
      setting: ["coast", "city"],
    },
    modes: modes("constrained"),
  });
  const results = resolveCreativeCandidates(request);
  assert.ok(results);
  assert.equal(results.length, 3);
  assert.deepEqual(results[0], resolveCreativePolicy(request));
  assert.equal(distance(results[0], results[1]), 2);
  assert.equal(distance(results[0], results[2]), 1);
  assert.equal(distance(results[1], results[2]), 1);
  assert.equal(
    new Set(results.map((result) => JSON.stringify(flat(result)))).size,
    3,
  );
  for (const result of results) {
    assert.ok(request.accepted.character.includes(result.choices.character));
    assert.ok(request.accepted.setting.includes(result.choices.setting));
    assert.equal(result.choices.obstacle, "silence");
    assert.equal(result.choices.resolution, "listen");
    assert.equal(result.tone, "reflective");
    assert.equal(result.ending, "resolved");
    assert.equal(result.style, "balanced");
  }
});

test("candidate count follows complete assignments for singleton and binary pools", () => {
  const request = input({ modes: modes("constrained") });
  assert.deepEqual(resolveCreativeCandidates(request), [
    resolveCreativePolicy(request),
  ]);
  const pair = resolveCreativeCandidates({
    ...request,
    accepted: { ...accepted(), ending: ["resolved", "open"] },
  });
  assert.ok(pair);
  assert.equal(pair.length, 2);
  assert.deepEqual(pair.map((result) => result.ending).sort(), [
    "open",
    "resolved",
  ]);
  assert.equal(distance(pair[0], pair[1]), 1);
});

test("wide candidate searches stay bounded, distinct, deterministic, and compatible with the primary", () => {
  const all: CreativeAcceptance = {
    character: Object.keys(creativeLexicon.character),
    setting: Object.keys(creativeLexicon.setting),
    obstacle: Object.keys(creativeLexicon.obstacle),
    resolution: Object.keys(creativeLexicon.resolution),
    tone: ["reflective", "suspenseful", "hopeful"],
    ending: ["resolved", "open"],
    style: ["concise", "detailed"],
  };
  const reverse: CreativeAcceptance = { ...all };
  for (const field of creativeFields)
    reverse[field] = [...all[field]].reverse();
  for (const seed of [0, 1, 42, 0xffffffff]) {
    for (const constrained of [false, true]) {
      const request = input({
        seed,
        accepted: all,
        modes: constrained
          ? { ...modes("constrained"), style: "constrained" }
          : modes("delegated"),
      });
      const results = resolveCreativeCandidates(request);
      assert.ok(results);
      assert.equal(results.length, 3);
      assert.deepEqual(results[0], resolveCreativePolicy(request));
      assert.deepEqual(results, resolveCreativeCandidates(request));
      assert.deepEqual(
        results,
        resolveCreativeCandidates({ ...request, accepted: reverse }),
      );
      assert.equal(
        new Set(results.map((result) => JSON.stringify(flat(result)))).size,
        3,
      );
      if (!constrained)
        assert.deepEqual(results[0].choices, seededChoices(seed));
      assert.equal(distance(results[0], results[1]), constrained ? 7 : 6);
      assert.equal(
        Math.min(
          distance(results[0], results[2]),
          distance(results[1], results[2]),
        ),
        constrained ? 6 : 5,
      );
      for (const result of results) {
        const assignment = flat(result);
        for (const field of creativeFields) {
          if (field !== "style" || constrained)
            assert.ok(all[field].includes(assignment[field]), field);
        }
      }
    }
  }
});

test("every revision candidate preserves untouched fields independently of the story theme", () => {
  const previous = prior();
  const request = input({
    action: "revise",
    previous,
    accepted: { ...empty(), tone: ["hopeful", "suspenseful"] },
    modes: { ...modes("preserved"), tone: "constrained" },
  });
  const results = resolveCreativeCandidates(request);
  assert.ok(results);
  assert.equal(results.length, 2);
  assert.deepEqual(
    results,
    resolveCreativeCandidates({
      ...request,
      previous: { ...previous, theme: "a different theme", variant: 2 },
    }),
  );
  for (const result of results) {
    assert.deepEqual(result.choices, previous.choices);
    assert.equal(result.ending, previous.ending);
    assert.equal(result.style, previous.style);
    assert.deepEqual(result.edits, ["tone"]);
  }
  const noEdits = { ...request, modes: modes("preserved") };
  assert.equal(resolveCreativeCandidates(noEdits), null);
  const detail = resolveCreativeCandidates({
    ...noEdits,
    requestedStyle: "detailed",
  });
  assert.ok(detail);
  assert.equal(detail.length, 1);
  assert.deepEqual(detail[0].choices, previous.choices);
  assert.equal(detail[0].tone, previous.tone);
  assert.equal(detail[0].style, "detailed");
  assert.deepEqual(detail[0].edits, ["style"]);
});

test("delegated revision candidates each exclude every previous delegated value", () => {
  const previous = prior();
  const before = flat(previous);
  const request = input({ action: "revise", previous, accepted: empty() });
  const results = resolveCreativeCandidates(request);
  assert.ok(results);
  assert.equal(results.length, 3);
  assert.deepEqual(results[0], resolveCreativePolicy(request));
  for (const result of results) {
    const assignment = flat(result);
    for (const field of creativeFields) {
      if (field === "style") assert.equal(assignment[field], before[field]);
      else assert.notEqual(assignment[field], before[field], field);
    }
  }
});

test("all candidates lock an accepted UI style and only diversify style when that choice is excluded", () => {
  const request = input({
    accepted: { ...accepted(), style: ["concise", "balanced", "detailed"] },
    modes: { ...modes("constrained"), style: "constrained" },
  });
  for (const requestedStyle of ["concise", "balanced", "detailed"] as const) {
    const results = resolveCreativeCandidates({ ...request, requestedStyle });
    assert.ok(results);
    assert.equal(results.length, 1);
    assert.equal(results[0].style, requestedStyle);
  }
  const alternatives = resolveCreativeCandidates({
    ...request,
    accepted: { ...accepted(), style: ["concise", "detailed"] },
  });
  assert.ok(alternatives);
  assert.equal(alternatives.length, 2);
  assert.deepEqual(alternatives.map((result) => result.style).sort(), [
    "concise",
    "detailed",
  ]);
});

test("candidate resolution shares strict validation, including ignored malformed pools and unread accessors", () => {
  let reads = 0;
  const accessor = () => {
    reads++;
    throw new Error("must stay unread");
  };
  const root = input();
  Object.defineProperty(root, "action", { enumerable: true, get: accessor });
  const nested = input();
  Object.defineProperty(nested.accepted, "tone", {
    enumerable: true,
    get: accessor,
  });
  const character = ["keeper"];
  Object.defineProperty(character, "0", { enumerable: true, get: accessor });
  const previous = prior();
  Object.defineProperty(previous.choices, "setting", {
    enumerable: true,
    get: accessor,
  });
  const invalid: unknown[] = [
    null,
    [],
    {},
    root,
    nested,
    input({ accepted: { ...accepted(), character } }),
    input({ action: "revise", previous }),
    input({ action: "revise" }),
    input({ modes: modes("preserved") }),
    input({ modes: { ...modes("delegated"), style: "delegated" } }),
    input({ modes: modes("constrained"), accepted: empty() }),
    ...[-1, 0.1, 0x100000000, Infinity, NaN, "42"].map((seed) => ({
      ...input(),
      seed,
    })),
    ...[
      ["keeper", "keeper"],
      ["missing"],
      new Array(1),
      Object.assign(["keeper"], { extra: true }),
    ].map((character) => ({
      ...input(),
      accepted: { ...accepted(), character },
    })),
    { ...input(), action: "other" },
    { ...input(), accepted: { ...accepted(), other: [] } },
    { ...input(), modes: { ...modes("delegated"), ending: "other" } },
    { ...input(), previous: { ...prior(), theme: "x".repeat(101) } },
  ];
  for (const request of invalid) {
    assert.equal(resolveCreativePolicy(request as PolicyInput), null);
    assert.equal(resolveCreativeCandidates(request as PolicyInput), null);
  }
  assert.equal(reads, 0);
});

test("candidate outputs are detached from frozen input and one another", () => {
  const request = input({
    action: "revise",
    previous: prior(),
    accepted: empty(),
  });
  const original = structuredClone(request);
  for (const pool of Object.values(request.accepted)) Object.freeze(pool);
  Object.freeze(request.accepted);
  Object.freeze(request.modes);
  Object.freeze(request.previous!.choices);
  Object.freeze(request.previous!);
  Object.freeze(request);
  const results: CreativeResolution[] | null =
    resolveCreativeCandidates(request);
  assert.ok(results);
  assert.equal(results.length, 3);
  const copy = structuredClone(results);
  for (let i = 0; i < results.length; i++) {
    for (let j = 0; j < i; j++) {
      assert.notEqual(results[i], results[j]);
      assert.notEqual(results[i].choices, results[j].choices);
      assert.notEqual(results[i].edits, results[j].edits);
    }
  }
  results[0].choices.character = "mutated";
  results[0].edits.length = 0;
  assert.deepEqual(results.slice(1), copy.slice(1));
  assert.deepEqual(request, original);
  assert.deepEqual(resolveCreativeCandidates(request), copy);
});
