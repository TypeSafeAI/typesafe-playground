import type { Question } from "../api";
import type { AnyArcadeGame } from "./types";

export type DecisionSource = "jev" | "fallback" | "forced";

export interface ArcadeDecision {
  tick: number;
  action: string;
  source: DecisionSource;
  /** Jev's reported confidence, capped by the chosen action's probability. */
  confidence: number | null;
  probabilities: Record<string, number>;
  error?: string;
}

const unit = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

/**
 * The move to play without asking, when exactly one legal action avoids an
 * immediate crash. A one-option "choice" is not a decision worth a request,
 * the same rule the chess lab uses for forced moves. Returns null when the
 * choice is real.
 */
export function forcedAction(
  game: AnyArcadeGame,
  state: unknown,
): string | null {
  const legal = game.legal(state);
  if (legal.length === 1) return legal[0];
  const outcomes = game.outcomes(state);
  const safe = legal.filter((a) => !outcomes[a]?.crash);
  return safe.length === 1 ? safe[0] : null;
}

/** One closed-set choice over the legal actions, with code-computed outcomes. */
export function buildArcadePayload(
  game: AnyArcadeGame,
  state: unknown,
  model = "jev-latest",
) {
  const legal = game.legal(state);
  if (legal.length < 2)
    throw Error("A Jev decision needs at least two legal actions.");
  const criteria: Record<string, string> = {};
  for (const action of legal) criteria[action] = game.criteria[action];
  const outcomes = game.outcomes(state);
  const questions: Record<string, Question> = {
    action: { type: "choice", instructions: game.instructions, criteria },
  };
  return {
    model,
    state: {
      task: `choose_one_${game.id.replace(/-/g, "_")}_action`,
      game: game.title,
      tick: game.tick(state),
      ...game.features(state),
      outcomes: Object.fromEntries(
        legal.map((a) => [
          a,
          { crash: outcomes[a].crash, ...outcomes[a].facts },
        ]),
      ),
    },
    questions,
  };
}

/**
 * Accepts only a complete, normalized distribution over the offered actions
 * whose choice is one of them. Anything else plays the game's fallback and is
 * recorded as a fallback, never as a Jev decision.
 */
export function resolveArcadeDecision(
  game: AnyArcadeGame,
  state: unknown,
  response: unknown,
): ArcadeDecision {
  const legal = game.legal(state);
  const tick = game.tick(state);
  const answer = (response as any)?.answers?.action;
  const probabilities: Record<string, number> = {};
  for (const action of legal)
    if (unit(answer?.probabilities?.[action]))
      probabilities[action] = answer.probabilities[action];
  const complete = legal.every((a) => a in probabilities);
  const total = Object.values(probabilities).reduce((s, p) => s + p, 0);
  const valid =
    answer?.type === "choice" &&
    legal.includes(answer.choice) &&
    unit(answer.confidence) &&
    complete &&
    Math.abs(total - 1) <= 0.02;
  if (!valid)
    return {
      tick,
      action: game.fallback(state),
      source: "fallback",
      confidence: null,
      probabilities,
      error: "Incomplete or invalid choice. The safe fallback move was played.",
    };
  return {
    tick,
    action: answer.choice,
    source: "jev",
    confidence: Math.min(answer.confidence, probabilities[answer.choice]),
    probabilities,
  };
}
