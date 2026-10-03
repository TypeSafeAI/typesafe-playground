import type { KPattern } from "cubing/kpuzzle";
import {
  isPuzzleId,
  parseMoves,
  type PuzzleId,
  type PuzzleResult,
} from "./contracts";

/** Ignore center spin, never ignore displaced centers, edges or corners. */
export function solved(pattern: KPattern, puzzle: PuzzleId): boolean {
  if (puzzle === "3x3x3")
    return pattern.experimentalIsSolved({
      ignorePuzzleOrientation: true,
      ignoreCenterOrientation: true,
    });
  const expected = pattern.kpuzzle.defaultPattern().patternData;
  return Object.entries(pattern.patternData).every(
    ([name, orbit]) =>
      orbit.pieces.every(
        (piece, index) => piece === expected[name].pieces[index],
      ) &&
      (name.toUpperCase().includes("CENTER") ||
        orbit.orientation.every(
          (value, index) => value === expected[name].orientation[index],
        )),
  );
}

export async function solvePuzzle(
  puzzle: PuzzleId,
  input: string,
): Promise<PuzzleResult> {
  if (!isPuzzleId(puzzle)) throw Error("Choose a supported puzzle.");
  const scramble = parseMoves(puzzle, input).join(" ");
  const [{ Alg }, { puzzles }] = await Promise.all([
    import("cubing/alg"),
    import("cubing/puzzles"),
  ]);
  const kpuzzle = await puzzles[puzzle].kpuzzle();
  const pattern = kpuzzle.defaultPattern().applyAlg(scramble);
  let solution = new Alg();
  const method = "state-search";
  if (!solved(pattern, puzzle)) {
    if (puzzle === "4x4x4") {
      const { solve4x4 } = await import("./reduce-4x4");
      solution = new Alg(await solve4x4(pattern, scramble));
    } else {
      const search = await import("cubing/search");
      search.setSearchDebug({ logPerf: false, scramblePrefetchLevel: "none" });
      solution = await (puzzle === "2x2x2"
        ? search.experimentalSolve2x2x2(pattern)
        : puzzle === "3x3x3"
          ? search.experimentalSolve3x3x3IgnoringCenters(pattern)
          : search.solveMegaminx(pattern));
    }
  }
  if (!solved(pattern.applyAlg(solution), puzzle))
    throw Error(
      "The solver returned an unverified result. No solution was accepted.",
    );
  const moves = Array.from(solution.experimentalLeafMoves(), (move) =>
    move.toString(),
  );
  return {
    puzzle,
    scramble,
    solution: moves.join(" "),
    moves,
    method,
    verified: true,
  };
}
