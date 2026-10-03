export const MEGAMINX_FACES = [
  "U",
  "D",
  "F",
  "B",
  "L",
  "R",
  "FL",
  "FR",
  "BL",
  "BR",
  "DL",
  "DR",
] as const;
export const PUZZLES = {
  "2x2x2": {
    label: "2×2 cube",
    sample: "R U F2 R' U2 F",
    turns: ["R", "U", "F", "L", "D", "B"],
  },
  "3x3x3": {
    label: "3×3 cube",
    sample: "R U R' U' F2 D L2 B U2 R2",
    turns: ["R", "U", "F", "L", "D", "B"],
  },
  "4x4x4": {
    label: "4×4 cube",
    sample: "Rw U F2 Uw' R2 Fw D Rw2 B' Uw",
    turns: ["R", "U", "F", "L", "D", "B", "Rw", "Uw", "Fw"],
  },
  megaminx: {
    label: "Megaminx",
    sample: "R++ D-- R-- D++ U R++ D++ U'",
    turns: ["R", "U", "F", "L", "D", "B"],
  },
} as const;
export type PuzzleId = keyof typeof PUZZLES;
export type PuzzleResult = {
  puzzle: PuzzleId;
  scramble: string;
  solution: string;
  moves: string[];
  method: "state-search" | "jev-moves";
  verified: true;
};
export const MAX_MOVES = 250;
export const MAX_INPUT = 2000;
export function isPuzzleId(value: unknown): value is PuzzleId {
  return typeof value === "string" && Object.hasOwn(PUZZLES, value);
}
/** Flat notation only: never expand user-controlled repetitions or commutators. */
export function parseMoves(puzzle: PuzzleId, input: unknown): string[] {
  if (typeof input !== "string" || input.length > MAX_INPUT)
    throw Error(`Use at most ${MAX_INPUT} characters.`);
  const moves = input.trim() ? input.trim().split(/\s+/) : [];
  if (moves.length > MAX_MOVES) throw Error(`Use at most ${MAX_MOVES} moves.`);
  const allowed =
    puzzle === "megaminx"
      ? /^(?:(?:[URFLDB]|[FBD][LR])(?:2|2'|')?|[RD](?:\+\+|--))$/
      : puzzle === "4x4x4"
        ? /^[URFLDB]w?(?:2|2'|')?$/
        : /^[URFLDB](?:2|2'|')?$/;
  for (const move of moves)
    if (!allowed.test(move))
      throw Error(
        `Unsupported move: ${move.slice(0, 24)}. Use the notation guide below.`,
      );
  return moves;
}
/** Reproducible random-move practice; not a WCA random-state scramble. */
export function practiceScramble(puzzle: PuzzleId, seed: number): string {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const faces = PUZZLES[puzzle].turns;
  const result: string[] = [];
  let previous = "";
  for (let i = 0; i < (puzzle === "2x2x2" ? 12 : 24); i++) {
    const choices = faces.filter((face) => face[0] !== previous);
    const face = choices[Math.floor(random() * choices.length)];
    previous = face[0];
    result.push(face + ["", "'", "2"][Math.floor(random() * 3)]);
  }
  return result.join(" ");
}
