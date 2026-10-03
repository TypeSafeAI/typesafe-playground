import type { KPattern } from "cubing/kpuzzle";
import type { PuzzleId } from "./contracts";

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
