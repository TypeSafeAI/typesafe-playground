import type { RouterState } from "../types/workflow";
import { nodeById } from "../lib/workflowGraph";
import { DecisionPreview } from "./WorkspaceGuide";
import { RunButton } from "./ui";
import { ConfidenceBar } from "./ConfidenceBar";
const policyNames: Record<string, string> = {
  always_blocked: "Sensitive-data protection",
  confidence_gate: "85% confidence gate",
  requires_approval: "Human approval required",
  approval_granted: "Mock approval granted",
  approval_denied: "Approval declined",
};
export function RoutingResult({
  state,
  onApprove,
  busy,
  onEdit,
  onContinue,
  onCancel,
}: {
  state: RouterState;
  onApprove: (approved: boolean) => void;
  busy: boolean;
  onEdit?: () => void;
  onContinue?: () => void;
  onCancel?: () => void;
}) {
  const last = state.log.at(-1);
  if (!last)
    return (
      <div className="empty">
        <DecisionPreview />
        <h3>See the decision, then follow the path</h3>
        <p>
          Run one live routing step, or try the full seeded scenario without an
          API call.
        </p>
      </div>
    );
  const modelCalled = last.source === "jev" || last.source === "mock";
  const output =
    state.status === "ended"
      ? state.log.findLast(
          (entry) => nodeById(entry.finalNode)?.type === "tool" && entry.output,
        )?.output || last.output
      : last.output;
  return (
    <section className="lab-result-stack">
      <div
        className={`compact-verdict router-verdict status-${state.status}`}
        role="status"
      >
        <div className="router-verdict-meta">
          <span className="eyebrow">
            {state.status === "blocked"
              ? "POLICY STOP"
              : state.status === "approval"
                ? "YOUR APPROVAL NEEDED"
                : state.status === "ended"
                  ? "Path complete"
                  : state.status === "clarification"
                    ? "MORE CONTEXT NEEDED"
                    : "NEXT STEP"}
          </span>
          <span className="tag">
            {last.source === "mock"
              ? "Mock prediction"
              : last.source === "jev"
                ? "Live Jev"
                : last.source === "unavailable"
                  ? "Model unavailable"
                  : "No model call"}
          </span>
        </div>
        <h2>{nodeById(last.finalNode)?.label}</h2>
        <p>{last.explanation}</p>
        {!modelCalled && state.status === "blocked" && (
          <div className="router-stop-proof">
            <span>Jev was not called for this step</span>
            <span>No tool executed</span>
          </div>
        )}
      </div>
      {state.status === "approval" && (
        <div className="approval-card">
          <h3>Allow this simulated configuration change?</h3>
          <p>
            The tool is paused. Your choice affects only this demo; production
            is never accessed.
          </p>
          <div className="lab-actions">
            <button
              disabled={busy}
              className="button primary"
              onClick={() => onApprove(true)}
            >
              Approve mock step
            </button>
            <button
              disabled={busy}
              className="button"
              onClick={() => onApprove(false)}
            >
              Decline
            </button>
          </div>
        </div>
      )}
      {output && (
        <div className="router-output">
          <span className="eyebrow">SIMULATED OUTPUT</span>
          <p>{output}</p>
        </div>
      )}
      <div className="router-next-action">
        <p>
          {state.status === "ready"
            ? "This step passed policy. Continue to see where the request goes next."
            : state.status === "clarification"
              ? "Add detail to the request so the router has a clear next step."
              : state.status === "ended"
                ? "Path complete. Choose another scenario to compare behavior."
                : state.status === "blocked"
                  ? "Try a request that reads settings without asking for sensitive data."
                  : "Approve or decline to resolve this checkpoint."}
        </p>
        {state.status === "ready" && onContinue && (
          <RunButton busy={busy} onClick={onContinue} onCancel={onCancel}>
            Continue routing
          </RunButton>
        )}
        {["blocked", "clarification", "ended"].includes(state.status) &&
          onEdit && (
            <button className="button" disabled={busy} onClick={onEdit}>
              Edit request
            </button>
          )}
      </div>
      <details className="router-technical">
        <summary>Decision details</summary>
        {last.selected && (
          <dl className="routing-facts">
            <div>
              <dt>Proposed node</dt>
              <dd>{nodeById(last.selected)?.label || last.selected}</dd>
            </div>
            <div>
              <dt>Policy</dt>
              <dd>
                {last.policyOverride
                  ? policyNames[last.policyOverride] || last.policyOverride
                  : "Allowed"}
              </dd>
            </div>
          </dl>
        )}
        {last.selected && modelCalled && (
          <>
            <ConfidenceBar label="Jev confidence" value={last.confidence} />
            <ConfidenceBar
              label="Selected probability"
              value={last.probability}
            />
          </>
        )}
        <p>
          Final node: <code>{last.finalNode}</code>
        </p>
        <p>
          Policy override: <code>{last.policyOverride || "none"}</code>
        </p>
        {last.excluded.length > 0 && (
          <p>
            Excluded before Jev: <code>{last.excluded.join(", ")}</code>
          </p>
        )}
        <p>
          All tool execution is mocked. No settings, credentials or services are
          accessed.
        </p>
      </details>
    </section>
  );
}
