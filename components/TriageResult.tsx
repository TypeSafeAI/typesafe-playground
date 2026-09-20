"use client";
import { useState } from "react";
import {
  BookOpen,
  CheckCheck,
  Check,
  CircleHelp,
  Copy,
  UserRound,
} from "lucide-react";
import { percent } from "../lib/client";
import { JsonView } from "./JsonView";
import { Markdown } from "./Markdown";
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
/** "docs.typesafe.ai/patterns/rag" — enough to tell two sources apart. */
function sourceLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}
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
      {/* Documentation arrives as markdown. Rendering it as prose is not
          decoration: the raw form buries the emphasis and turns every link
          into visual noise, which is the opposite of what citing evidence is
          for. Prior messages stay verbatim -- a chat line is not markdown and
          reflowing it would misrepresent what someone actually typed. */}
      {evidence.kind === "doc" ? (
        <Markdown text={evidence.excerpt} base={evidence.sourceUrl} />
      ) : (
        <blockquote>{evidence.excerpt}</blockquote>
      )}
      <footer className="evidence-foot">
        <div className="input-meta">
          <span>Cited as {evidence.id}</span>
          <span>Word overlap {percent(evidence.score)}</span>
        </div>
        {evidence.sourceUrl && (
          <a
            href={evidence.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="evidence-source"
          >
            Read the source documentation ↗
          </a>
        )}
      </footer>
    </article>
  );
}
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="copy-reply">
      <button
        className="button copy-reply-button"
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setFailed(false);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // A refused clipboard used to leave the button silently inert,
            // which reads as the click not registering. Say so instead; the
            // reply stays selectable above.
            setCopied(false);
            setFailed(true);
          }
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        <span className="copy-reply-label">
          {copied ? "Copied" : "Copy reply"}
        </span>
      </button>
      <span role="status" aria-live="polite" className="copy-reply-status">
        {copied ? "Markdown copied to the clipboard." : ""}
        {failed ? "Could not reach the clipboard — select the text above." : ""}
      </span>
    </div>
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
          {/* Rendered so the quote and the sender's own words are visibly
              separate, while Copy takes the markdown source: this is pasted
              into a chat client that renders markdown itself, so the source is
              the useful thing to put on the clipboard. */}
          <Markdown
            text={decision.suggestedReply}
            className="suggested-reply markdown-body"
          />
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
          <div className="parsed-message candidate-evidence" key={candidate.id}>
            <strong>
              {candidate.id} · {candidate.label}
            </strong>
            <time>{candidate.kind === "doc" ? "docs" : "chat"}</time>
            {/* Docs are markdown, and mostly fenced code and diagrams, so a
                flat paragraph rendered them unreadable. Chat stays literal. */}
            {candidate.kind === "doc" ? (
              <Markdown
                text={candidate.excerpt}
                base={candidate.sourceUrl}
                className="candidate-body markdown-body"
                tabIndex={0}
                ariaLabel={`Evidence excerpt ${candidate.id}`}
              />
            ) : (
              <p>{candidate.excerpt}</p>
            )}
            {candidate.sourceUrl && (
              /* The heading already carries the title, so the link says where
                 it goes instead of repeating it. */
              <a
                href={candidate.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="evidence-source candidate-source"
              >
                {sourceLabel(candidate.sourceUrl)} ↗
              </a>
            )}
          </div>
        ))}
      </details>
      {response && (
        <details className="disclosure">
          <summary>Raw response</summary>
          <JsonView value={response} label="Raw response" defaultOpenDepth={2} />
        </details>
      )}
    </>
  );
}
