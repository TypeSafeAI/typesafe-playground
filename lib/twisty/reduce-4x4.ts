import type { KPattern, KPuzzle } from "cubing/kpuzzle";

// Wing locations in cubing.js 0.63.8, projected onto its twelve 3x3 edges.
// Both definitions use the same corner and edge orientation conventions.
const EDGE_MAP = [
  2, 1, 0, 3, 3, 9, 7, 11, 0, 8, 4, 9, 1, 10, 5, 8, 2, 11, 6, 10, 4, 5, 6, 7,
];

export function reduced3x3Data(pattern: KPattern, cube3: KPuzzle) {
  const { EDGES, CORNERS, CENTERS } = pattern.patternData;
  if (!CENTERS.pieces.every((piece, i) => piece === Math.floor(i / 4) * 4))
    throw Error("The 4×4 reduction did not orient and solve every center.");
  const pieces: number[] = [];
  const orientation: number[] = [];
  for (let edge = 0; edge < 12; edge++) {
    const [a, b] = EDGE_MAP.flatMap((value, i) => (value === edge ? [i] : []));
    if (
      EDGE_MAP[EDGES.pieces[a]] !== EDGE_MAP[EDGES.pieces[b]] ||
      EDGES.orientation[a] !== EDGES.orientation[b]
    )
      throw Error("The 4×4 reduction left an unpaired edge.");
    pieces.push(EDGE_MAP[EDGES.pieces[a]]);
    orientation.push(EDGES.orientation[a]);
  }
  return {
    CORNERS,
    EDGES: { pieces, orientation },
    CENTERS: cube3.defaultPattern().patternData.CENTERS,
  };
}

/** Find one of the 24 whole-cube orientations, without changing relative pieces. */
function orientCenters(pattern: KPattern): string {
  const candidates = [""];
  const seen = new Set<string>();
  for (let i = 0; i < candidates.length; i++) {
    const rotation = candidates[i];
    const centers = pattern.applyAlg(rotation).patternData.CENTERS.pieces;
    if (centers.every((piece, index) => piece === Math.floor(index / 4) * 4))
      return rotation;
    const key = centers.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > 24) break;
    for (const axis of ["x", "y"])
      candidates.push(`${rotation} ${axis}`.trim());
  }
  throw Error("The 4×4 reduction left unsolved centers.");
}

export async function solve4x4(
  pattern: KPattern,
  scramble: string,
): Promise<string> {
  const [{ reduce444 }, { puzzles }, { KPattern }, search] = await Promise.all([
    import("./vendor/reduce444"),
    import("cubing/puzzles"),
    import("cubing/kpuzzle"),
    import("cubing/search"),
  ]);
  // The reduction solver constructs the piece state and searches it. It neither
  // stores nor inverts the input history when finding a solution.
  const reduction = reduce444(scramble);
  const reduced = pattern.applyAlg(reduction);
  const rotation = orientCenters(reduced);
  const cube3 = await puzzles["3x3x3"].kpuzzle();
  const remaining = new KPattern(
    cube3,
    reduced3x3Data(reduced.applyAlg(rotation), cube3),
  );
  search.setSearchDebug({ logPerf: false, scramblePrefetchLevel: "none" });
  const finish = remaining.experimentalIsSolved({
    ignorePuzzleOrientation: false,
    ignoreCenterOrientation: true,
  })
    ? ""
    : (
        await search.experimentalSolve3x3x3IgnoringCenters(remaining)
      ).toString();
  return [reduction, rotation, finish].filter(Boolean).join(" ");
}
