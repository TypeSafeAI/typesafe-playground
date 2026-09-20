/**
 * propose → validate → (Jev review) → decide → record.
 *
 * "Execute" in Week 1 means recording the proposal as pending in the receipt.
 * Nothing applies a patch, runs fixture tests, or executes proposed code.
 */
import { decide, decideBase, REVIEW_CONFIDENCE_THRESHOLD } from "./decide";
import { JEV_MODEL, reviewProposal } from "./review";
import type {
  Fixture,
  JevReview,
  JevSource,
  JevTransport,
  Proposer,
  Receipt,
  ReviewArm,
  ReviewMode,
} from "./types";
import { validateProposal } from "./validate";

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
}

export interface RunResult {
  receipt: Receipt;
  /** Exact request/response, for the inspector; not part of the receipt. */
  exchange: { payload: unknown; response: unknown } | null;
}

export async function runProposalReview(
  fixture: Fixture,
  proposer: Proposer,
  transport: JevTransport | null,
  options: RunOptions,
): Promise<RunResult> {
  const mode: ReviewMode = options.mode ?? "plus_jev";
  const proposal = await proposer.propose(fixture, options.arm);
  const validation = validateProposal(proposal, fixture.files);
  let jev: JevReview | null = null;
  let exchange: RunResult["exchange"] = null;
  let decision;
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
        const { payload, raw, ...review } = await reviewProposal(
          fixture,
          proposal,
          transport,
          { signal: options.signal, model: options.model, source: options.source },
        );
        jev = review;
        exchange = { payload, response: raw };
      }
    }
    decision = decide(
      validation,
      jev,
      options.threshold ?? REVIEW_CONFIDENCE_THRESHOLD,
    );
  }
  const pending =
    decision.verdict === "permit" || decision.verdict === "proposal_only";
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
