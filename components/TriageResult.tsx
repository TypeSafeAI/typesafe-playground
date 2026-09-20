"use client";
import { useState } from "react";
import {
  BookOpen,
  CheckCheck,
  CircleHelp,
  Copy,
  UserRound,
} from "lucide-react";
import { percent } from "../lib/client";
import {
  citesEvidence,
  outcomeHeadlines,
  outcomeLabels,
  type EvidenceCandidate,
  type JevResponse,
  type TriageDecision,
  type TriageOutcome,
} from "../types/triage";
const icons = {
  already_answered: CheckCheck,
  answerable_by_docs: BookOpen,
  needs_human: UserRound,
  needs_more_context: CircleHelp,
};
export function OutcomeBadge({ outcome }: { outcome: TriageOutcome }) {
  const Icon = icons[outcome];
  return (
    <span className="outcome-badge" data-outcome={outcome}>
      <Icon size={13} />
      {outcomeLabels[outcome]}
    </span>
  );
}
export function EvidenceCard({
  evidence,
  heading = "Evidence",
}: {
  evidence: EvidenceCandidate;
  heading?: string;
}) {
  return (
    <article className="evidence-card">
      <div className="evidence-title">
        <h3>
          {heading}: {evidence.kind === "doc" ? "docs" : "prior message"}
        </h3>
        <span>{evidence.label}</span>
      </div>
      <blockquote>{evidence.excerpt}</blockquote>
      {evidence.sourceUrl && (
        <a
          href={evidence.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="field-hint"
        >
          Read the source documentation ↗
        </a>
      )}
      <div className="input-meta">
        <span>Cited as {evidence.id}</span>
        <span>Word overlap {percent(evidence.score)}</span>
      </div>
    </article>
  );
}
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="button quiet"
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      <Copy size={14} />
      {copied ? "Copied" : "Copy reply"}
    </button>
  );
}
export function TriageResult({
  decision,
  candidates,
  response,
}: {
  decision: TriageDecision;
  candidates: EvidenceCandidate[];
  response?: JevResponse;
}) {
  return (
    <>
      <div className="gate-verdict" data-outcome={decision.outcome}>
        <div className="decision-top">
          <OutcomeBadge outcome={decision.outcome} />
          <strong>{percent(decision.confidence)}</strong>
        </div>
        <h2>{outcomeHeadlines[decision.outcome]}</h2>
        <div className="probability-track">
          <span style={{ width: percent(decision.confidence) }} />
        </div>
        <p>{decision.reason}</p>
      </div>
      {decision.overridden && decision.proposed && (
        <p className="notice">
          Jev proposed <strong>{outcomeLabels[decision.proposed]}</strong>. The
          gate reports <strong>{outcomeLabels[decision.outcome]}</strong>{" "}
          instead.
        </p>
      )}
      {decision.evidence ? (
        <EvidenceCard evidence={decision.evidence} />
      ) : (
        citesEvidence(decision.proposed ?? "needs_human") && (
          <p className="muted">
            Jev pointed at nothing specific, so there is no evidence to check.
          </p>
        )
      )}
      {decision.suggestedReply && (
        <article className="evidence-card">
          <div className="evidence-title">
            <h3>Suggested reply</h3>
            <span>TEMPLATE, NOT GENERATED</span>
          </div>
          <p className="suggested-reply">{decision.suggestedReply}</p>
          <CopyButton text={decision.suggestedReply} />
        </article>
      )}
      <article className="evidence-card">
        <div className="evidence-title">
          <h3>Outcome probabilities</h3>
          <span>CLOSED SET OF 4</span>
        </div>
        <div className="candidate-list">
          {(Object.keys(outcomeLabels) as TriageOutcome[]).map((outcome) => (
            <span
              key={outcome}
              className={outcome === decision.proposed ? "chosen" : ""}
            >
              {outcomeLabels[outcome]} ·{" "}
              {percent(decision.probabilities[outcome])}
            </span>
          ))}
        </div>
      </article>
      <details className="disclosure">
        <summary>
          Evidence Jev could choose from <span>{candidates.length}</span>
        </summary>
        {candidates.map((candidate) => (
          <div className="parsed-message" key={candidate.id}>
            <strong>
              {candidate.id} · {candidate.label}
            </strong>
            <time>{candidate.kind === "doc" ? "docs" : "chat"}</time>
            <p>{candidate.excerpt}</p>
          </div>
        ))}
      </details>
      {response && (
        <details className="disclosure">
          <summary>Raw response</summary>
          <pre className="criteria-preview">
            {JSON.stringify(response, null, 2)}
          </pre>
        </details>
      )}
    </>
  );
}
