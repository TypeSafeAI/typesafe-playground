import type { RunPayload } from "../api";
import { NONE_OPTION } from "./catalog";
import { tokenize } from "./baseline";
import type { ToolRouterTransport } from "./route";

/**
 * Deterministic stand-in for Jev used by tests and `--mock` benchmark runs.
 * It turns lexical overlap between state.task and each option description into
 * a probability distribution, with a fixed weight on `none`. Mock numbers
 * exercise the harness; they say nothing about Jev.
 */
const NONE_WEIGHT = 1;

export function mockAnswer(payload: RunPayload, head: string) {
  const question = payload.questions[head];
  if (
    !question ||
    question.type !== "choice" ||
    Array.isArray(question.criteria) ||
    !question.criteria
  )
    throw Error(`Mock transport expected a choice question named "${head}".`);
  const state = payload.state as { task?: unknown };
  const task = typeof state?.task === "string" ? state.task : "";
  const query = new Set(tokenize(task));
  const weights: Record<string, number> = {};
  for (const [id, description] of Object.entries(question.criteria)) {
    if (id === NONE_OPTION) {
      weights[id] = NONE_WEIGHT;
      continue;
    }
    const terms = tokenize(`${id} ${description}`);
    weights[id] = terms.filter((t) => query.has(t)).length;
  }
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const probabilities = Object.fromEntries(
    Object.entries(weights).map(([id, w]) => [
      id,
      Number((w / total).toFixed(6)),
    ]),
  );
  const choice = Object.keys(probabilities).sort(
    (a, b) => probabilities[b] - probabilities[a] || a.localeCompare(b),
  )[0];
  return {
    type: "choice",
    choice,
    probabilities,
    confidence: probabilities[choice],
  };
}

export const mockTransport: ToolRouterTransport = async (payload) => ({
  model: `${payload.model}-mock`,
  answers: Object.fromEntries(
    Object.keys(payload.questions).map((head) => [
      head,
      mockAnswer(payload, head),
    ]),
  ),
});
