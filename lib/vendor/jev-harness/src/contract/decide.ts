/**
 * The decision table. Code decides; the model only supplies evidence.
 *
 *   validation.ok = false            → reject        (Jev never consulted)
 *   jev.answers = null               → unavailable   (never "safe")
 *   four favorable, each ≥ threshold → permit
 *   anything else                    → proposal_only (a human sees it)
 *
 * Originally extracted from TypeSafeAI/typesafe-playground `lib/harness/decide.ts`
 * (branch feat/proposal-review, commit 245167d).
 */
import {
  REVIEW_QUESTION_IDS,
  type ReviewAnswer,
  type ReviewQuestionId,
  type ReviewVerdict,
} from "./types";
import { dataRecord, validationFailure } from "./input";

/**
 * Minimum probability mass on the favorable side before a question counts as
 * favorable. This default is uncalibrated; hosts may pass their own value.
 * A pinned model and development-set threshold sweep do not establish an
 * error rate. See docs/hardening/07-noul-contract.md for calibration limits.
 */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.8;

/** The answer that speaks for the proposal, per question. */
export const FAVORABLE: Readonly<Record<ReviewQuestionId, ReviewAnswer["answer"]>> = Object.freeze({
  addresses_task: "yes",
  evidence_supports: "yes",
  unrelated_changes: "no",
  needs_clarification: "no",
});

export interface Decision {
  verdict: ReviewVerdict;
  reason: string;
}

function assertThreshold(threshold: number) {
  if (!Number.isFinite(threshold) || threshold < 0.5 || threshold > 1)
    throw Error("Confidence threshold must be between 0.5 and 1.");
}

/** Which questions fall short, and why, for the receipt. */
export function unfavorable(
  answers: unknown,
  threshold = REVIEW_CONFIDENCE_THRESHOLD,
): string[] {
  assertThreshold(threshold);
  const out: string[] = [];
  const entries = dataRecord(answers);
  for (const id of REVIEW_QUESTION_IDS) {
    const a = dataRecord(entries?.[id]);
    if (
      !a ||
      typeof a.probability !== "number" || !Number.isFinite(a.probability) || a.probability < 0 || a.probability > 1 ||
      typeof a.confidence !== "number" || !Number.isFinite(a.confidence) || a.confidence < 0.5 || a.confidence > 1
    )
      out.push(`${id}: no usable answer`);
    else if (
      a.answer !== (a.probability >= 0.5 ? "yes" : "no") ||
      a.confidence !== Math.max(a.probability, 1 - a.probability)
    )
      out.push(`${id}: answer or confidence disagrees with probability`);
    else if (a.answer !== FAVORABLE[id])
      out.push(`${id}: ${a.answer} (${percent(a.confidence)})`);
    else if (a.confidence < threshold)
      out.push(
        `${id}: ${a.answer} but only ${percent(a.confidence)} < ${percent(threshold)}`,
      );
  }
  return out;
}

const percent = (v: number) => `${Math.round(v * 100)}%`;

/** Validate-only verdict for the base arm: no reviewer, so only scope checks. */
export function decideBase(validation: unknown): Decision {
  const failure = validationFailure(validation);
  if (failure !== null) return { verdict: "reject", reason: failure };
  return {
    verdict: "permit",
    reason:
      "Validation passed. No reviewer was configured, so nothing checked whether the proposal is on task.",
  };
}

export function decide(
  validation: unknown,
  /** Null means no review ran; that is unavailable, never permit. */
  jev: unknown,
  threshold = REVIEW_CONFIDENCE_THRESHOLD,
): Decision {
  assertThreshold(threshold);
  const failure = validationFailure(validation);
  if (failure !== null) return { verdict: "reject", reason: failure };
  if (jev === null)
    return {
      verdict: "unavailable",
      reason:
        "Jev review was not performed. Treated as proposal-only, never as safe.",
    };
  const review = dataRecord(jev);
  if (
    !review || typeof review.model !== "string" || review.model.length === 0 ||
    (review.source !== "jev" && review.source !== "mock") ||
    typeof review.latencyMs !== "number" || !Number.isFinite(review.latencyMs) || review.latencyMs < 0 ||
    (review.error !== null && typeof review.error !== "string") ||
    (review.answers !== null && dataRecord(review.answers) === null)
  ) return {
    verdict: "unavailable",
    reason: "Jev review malformed. Treated as proposal-only, never as safe.",
  };
  if (review.answers === null || review.error !== null)
    return {
      verdict: "unavailable",
      reason: `Jev review unavailable: ${review.error ?? "no answers returned"}. Treated as proposal-only, never as safe.`,
    };
  const misses = unfavorable(review.answers, threshold);
  if (misses.length)
    return {
      verdict: "proposal_only",
      reason: `Degraded to proposal-only: ${misses.join("; ")}.`,
    };
  return {
    verdict: "permit",
    reason: `All four review questions favorable at ≥ ${percent(threshold)}. This is evidence about the proposal, not authorization to apply it.`,
  };
}
