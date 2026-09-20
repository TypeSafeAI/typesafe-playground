import { test } from "node:test";
import assert from "node:assert/strict";
import { bentoSpans, flowEnds, playgroundGroups } from "../lib/playground";
const columns = 6;
/** Walks the spans in order and reports the width of each bento row. */
const rows = (spans: number[]) => {
  const widths: number[] = [];
  let row = 0;
  for (const span of spans) {
    row += span;
    if (row >= columns) {
      widths.push(row);
      row = 0;
    }
  }
  if (row) widths.push(row);
  return widths;
};
test("every set tiles into rows that fill exactly six columns", () => {
  for (let total = 1; total <= 24; total++) {
    const spans = bentoSpans(total);
    assert.equal(spans.length, total, `${total} examples need ${total} tiles`);
    assert.ok(
      spans.every((span) => span >= 1 && span <= columns),
      `${total}: every tile fits the grid`,
    );
    assert.deepEqual(
      rows(spans).filter((width) => width !== columns),
      [],
      `${total} examples left a ragged row: ${spans.join(",")}`,
    );
  }
});
test("a set opens with a lead tile wider than the ones beside it", () => {
  assert.deepEqual(bentoSpans(5), [4, 2, 2, 2, 2]);
  assert.deepEqual(bentoSpans(3), [4, 2, 6]);
  assert.deepEqual(bentoSpans(4), [4, 2, 3, 3]);
  assert.deepEqual(bentoSpans(2), [4, 2]);
  assert.deepEqual(bentoSpans(1), [6], "one example takes the whole row");
  assert.deepEqual(bentoSpans(0), []);
  assert.deepEqual(bentoSpans(-3), [], "a filtered-away set asks for no tiles");
});
test("the real sets tile without a hole, at every filtered size", () => {
  for (const group of playgroundGroups)
    for (let shown = 1; shown <= group.examples.length; shown++)
      assert.deepEqual(
        rows(bentoSpans(shown)).filter((width) => width !== columns),
        [],
        `${group.id} filtered to ${shown} left a ragged row`,
      );
});
test("a flow splits into the two ends a typed judgment connects", () => {
  assert.deepEqual(flowEnds("Messages → best reply target"), {
    input: "Messages",
    output: "best reply target",
  });
  for (const group of playgroundGroups)
    for (const example of group.examples) {
      const { input, output } = flowEnds(example.flow);
      assert.ok(input, `${example.label} has no input end`);
      assert.ok(output, `${example.label} has no output end`);
      assert.ok(!input.includes("→") && !output.includes("→"));
    }
});
test("a flow without an arrow keeps its whole text as the input", () => {
  assert.deepEqual(flowEnds("One typed answer"), {
    input: "One typed answer",
    output: "",
  });
});
