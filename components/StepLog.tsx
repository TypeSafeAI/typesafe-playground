import type { RoutingLogEntry } from "../types/workflow";
import { nodeById } from "../lib/workflowGraph";
import { percent } from "../lib/client";
export function StepLog({ entries }: { entries: RoutingLogEntry[] }) {
  // RoutingResult owns onboarding; the path appears after the first decision.
  if (!entries.length) return null;
  return (
    <section className="router-step-log">
      <div className="router-section-title">
        <h3>Path taken</h3>
        <span className="tag">
          {entries.length} {entries.length === 1 ? "step" : "steps"}
        </span>
      </div>
      <ol>
        {entries.map((e) => (
          <li key={e.step}>
            <div className="step-number">{e.step}</div>
            <div>
              <span className="router-step-from">
                From {nodeById(e.from)?.label}
              </span>
              <strong>{nodeById(e.finalNode)?.label}</strong>
              <div className="step-badges">
                <span className="tag">
                  {e.source === "deterministic"
                    ? "Policy / graph"
                    : e.source === "mock"
                      ? "Mock Jev"
                      : e.source === "jev"
                        ? "Live Jev"
                        : "Unavailable"}
                </span>
                {e.policyOverride && (
                  <span className="tag">
                    {e.policyOverride.replaceAll("_", " ")}
                  </span>
                )}
              </div>
              <details>
                <summary>Step evidence</summary>
                <p>{e.explanation}</p>
                {e.selected && (
                  <p>
                    Proposed: <code>{e.selected}</code> · confidence{" "}
                    {percent(e.confidence)} · probability{" "}
                    {percent(e.probability)}
                  </p>
                )}
                {e.output && <p>{e.output}</p>}
              </details>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
