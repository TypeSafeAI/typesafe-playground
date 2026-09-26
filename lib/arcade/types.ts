/**
 * Shared contract for Arcade games.
 *
 * A game is a pure state machine: it never reads the clock, the DOM or
 * Math.random. World randomness (apples, meteors, serve angles) comes from a
 * stream seeded by the game seed alone, so Jev, the scripted demo and the
 * random baseline all face the identical world on the same seed. The policy
 * choosing actions never touches that stream.
 */
export type ArcadeGameId = "snake" | "breakout" | "meteor-dodge";

export interface ActionOutcome {
  /** The move ends the run on this tick, such as a wall hit or a meteor. */
  crash: boolean;
  /** Plain facts about the result of this move, computed by code. */
  facts: Record<string, string | number | boolean | null>;
}

export interface ArcadeGame<S, A extends string = string> {
  id: ArcadeGameId;
  title: string;
  /** Every action the game knows, in display order. */
  actions: readonly A[];
  actionLabels: Record<A, string>;
  /** Closed-set criteria sent to Jev, one per action. */
  criteria: Record<A, string>;
  /** Instructions for the single choice question. */
  instructions: string;
  /** Safe action used when Jev's answer is missing or invalid. */
  fallback(state: S): A;
  /** Hard cap on decisions per run, which bounds live spend. */
  maxDecisions: number;
  scoreLabel: string;
  create(seed: number): S;
  legal(state: S): A[];
  /** What each legal action would do right now. Code computes it; Jev reads it. */
  outcomes(state: S): Record<string, ActionOutcome>;
  step(state: S, action: A): S;
  over(state: S): boolean;
  /** Why the run ended, for the result banner. */
  endReason(state: S): string | null;
  score(state: S): number;
  tick(state: S): number;
  /** Compact structured state for Jev, without the per-action outcomes. */
  features(state: S): Record<string, unknown>;
  /** A simple hand-written policy for the no-key demo. Not Jev. */
  scripted(state: S): A;
}

/** A game with its state and action types erased, for generic UI code. */
export type AnyArcadeGame = ArcadeGame<any, string>;
