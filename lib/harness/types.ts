/**
 * Proposal-review harness — shared types.
 *
 * Pure TypeScript. No React, no fetch. A proposer suggests one action, Jev
 * answers four yes/no (noul) questions about it, and code decides. A verdict is
 * evidence about the proposal, never permission or authorization to act.
 */
import type { RunPayload } from "../api";

export const PROPOSAL_TOOLS = ["read_file", "propose_patch"] as const;
export type ProposalTool = (typeof PROPOSAL_TOOLS)[number];

export interface Proposal {
  tool: ProposalTool;
  /** Relative path inside the fixture root. */
  path: string;
  /** Single-file unified diff. Required for propose_patch, absent otherwise. */
  patch?: string;
  rationale: string;
  /** Quoted lines from the fixture the proposer relies on. Untrusted data. */
  evidence: string[];
}

export const REVIEW_QUESTION_IDS = [
  "addresses_task",
  "evidence_supports",
  "unrelated_changes",
  "needs_clarification",
] as const;
export type ReviewQuestionId = (typeof REVIEW_QUESTION_IDS)[number];

/**
 * One noul answer, kept alongside the derived yes/no reading. The TypeSafe
 * noul contract returns a single probability-of-yes; there is no separate
 * confidence field, so `confidence` is the probability mass on the side that
 * was read (max(p, 1 − p)).
 */
export interface ReviewAnswer {
  /** Raw `noul` value from the response: probability that the answer is yes. */
  probability: number;
  answer: "yes" | "no";
  confidence: number;
}
export type ReviewAnswers = Record<ReviewQuestionId, ReviewAnswer>;

export type ReviewVerdict =
  | "permit"
  | "proposal_only"
  | "reject"
  | "unavailable";

export interface ValidationResult {
  ok: boolean;
  /** Every failed check, in order. Empty when ok. */
  errors: string[];
}

export type JevSource = "jev" | "mock";

export interface JevReview {
  model: string;
  /** Null whenever the provider failed, timed out, or answered malformed. */
  answers: ReviewAnswers | null;
  error: string | null;
  latencyMs: number;
  source: JevSource;
}

export type ReviewArm = "good" | "bad";
export type ReviewMode = "base" | "plus_jev";

export interface Receipt {
  schemaVersion: 1;
  fixtureId: string;
  arm: ReviewArm;
  mode: ReviewMode;
  proposer: string;
  proposal: Proposal;
  validation: ValidationResult;
  /** Null when the run was validate-only (base arm). */
  jev: JevReview | null;
  verdict: ReviewVerdict;
  reason: string;
  /** Week 1 never applies a patch or runs proposed code. */
  execution: {
    applied: false;
    status: "recorded_pending" | "withheld";
    note: string;
  };
  at: string;
}

export type FixtureCategory =
  | "clean"
  | "off_scope"
  | "missing_evidence"
  | "prompt_injection"
  | "ambiguous";

/** Scripted noul probabilities the labeled mock transport returns. */
export type MockAnswers = Record<ReviewQuestionId, number>;

export interface Fixture {
  id: string;
  category: FixtureCategory;
  task: string;
  files: Record<string, string>;
  evidence: string[];
  proposals: Record<ReviewArm, Proposal>;
  expected: Record<ReviewArm, ReviewVerdict>;
  mock: Record<ReviewArm, MockAnswers>;
}

export type JevTransport = (
  payload: RunPayload,
  signal?: AbortSignal,
) => Promise<unknown>;

export interface Proposer {
  name: string;
  propose(fixture: Fixture, arm: ReviewArm): Promise<Proposal>;
}
