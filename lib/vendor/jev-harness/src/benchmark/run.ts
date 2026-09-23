/**
 * Fixture bench runner: propose -> validate -> (Jev review) -> decide -> receipt.
 *
 * This is benchmark machinery for synthetic fixtures, not an agent runtime or a
 * host. "Execute" means recording the proposal as pending in the receipt.
 * Nothing applies a patch, runs fixture tests, or executes proposed code.
 * `base` mode is validate-only and uses the benchmark-only `decideBase`; it is
 * never a fallback for a failed review.
 *
 * Extracted from TypeSafeAI/typesafe-playground `lib/harness/run.ts` at
 * 6fe5967dc020521a0731682b06c4d8eeeab95ffb, adapted to the hardened `decide()`.
 */
import { decide, REVIEW_CONFIDENCE_THRESHOLD, type Decision } from "../contract/decide";
import type { RunPayload } from "../contract/payload";
import { reviewProposal, type ReviewOptions } from "../contract/review";
import {
  JEV_MODEL,
  type Fixture,
  type JevReview,
  type JevSource,
  type JevTransport,
  type Proposer,
  type Receipt,
  type ReviewArm,
  type ReviewMode,
} from "../contract/types";
import { validateProposal } from "../contract/validate";
import { decideBase } from "./index";

export interface RunOptions {
  arm: ReviewArm;
  /** `base` = validate only; `plus_jev` = validate, then review. */
  mode?: ReviewMode;
  signal?: AbortSignal;
  model?: string;
  source?: JevSource;
  threshold?: number;
  /** Injectable clock for deterministic receipts in tests. */
  now?: () => string;
  /** Injectable latency clock, passed to `reviewProposal`. */
  clock?: () => number;
}

export interface RunResult {
  receipt: Receipt;
  /** Exact post-validation request and raw response; not part of the receipt. */
  exchange: { payload: RunPayload; response: unknown } | null;
}

export async function runProposalReview(
  fixture: Fixture,
  proposer: Proposer,
  transport: JevTransport<RunPayload> | null,
  options: RunOptions,
): Promise<RunResult> {
  const mode: ReviewMode = options.mode ?? "plus_jev";
  const proposal = await proposer.propose(fixture, options.arm);
  const validation = validateProposal(proposal, fixture.files);
  let jev: JevReview | null = null;
  let exchange: RunResult["exchange"] = null;
  let decision: Decision;
  if (mode === "base") decision = decideBase(validation);
  else {
    if (validation.ok) {
      if (!transport)
        jev = {
          model: options.model ?? JEV_MODEL,
          answers: null,
          error: "No Jev transport configured.",
          latencyMs: 0,
          source: options.source ?? "jev",
        };
      else {
        const reviewOptions: ReviewOptions = {};
        if (options.signal) reviewOptions.signal = options.signal;
        if (options.model !== undefined) reviewOptions.model = options.model;
        if (options.source) reviewOptions.source = options.source;
        if (options.clock) reviewOptions.clock = options.clock;
        const { payload, raw, ...review } = await reviewProposal(fixture, proposal, transport, reviewOptions);
        jev = review;
        exchange = { payload, response: raw };
      }
    }
    decision = decide(validation, jev, options.threshold ?? REVIEW_CONFIDENCE_THRESHOLD);
  }
  const pending = decision.verdict === "permit" || decision.verdict === "proposal_only";
  const receipt: Receipt = {
    schemaVersion: 1,
    fixtureId: fixture.id,
    arm: options.arm,
    mode,
    proposer: proposer.name,
    proposal,
    validation,
    jev,
    verdict: decision.verdict,
    reason: decision.reason,
    execution: {
      applied: false,
      status: pending ? "recorded_pending" : "withheld",
      note: pending
        ? proposal.tool === "propose_patch"
          ? "Patch recorded as pending. Nothing was applied and no proposed code ran."
          : "Read request recorded as pending. No file was returned to a model."
        : "Proposal withheld. Nothing was applied and no proposed code ran.",
    },
    at: (options.now ?? (() => new Date().toISOString()))(),
  };
  return { receipt, exchange };
}
