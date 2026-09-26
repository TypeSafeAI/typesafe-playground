import type { AnyArcadeGame, ArcadeGameId } from "./types";
import { snake } from "./snake";
import { breakout } from "./breakout";
import { meteorDodge } from "./meteor";
import { policyRandom } from "./random";

export const ARCADE_GAMES: Record<ArcadeGameId, AnyArcadeGame> = {
  snake,
  breakout,
  "meteor-dodge": meteorDodge,
};

export type Policy = "random" | "scripted";

/**
 * The random baseline picks uniformly among legal moves that do not crash on
 * this tick, falling back to any legal move. It avoids only instant, obvious
 * losses, so beating it means the choices carry information, not just luck.
 */
export function randomPolicy(game: AnyArcadeGame, seed: number) {
  const random = policyRandom(seed);
  return (state: unknown): string => {
    const legal = game.legal(state);
    const outcomes = game.outcomes(state);
    const safe = legal.filter((a) => !outcomes[a]?.crash);
    const pool = safe.length ? safe : legal;
    return pool[Math.floor(random() * pool.length)];
  };
}

export interface PolicyResult {
  score: number;
  decisions: number;
  endReason: string | null;
}

/** Plays one full run locally. No network, no model call. */
export function playOut(
  game: AnyArcadeGame,
  seed: number,
  policy: Policy,
): PolicyResult {
  let state = game.create(seed);
  const choose =
    policy === "random" ? randomPolicy(game, seed) : game.scripted.bind(game);
  for (let i = 0; i < game.maxDecisions && !game.over(state); i++)
    state = game.step(state, choose(state));
  return {
    score: game.score(state),
    decisions: game.tick(state),
    endReason: game.endReason(state),
  };
}

export interface BaselineSummary {
  /** Score on the exact seed being played. */
  sameSeed: number;
  /** Mean score across a fixed seed range, for context. */
  mean: number;
  runs: number;
}

/** The random baseline on the current seed plus its mean over fixed seeds. */
export function randomBaseline(
  game: AnyArcadeGame,
  seed: number,
  runs = 20,
): BaselineSummary {
  let total = 0;
  for (let i = 1; i <= runs; i++) total += playOut(game, i, "random").score;
  return {
    sameSeed: playOut(game, seed, "random").score,
    mean: total / runs,
    runs,
  };
}
