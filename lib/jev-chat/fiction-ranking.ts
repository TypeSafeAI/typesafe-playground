import type { Plan } from "./types";
import { readStoryFrame } from "./story";

export const fictionRubric = {
  progression: [
    "Problem and solution are merely stated.",
    "Concrete causal actions earn the outcome.",
  ],
  texture: [
    "Observations are generic and interchangeable.",
    "Observations are specific to the character and setting.",
  ],
};
export type FictionScore = {
  type: "score";
  score: number;
  confidence: number;
  probabilities: { "0": number; "1": number };
};

const SCORE_TOLERANCE = 1e-6;

function unit(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

/** Read only named own data properties. Ignored fields are never evaluated. */
function fields(
  value: unknown,
  keys: readonly string[],
  exact = false,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid object.");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error("Invalid object.");
  if (exact) {
    const own = Reflect.ownKeys(value);
    if (
      own.length !== keys.length ||
      own.some((key) => typeof key !== "string" || !keys.includes(key))
    )
      throw new Error("Invalid fields.");
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value"))
      throw new Error("Invalid field.");
    result[key] = descriptor.value;
  }
  return result;
}

/** Two-level preference score. Both distribution sum and score agreement use
 * absolute tolerance 1e-6. Values are detached but never normalized or coerced.
 * Low confidence is valid: this score ranks already-accepted fiction only.
 */
export function readFictionScore(value: unknown): FictionScore {
  try {
    const raw = fields(value, ["type", "score", "confidence", "probabilities"]);
    if (raw.type !== "score" || !unit(raw.score) || !unit(raw.confidence))
      throw new Error("Invalid scalar.");
    const probabilities = fields(raw.probabilities, ["0", "1"], true);
    const low = probabilities["0"];
    const high = probabilities["1"];
    if (
      !unit(low) ||
      !unit(high) ||
      Math.abs(low + high - 1) > SCORE_TOLERANCE ||
      Math.abs(raw.score - high) > SCORE_TOLERANCE
    )
      throw new Error("Invalid distribution.");
    return {
      type: "score",
      score: raw.score,
      confidence: raw.confidence,
      probabilities: { "0": low, "1": high },
    };
  } catch {
    throw new Error("Invalid fiction score.");
  }
}

function readSupport(value: unknown): number {
  const raw = fields(value, ["type", "noul"]);
  if (raw.type !== "noul" || !unit(raw.noul))
    throw new Error("Invalid support.");
  return raw.noul;
}

/** Select among 1–3 supported fictional plans; this is not proof of quality.
 * Parse every required answer first, including scores for rejected candidates.
 * Support >= 0.8 is the only eligibility rule. Progression ranks first, texture
 * breaks exact progression ties, and equal scores retain the input order.
 * A malformed assessment throws; null means all valid support scores declined.
 * The winner is the original plan object; neither plans nor answers are mutated.
 */
export function selectFictionPlan(
  plans: Plan[],
  answers: Record<string, unknown>,
): Plan | null {
  try {
    if (
      !Array.isArray(plans) ||
      plans.length < 1 ||
      plans.length > 3 ||
      Object.getPrototypeOf(plans) !== Array.prototype ||
      Reflect.ownKeys(plans).length !== plans.length + 1
    )
      throw new Error("Invalid plan set.");
    const candidates: { plan: Plan; id: string }[] = [];
    const ids = new Set<string>();
    for (let index = 0; index < plans.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(plans, String(index));
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value"))
        throw new Error("Invalid plan.");
      const candidate = descriptor.value;
      const metadata = fields(candidate, ["id", "intent", "status", "story"]);
      if (
        typeof metadata.id !== "string" ||
        metadata.id.trim().length === 0 ||
        metadata.id.length > 80 ||
        ids.has(metadata.id) ||
        metadata.intent !== "create" ||
        metadata.status !== "answered" ||
        !readStoryFrame(metadata.story)
      )
        throw new Error("Invalid plan.");
      ids.add(metadata.id);
      candidates.push({ plan: candidate, id: metadata.id });
    }
    const assessed = candidates.map((candidate) => {
      const supportId = `supported_${candidate.id}`;
      const progressionId = `progression_${candidate.id}`;
      const textureId = `texture_${candidate.id}`;
      const raw = fields(
        answers,
        candidates.length > 1
          ? [supportId, progressionId, textureId]
          : [supportId],
      );
      return {
        plan: candidate.plan,
        support: readSupport(raw[supportId]),
        progression:
          candidates.length > 1
            ? readFictionScore(raw[progressionId]).score
            : 0,
        texture:
          candidates.length > 1 ? readFictionScore(raw[textureId]).score : 0,
      };
    });
    let best: (typeof assessed)[number] | null = null;
    for (const candidate of assessed) {
      if (candidate.support < 0.8) continue;
      if (
        !best ||
        candidate.progression > best.progression ||
        (candidate.progression === best.progression &&
          candidate.texture > best.texture)
      )
        best = candidate;
    }
    return best?.plan ?? null;
  } catch {
    throw new Error("Invalid fiction assessment.");
  }
}
