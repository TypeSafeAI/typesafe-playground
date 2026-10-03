import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PUZZLES,
  parseMoves,
  practiceScramble,
  type PuzzleId,
} from "../lib/twisty/contracts";
import { solved, solvePuzzle } from "../lib/twisty/engine";

test("notation rejects repetitions, unsupported turns and excessive input before parsing", () => {
  for (const input of [
    "(R U)99999999",
    "[R,U]",
    "R1000000",
    "<script>",
    "Rw",
    "R ".repeat(251),
  ])
    assert.throws(() => parseMoves("3x3x3", input));
  assert.deepEqual(parseMoves("4x4x4", " Rw\nUw2 F' "), ["Rw", "Uw2", "F'"]);
  assert.deepEqual(parseMoves("megaminx", "R++ D-- U' FR2 DL2'"), [
    "R++",
    "D--",
    "U'",
    "FR2",
    "DL2'",
  ]);
  assert.deepEqual(parseMoves("2x2x2", ""), []);
});

for (const puzzle of Object.keys(PUZZLES) as PuzzleId[]) {
  test(`${puzzle}: reproducible practice scrambles use legal moves and change the state`, async () => {
    const a = practiceScramble(puzzle, 1234);
    assert.equal(a, practiceScramble(puzzle, 1234));
    assert.notEqual(a, practiceScramble(puzzle, 5678));
    const { puzzles } = await import("cubing/puzzles");
    const kpuzzle = await puzzles[puzzle].kpuzzle();
    assert.ok(parseMoves(puzzle, a).length >= 12);
    assert.equal(solved(kpuzzle.defaultPattern().applyAlg(a), puzzle), false);
  });
  test(
    `${puzzle}: solver's full output reaches solved and each playback step is reversible`,
    { timeout: 60_000 },
    async () => {
      const result = await solvePuzzle(puzzle, PUZZLES[puzzle].sample);
      const { puzzles } = await import("cubing/puzzles");
      const kpuzzle = await puzzles[puzzle].kpuzzle();
      const start = kpuzzle.defaultPattern().applyAlg(result.scramble);
      assert.equal(solved(start, puzzle), false);
      assert.equal(result.verified, true);
      assert.equal(result.method, "state-search");
      assert.ok(result.moves.length > 0);
      assert.equal(solved(start.applyAlg(result.solution), puzzle), true);
      assert.equal(
        solved(start.applyAlg(result.moves.slice(0, -1).join(" ")), puzzle),
        false,
      );
    },
  );
  test(`${puzzle}: solved input yields no moves`, async () => {
    assert.deepEqual((await solvePuzzle(puzzle, "")).moves, []);
  });
}

test("4x4 handoff matches the 3x3 piece model for every outer turn", async () => {
  const { puzzles } = await import("cubing/puzzles");
  const { reduced3x3Data } = await import("../lib/twisty/reduce-4x4");
  const cube4 = await puzzles["4x4x4"].kpuzzle();
  const cube3 = await puzzles["3x3x3"].kpuzzle();
  for (const face of ["U", "R", "F", "D", "L", "B"])
    for (const amount of ["", "2", "'"]) {
      const alg = `R U F' D2 L B2 ${face}${amount}`;
      const actual = reduced3x3Data(
        cube4.defaultPattern().applyAlg(alg),
        cube3,
      );
      const expected = cube3.defaultPattern().applyAlg(alg).patternData;
      assert.deepEqual(actual.EDGES, expected.EDGES);
      assert.deepEqual(actual.CORNERS, expected.CORNERS);
    }
  assert.throws(
    () => reduced3x3Data(cube4.defaultPattern().applyAlg("Rw"), cube3),
    /center|edge/,
  );
});

test(
  "4x4 state search solves varied wide-turn states and ignores equivalent history",
  { timeout: 60_000 },
  async () => {
    const { puzzles } = await import("cubing/puzzles");
    const cube = await puzzles["4x4x4"].kpuzzle();
    const inputs = [
      "Rw",
      "Lw'",
      "Dw2",
      "Bw Fw' Uw Lw2",
      "Rw2 B2 U2 Lw U2 Rw' U2 Rw U2 F2 Rw F2 Lw' B2 Rw2",
      "Rw2 U2 Rw2 Uw2 Rw2 Uw2",
      ...[7, 42, 2026, 8181].map((seed) => practiceScramble("4x4x4", seed)),
    ];
    for (const input of inputs) {
      const result = await solvePuzzle("4x4x4", input);
      assert.equal(result.method, "state-search");
      assert.equal(
        solved(
          cube.defaultPattern().applyAlg(`${input} ${result.solution}`),
          "4x4x4",
        ),
        true,
        input,
      );
    }
    const a = await solvePuzzle("4x4x4", "Rw U F2");
    const b = await solvePuzzle("4x4x4", "Rw U F2 L L'");
    assert.equal(
      a.solution,
      b.solution,
      "equivalent states must not depend on the input history",
    );
  },
);
