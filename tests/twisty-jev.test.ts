import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePayload } from "../lib/api";
import {
  buildTwistyPayload,
  legalPuzzleMoves,
  resolveTwistyChoice,
} from "../lib/twisty/jev";
import { PUZZLES, parseMoves, type PuzzleId } from "../lib/twisty/contracts";
import { solved } from "../lib/twisty/state";

for (const puzzle of Object.keys(PUZZLES) as PuzzleId[]) {
  test(`${puzzle}: Jev receives legal closed-set moves and accurate one-turn outcomes`, async () => {
    const kpuzzle = await (
      await import("cubing/puzzles")
    ).puzzles[puzzle].kpuzzle();
    const pattern = kpuzzle.defaultPattern().applyMove("R");
    const legal = legalPuzzleMoves(puzzle);
    assert.equal(new Set(legal).size, legal.length);
    assert.deepEqual(parseMoves(puzzle, legal.join(" ")), legal);
    const payload = validatePayload(buildTwistyPayload(puzzle, pattern, []));
    assert.equal(payload.model, "jev-latest");
    assert.equal(payload.questions.move.type, "choice");
    assert.deepEqual(Object.keys(payload.questions.move.criteria!), legal);
    const state = payload.state as any;
    assert.deepEqual(state.piece_state, pattern.patternData);
    assert.equal(state.outcomes["R'"].solved, true);
    for (const move of legal)
      assert.equal(
        state.outcomes[move].solved,
        solved(pattern.applyMove(move), puzzle),
      );
    for (const key of ["solution", "scramble", "recommended_move"])
      assert.equal(key in state, false);
    assert.equal(state.remaining_moves, 40);
  });
}

const response = (move = "R'") => ({
  model: "jev-test",
  answers: {
    move: {
      type: "choice",
      choice: move,
      confidence: 0.9,
      probabilities: Object.fromEntries(
        legalPuzzleMoves("3x3x3").map((candidate) => [
          candidate,
          candidate === move ? 1 : 0,
        ]),
      ),
    },
  },
});

test("Jev's named move is applied even when it is not the local best move", async () => {
  const pattern = (
    await (await import("cubing/puzzles")).puzzles["3x3x3"].kpuzzle()
  )
    .defaultPattern()
    .applyMove("R");
  const decision = resolveTwistyChoice("3x3x3", response("U"));
  assert.equal(decision.move, "U");
  assert.equal(decision.model, "jev-test");
  assert.equal(solved(pattern.applyMove(decision.move), "3x3x3"), false);
});

test("malformed Jev answers never become fallback moves", () => {
  const invalid: unknown[] = [null, {}, { answers: {} }];
  for (const patch of [
    { type: "noul" },
    { choice: "NOT_A_MOVE" },
    { confidence: 2 },
    { confidence: NaN },
    { probabilities: {} },
    { probabilities: { "R'": 1 } },
    { probabilities: { ...response().answers.move.probabilities, rogue: 0 } },
    {
      probabilities: Object.fromEntries(
        legalPuzzleMoves("3x3x3").map((move) => [move, 1]),
      ),
    },
  ])
    invalid.push({
      answers: { move: { ...response().answers.move, ...patch } },
    });
  for (const value of invalid)
    assert.throws(
      () => resolveTwistyChoice("3x3x3", value),
      /No move was applied/,
    );
  assert.equal(resolveTwistyChoice("3x3x3", response()).move, "R'");
});

test("history sent to Jev is bounded to its last eight moves", async () => {
  const pattern = (
    await (await import("cubing/puzzles")).puzzles.megaminx.kpuzzle()
  ).defaultPattern();
  const state = buildTwistyPayload("megaminx", pattern, Array(39).fill("R"))
    .state as any;
  assert.equal(state.recent_jev_moves.length, 8);
  assert.equal(state.remaining_moves, 1);
});
