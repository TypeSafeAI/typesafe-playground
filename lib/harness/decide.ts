/**
 * The decision table. Code decides; the model only supplies evidence.
 *
 *   validation.ok = false            → reject        (Jev never consulted)
 *   jev.answers = null               → unavailable   (never "safe")
 *   four favorable, each ≥ threshold → permit
 *   anything else                    → proposal_only (a human sees it)
 */
import {
  REVIEW_QUESTION_IDS,
  type JevReview,
  type ReviewAnswer,
  type ReviewQuestionId,
  type ReviewVerdict,
  type ValidationResult,
} from "./types";

/**
 * Minimum probability mass on the favorable side before a question counts as
 * favorable. TODO: calibrate against the live bench in docs/proposal-review.md;
 * 0.8 follows the noul guidance for "false positives are costly".
 */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.8;

/** The answer that speaks for the proposal, per question. */
export const FAVORABLE: Record<ReviewQuestionId, ReviewAnswer["answer"]> = {
  addresses_task: "yes",
  evidence_supports: "yes",
  unrelated_changes: "no",
  needs_clarification: "no",
};

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
  answers: NonNullable<JevReview["answers"]>,
  threshold = REVIEW_CONFIDENCE_THRESHOLD,
): string[] {
  assertThreshold(threshold);
  const out: string[] = [];
  for (const id of REVIEW_QUESTION_IDS) {
    const a = answers[id];
    if (
      !a ||
      !Number.isFinite(a.probability) ||
      a.probability < 0 ||
      a.probability > 1 ||
      !Number.isFinite(a.confidence) ||
      a.confidence < 0 ||
      a.confidence > 1
    )
      out.push(`${id}: no usable answer`);
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
export function decideBase(validation: ValidationResult): Decision {
  if (!validation.ok)
    return {
      verdict: "reject",
      reason: `Validation failed: ${validation.errors.join("; ")}`,
    };
  return {
    verdict: "permit",
    reason:
      "Validation passed. No reviewer was configured, so nothing checked whether the proposal is on task.",
  };
}

export function decide(
  validation: ValidationResult,
  /** Null means no review ran; that is unavailable, never permit. */
  jev: JevReview | null,
  threshold = REVIEW_CONFIDENCE_THRESHOLD,
): Decision {
  assertThreshold(threshold);
  if (!validation.ok)
    return {
      verdict: "reject",
      reason: `Validation failed: ${validation.errors.join("; ")}`,
    };
  if (jev === null)
    return {
      verdict: "unavailable",
      reason:
        "Jev review was not performed. Verdict unavailable; never treated as safe.",
    };
  if (jev.answers === null)
    return {
      verdict: "unavailable",
      reason: `Jev review unavailable: ${jev.error ?? "no answers returned"}. Verdict unavailable; never treated as safe.`,
    };
  const misses = unfavorable(jev.answers, threshold);
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
