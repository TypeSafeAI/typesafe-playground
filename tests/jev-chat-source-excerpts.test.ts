import test from "node:test";
import assert from "node:assert/strict";
import {
  sourceExcerpts,
  type SourceExcerpt,
} from "../lib/jev-chat/source-excerpts";

const note = (text: string, id = "note_1") => ({ id, text });
type Sources = Parameters<typeof sourceExcerpts>[0];
const texts = (text: string) =>
  sourceExcerpts([note(text)]).excerpts.map((entry) => entry.text);

test("sentence proposals retain exact text, source order, and deterministic offset IDs", () => {
  const sources = [
    note("Alpha costs 12 credits. Beta costs 18 credits.", "note_40"),
    note("A second note! One final sentence", "note_2"),
  ];
  const result = sourceExcerpts(sources);
  assert.equal(result.omitted, false);
  assert.deepEqual(
    result.excerpts.map(({ sourceId, text }) => ({ sourceId, text })),
    [
      { sourceId: "note_40", text: "Alpha costs 12 credits." },
      { sourceId: "note_40", text: "Beta costs 18 credits." },
      { sourceId: "note_2", text: "A second note!" },
      { sourceId: "note_2", text: "One final sentence" },
    ],
  );
  for (const excerpt of result.excerpts) {
    const source = sources.find(({ id }) => id === excerpt.sourceId)!;
    assert.equal(excerpt.text, source.text.slice(excerpt.start, excerpt.end));
    assert.equal(
      excerpt.id,
      `${excerpt.sourceId}_excerpt_${excerpt.start}_${excerpt.end}`,
    );
    assert.deepEqual(Object.keys(excerpt).sort(), [
      "end",
      "id",
      "sourceId",
      "start",
      "text",
    ]);
  }
});

test("UTF-16 offsets and internal whitespace survive while boundary whitespace is excluded", () => {
  const result = sourceExcerpts([note("A 😀. B.")]);
  assert.deepEqual(result.excerpts, [
    {
      id: "note_1_excerpt_0_5",
      sourceId: "note_1",
      start: 0,
      end: 5,
      text: "A 😀.",
    },
    {
      id: "note_1_excerpt_6_8",
      sourceId: "note_1",
      start: 6,
      end: 8,
      text: "B.",
    },
  ]);
  const text = "Alpha\t stays. \n\tBeta  waits!\u00a0‘Gamma rests.’";
  const excerpts = sourceExcerpts([note(text)]).excerpts;
  assert.deepEqual(
    excerpts.map((entry) => entry.text),
    ["Alpha\t stays.", "Beta  waits!", "‘Gamma rests.’"],
  );
  for (const excerpt of excerpts)
    assert.equal(text.slice(excerpt.start, excerpt.end), excerpt.text);
});

test("terminal punctuation and closing quotes or brackets stay with their sentence", () => {
  assert.deepEqual(
    texts(
      'She said “Wait!” Then she asked, "Ready?" 2 people nodded. (They left.) Later, they returned',
    ),
    [
      "She said “Wait!”",
      'Then she asked, "Ready?"',
      "2 people nodded.",
      "(They left.)",
      "Later, they returned",
    ],
  );
  assert.deepEqual(texts('He asked, "Really?!" She nodded. “Go now.”'), [
    'He asked, "Really?!"',
    "She nodded.",
    "“Go now.”",
  ]);
  assert.deepEqual(
    texts("The label read [Ready!]. Another label said [Done!] They moved."),
    ["The label read [Ready!].", "Another label said [Done!]", "They moved."],
  );
});

test("decimals, titles, abbreviations, acronyms, and initials do not become false sentence boundaries", () => {
  const examples = [
    [
      "Dr. Ada met Mr. Jones and Mrs. Lee. They left.",
      ["Dr. Ada met Mr. Jones and Mrs. Lee.", "They left."],
    ],
    [
      "Ms. Bell called Prof. Stone. He replied.",
      ["Ms. Bell called Prof. Stone.", "He replied."],
    ],
    [
      "Examples include e.g. Alpha and i.e. Beta labels. Use both.",
      ["Examples include e.g. Alpha and i.e. Beta labels.", "Use both."],
    ],
    [
      "We packed tools, etc. More arrived later! They fit.",
      ["We packed tools, etc. More arrived later!", "They fit."],
    ],
    [
      "At 9 a.m. Dr. Stone left the U.S. office. Return at 5 p.m. Tomorrow is fine!",
      [
        "At 9 a.m. Dr. Stone left the U.S. office.",
        "Return at 5 p.m. Tomorrow is fine!",
      ],
    ],
    [
      "J. R. R. Tolkien met A.B.C. staff. They spoke.",
      ["J. R. R. Tolkien met A.B.C. staff.", "They spoke."],
    ],
    [
      "Price is 3.14 credits and version 2.0 is ready. Use 12.5 units.",
      ["Price is 3.14 credits and version 2.0 is ready.", "Use 12.5 units."],
    ],
  ] as const;
  for (const [source, expected] of examples)
    assert.deepEqual(texts(source), expected, source);
});

test("unsupported or ambiguous boundaries conservatively offer no whole-paragraph duplicate", () => {
  for (const text of [
    "One complete sentence.",
    "A final sentence without punctuation",
    "Alpha stopped. then continued.",
    "Alpha... Beta.",
    "Alpha.Beta.",
    "Alpha; Beta: Gamma",
    "First。 Second。",
    "The meeting is at 5 p.m. Tomorrow works.",
  ])
    assert.deepEqual(
      sourceExcerpts([note(text)]),
      { excerpts: [], omitted: false },
      text,
    );
  assert.deepEqual(sourceExcerpts([]), { excerpts: [], omitted: false });
});

test("the 32-excerpt cap is global and reports omission only for additional proposals", () => {
  const sources = Array.from({ length: 17 }, (_, index) =>
    note(`Note ${index + 1} starts. It ends.`, `note_${index + 1}`),
  );
  const before = structuredClone(sources);
  const atLimit = sourceExcerpts(sources.slice(0, 16));
  assert.equal(atLimit.excerpts.length, 32);
  assert.equal(atLimit.omitted, false);
  const overflow = sourceExcerpts(sources);
  assert.deepEqual(overflow.excerpts, atLimit.excerpts);
  assert.equal(overflow.omitted, true);
  assert.deepEqual(sources, before);
  assert.deepEqual(
    sourceExcerpts([...sources.slice(0, 16), note("One sentence.", "note_17")]),
    atLimit,
  );
});

test("source counts and total text lengths allow the boundary and reject overflow before proposing", () => {
  const forty = Array.from({ length: 40 }, (_, index) =>
    note("One sentence.", `note_${index + 1}`),
  );
  assert.deepEqual(sourceExcerpts(forty), { excerpts: [], omitted: false });
  assert.equal(
    sourceExcerpts([note(`${"A".repeat(11_996)}. B.`)]).excerpts.length,
    2,
  );
  const invalid: unknown[] = [
    [...forty, note("Extra.", "note_41")],
    [note("A".repeat(12_001))],
    [note("A".repeat(6_001)), note("B".repeat(6_000), "note_2")],
    [
      ...forty.slice(0, 17).map(({ id }) => note("First. Second.", id)),
      { id: "note_18", text: "" },
    ],
  ];
  for (const value of invalid)
    assert.throws(() => sourceExcerpts(value as Sources), {
      message: "Invalid source excerpt input",
    });
});

test("malformed arrays, records, IDs, and noncanonical text are rejected without coercion", () => {
  class OtherArray extends Array<{ id: string; text: string }> {}
  const hidden = Object.defineProperty([note("First. Second.")], "0", {
    enumerable: false,
  });
  const invalid: unknown[] = [
    null,
    {},
    "text",
    new Array(1),
    new OtherArray(note("First. Second.")),
    hidden,
    Object.assign([], { extra: true }),
    [null],
    ["text"],
    [[]],
    [{ id: "note_1" }],
    [{ text: "First. Second." }],
    [{ ...note("First. Second."), extra: true }],
    [Object.create(note("First. Second."))],
    [note("First. Second."), note("Third. Fourth.")],
    ...["note_0", "note_01", "note_41", "guide_1", "note_1 ", "Note_1"].map(
      (id) => [note("First. Second.", id)],
    ),
    ...[
      "",
      " ",
      " First. Second.",
      "First. Second.\n",
      1,
      null,
      { toString: () => "First. Second." },
    ].map((text) => [{ id: "note_1", text }]),
  ];
  for (const value of invalid)
    assert.throws(() => sourceExcerpts(value as Sources), {
      message: "Invalid source excerpt input",
    });
});

test("accessors are never read and all failures use the same generic error", () => {
  let reads = 0;
  const getter = () => {
    reads++;
    throw Error("sensitive accessor detail");
  };
  const entry = note("First. Second.");
  Object.defineProperty(entry, "text", { enumerable: true, get: getter });
  const array = [note("First. Second.")];
  Object.defineProperty(array, "0", { enumerable: true, get: getter });
  const id = note("First. Second.");
  Object.defineProperty(id, "id", { enumerable: true, get: getter });
  const proxy = new Proxy([], {
    ownKeys: () => {
      throw Error("sensitive proxy detail");
    },
  });
  for (const value of [[entry], array, [id], proxy])
    assert.throws(() => sourceExcerpts(value), {
      message: "Invalid source excerpt input",
    });
  assert.equal(reads, 0);
});

test("outputs replay exactly and are detached from frozen inputs and previous calls", () => {
  const sources = Object.freeze([
    Object.freeze(note("First sentence. Second sentence.")),
  ]);
  const original = structuredClone(sources);
  const expected = sourceExcerpts(sources);
  const actual = sourceExcerpts(sources);
  assert.deepEqual(actual, expected);
  assert.notEqual(actual, expected);
  assert.notEqual(actual.excerpts, expected.excerpts);
  assert.notEqual(actual.excerpts[0], expected.excerpts[0]);
  const changed: SourceExcerpt = actual.excerpts[0];
  changed.text = "Changed";
  changed.start = 100;
  actual.excerpts.push({ ...changed });
  assert.deepEqual(sources, original);
  assert.deepEqual(sourceExcerpts(sources), expected);
});
