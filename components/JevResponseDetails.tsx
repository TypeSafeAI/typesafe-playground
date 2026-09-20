"use client";
import { STATE_CAPITALS_REFERENCE } from "../lib/jev-chat/state-capitals";
import { useState } from "react";
import {
  Check,
  Calculator,
  ChevronRight,
  FileText,
  Fingerprint,
  GitBranch,
} from "lucide-react";
import { verifyGraph } from "../lib/jev-chat/graph";
import { verifySavedResult } from "../lib/jev-chat/persistence";
import type { EngineResult } from "../lib/jev-chat/types";
import { personalityLabels } from "../lib/jev-chat/personality";
import { download, percent } from "../lib/client";

export function JevResponseDetails({
  result,
  restored = false,
  notes,
}: {
  result: EngineResult;
  restored?: boolean;
  notes: string;
}) {
  const [verification, setVerification] = useState("");
  const [calculationVerification, setCalculationVerification] = useState("");
  return (
    <div className="jc-engine-result">
      <div className="jc-result-tags">
        <span>
          <GitBranch size={12} />
          {result.intent}
        </span>
        <span>
          {result.calculation
            ? "Calculated from notes"
            : result.sections.some((s) => s.provenance === "hypothetical")
              ? "Fictional composition"
              : result.sources.length
                ? `${result.sources.length} source passage${result.sources.length === 1 ? "" : "s"}`
                : "Scripted language"}
        </span>
        {result.status !== "answered" && (
          <span>
            {result.status === "clarify"
              ? "Clarification needed"
              : "Evidence unavailable"}
          </span>
        )}
      </div>
      {result.calculation && (
        <details className="jc-source-details jc-calculation-details">
          <summary>
            <Calculator size={13} /> Check the calculation
          </summary>
          <div className="jc-decision">
            <strong>{result.calculation.equation}</strong>
            {result.calculation.operands.map(({ fact }) => (
              <blockquote key={fact.id}>
                <cite>
                  {fact.source} · {fact.attribute}
                </cite>
                <p>{fact.context}</p>
                <p>Selected figure: {fact.raw}</p>
              </blockquote>
            ))}
            <p>
              Arithmetic is checked against the supplied figures. This does not
              establish that the sources are true or that the selected figures
              answer your question.
            </p>
            <div className="jc-hash-tree">
              <strong>Calculation fingerprint</strong>
              <code>{result.calculation.root}</code>
              <p>
                Links the source text, selected figures, operation and result.
              </p>
              <div className="jc-trace-actions">
                <button
                  type="button"
                  onClick={async () =>
                    setCalculationVerification(
                      (await verifySavedResult(result, notes))
                        ? "Arithmetic and source bindings verified"
                        : "Calculation check failed",
                    )
                  }
                >
                  <Check size={13} /> Verify calculation
                </button>
              </div>
              {calculationVerification && (
                <p role="status">{calculationVerification}</p>
              )}
            </div>
          </div>
        </details>
      )}
      {result.sources.length > 0 && (
        <details className="jc-source-details">
          <summary>
            <FileText size={13} />
            View supporting passages
          </summary>
          {result.sources.map((source) => (
            <blockquote key={source.id}>
              <cite>{source.source}</cite>
              <p>{source.text}</p>
            </blockquote>
          ))}
        </details>
      )}
      <details className="jc-composition-details">
        <summary>
          <Fingerprint size={13} />
          How this response was composed
        </summary>
        <div className="jc-decision">
          <div className="jc-trace-flow">
            <span>
              {result.trace.semanticVerification === "scripted-knowledge"
                ? "Reference lookup"
                : result.trace.semanticVerification === "scripted-personality"
                  ? "Hometown preference"
                  : result.trace.semanticVerification === "scripted-help"
                    ? "Match help"
                    : "Interpret"}
            </span>
            <ChevronRight size={12} />
            <span>Compose</span>
            <ChevronRight size={12} />
            <span>{result.trace.calls > 1 ? "Evaluate" : "Select"}</span>
            <ChevronRight size={12} />
            <span>Verify</span>
          </div>
          <dl>
            <div>
              <dt>Personality</dt>
              <dd>
                {personalityLabels[result.trace.personality ?? "default"]}
              </dd>
            </div>
            {result.story && (
              <>
                <div>
                  <dt>Story tone</dt>
                  <dd>{result.story.tone}</dd>
                </div>
                <div>
                  <dt>Ending</dt>
                  <dd>{result.story.ending}</dd>
                </div>
                <div>
                  <dt>Story detail</dt>
                  <dd>{result.story.style}</dd>
                </div>
              </>
            )}
            <div>
              <dt>Selected plan</dt>
              <dd>{result.trace.selectedPlan}</dd>
            </div>
            <div>
              <dt>Jev requests</dt>
              <dd>
                {result.trace.calls}
                {result.trace.semanticVerification === "scripted-knowledge"
                  ? " · built-in knowledge"
                  : result.trace.semanticVerification === "scripted-personality"
                    ? " · scripted personality"
                    : result.trace.semanticVerification === "scripted-help"
                      ? " · scripted help"
                      : result.provenance === "demo"
                        ? " · local rules"
                        : ""}
              </dd>
            </div>
            <div>
              <dt>Intent probability</dt>
              <dd>{percent(result.signal.probability)}</dd>
            </div>
            <div>
              <dt>Distribution confidence</dt>
              <dd>{percent(result.signal.confidence)}</dd>
            </div>
            <div>
              <dt>Reported tokens</dt>
              <dd>
                {result.trace.inputTokens === null ||
                result.trace.outputTokens === null
                  ? "Unknown"
                  : `${result.trace.inputTokens} in / ${result.trace.outputTokens} out`}
              </dd>
            </div>
            <div>
              <dt>Elapsed</dt>
              <dd>{Math.round(result.trace.elapsedMs)} ms</dd>
            </div>
          </dl>
          <p>{result.trace.reason}</p>
          {result.story && (
            <p>
              The current scene is retained for follow-up edits. Tone, ending
              and detail can change while the other story choices stay in place.
            </p>
          )}
          <p>
            {restored
              ? "Saved trace · model attribution is not cryptographically authenticated. "
              : ""}
            {result.trace.semanticVerification === "scripted-knowledge" ? (
              <>
                This response uses the built-in U.S. state-capital table.{" "}
                <a
                  href={STATE_CAPITALS_REFERENCE}
                  target="_blank"
                  rel="noreferrer"
                >
                  State-capital reference
                </a>
                . No Jev request or model assessment was used.
              </>
            ) : result.trace.semanticVerification === "scripted-personality" ? (
              "This is Jev Chat’s authored hometown preference. No Jev request, model assessment, or factual city ranking was used."
            ) : result.trace.semanticVerification === "scripted-help" ? (
              "This is documented application help, rendered by local rules. No Jev request or model assessment was used."
            ) : result.provenance === "demo" ? (
              "Demo behavior is scripted. These are not measurements of Jev quality."
            ) : (
              "Model relevance checks are probabilistic and do not establish factual correctness."
            )}
          </p>
          <details className="jc-candidate-details">
            <summary>
              {result.trace.candidates.length} response candidate
              {result.trace.candidates.length === 1 ? "" : "s"}
            </summary>
            {result.trace.candidates.map((c) => (
              <div key={c.id} className="jc-candidate">
                <strong>
                  {c.title}
                  {c.id === result.trace.selectedPlan ? " · selected" : ""}
                </strong>
                <p>{c.text}</p>
              </div>
            ))}
          </details>
          <div className="jc-hash-tree">
            <div>
              <Fingerprint size={14} />
              <strong>Response fingerprint</strong>
            </div>
            <code>{result.graph.root}</code>
            <div className="jc-hash-leaves">
              {result.graph.nodes[result.graph.root]?.children.map((id, i) => (
                <span key={`${id}-${i}`} title={result.graph.nodes[id]?.text}>
                  {result.graph.nodes[id]?.provenance} · {id.slice(0, 8)}
                </span>
              ))}
            </div>
            <p>
              SHA-256 verifies the exact fragments and their order. It does not
              verify truth or authorship.
            </p>
            <div className="jc-trace-actions">
              <button
                type="button"
                onClick={async () => {
                  const check = await verifyGraph(result.graph);
                  setVerification(
                    check.valid && check.text === result.text
                      ? "Content integrity verified"
                      : "Integrity check failed",
                  );
                }}
              >
                <Check size={13} />
                Verify content
              </button>
              <button
                type="button"
                onClick={() => download("jev-response-graph.json", result)}
              >
                Export trace
              </button>
            </div>
            {verification && <p role="status">{verification}</p>}
          </div>
        </div>
      </details>
    </div>
  );
}
