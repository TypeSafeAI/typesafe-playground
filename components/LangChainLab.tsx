"use client";
import { usageRequest } from "../lib/usageRequest";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Heading, RunButton, ErrorNote, Export, Empty } from "./ui";
import { ROUTER_SCENARIOS, nodeById } from "../lib/workflowGraph";
import { errorMessage } from "../lib/client";
import { revealResults } from "../lib/scroll";
import { ConfidenceBar } from "./ConfidenceBar";
const snippet = `import { createJevRoutingTool } from "./lib/langchain/jev-tool";
import { serverJevTransport } from "./lib/serverJev";

const jevRouter = createJevRoutingTool({
  transport: serverJevTransport,
});

const decision = await jevRouter.invoke({
  request: "Check the current rate limit settings",
  current_node: "ops_agent",
});

// Route only after your host enforces policy and approval.
// decision.executed is always false.
console.log(decision);`;
type Invocation = {
  tool: string;
  mode: "live" | "mock";
  latencyMs: number;
  output: {
    selected_node: string | null;
    final_node: string;
    status: string;
    confidence: number | null;
    probability: number | null;
    policy_override: string | null;
    requires_approval: boolean;
    executed: false;
    explanation: string;
    excluded_candidates: string[];
    source: string;
  };
};
export function LangChainLab() {
  const [request, setRequest] = useState(ROUTER_SCENARIOS[0].request),
    [current, setCurrent] = useState("ops_agent"),
    [result, setResult] = useState<Invocation | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function clear() {
    setResult(null);
    setError("");
  }
  async function invoke(mode: "live" | "mock") {
    setBusy(true);
    setError("");
    setResult(null);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const data = await usageRequest(
        "/api/langchain-route",
        { request, current_node: current, mode },
        abort.signal,
        { mock: mode === "mock", example: "langchain" },
      );
      setResult(data);
      revealResults("langchain-result");
    } catch (e) {
      setError(
        abort.signal.aborted
          ? "Stopped. No downstream tool was executed."
          : errorMessage(e),
      );
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch {
      setError("Clipboard unavailable. Select and copy the code below.");
    }
  }
  return (
    <div className="workspace compact-lab langchain-workspace">
      <Heading
        eyebrow="RUNNABLE TYPESCRIPT INTEGRATION"
        title="Jev × LangChain"
        description="Wrap Jev as a real LangChain tool. Return a policy-checked routing decision to your host application."
      />
      <div className="integration-flow" aria-label="Integration flow">
        <span>LangChain .invoke()</span>
        <span>→</span>
        <span>Jev closed-set choice</span>
        <span>→</span>
        <span>Policy gate</span>
        <span>→</span>
        <span>Typed result</span>
      </div>
      <div className="lab-columns">
        <section className="panel lab-panel">
          <div className="panel-heading">
            <h2>Invoke the routing tool</h2>
            <span className="tag">@langchain/core</span>
          </div>
          <fieldset disabled={busy} className="lab-fields">
            <label>
              Example request
              <select
                aria-label="Example request"
                defaultValue="0"
                onChange={(e) => {
                  setRequest(ROUTER_SCENARIOS[Number(e.target.value)].request);
                  clear();
                }}
              >
                {ROUTER_SCENARIOS.map((s, i) => (
                  <option key={s.name} value={i}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              User request
              <textarea
                aria-label="User request"
                rows={4}
                maxLength={6000}
                value={request}
                onChange={(e) => {
                  setRequest(e.target.value);
                  clear();
                }}
              />
            </label>
            <label>
              Current graph node
              <select
                aria-label="Current graph node"
                value={current}
                onChange={(e) => {
                  setCurrent(e.target.value);
                  clear();
                }}
              >
                <option value="ops_agent">Operations · choose a tool</option>
                <option value="start">Start · choose an agent</option>
              </select>
            </label>
          </fieldset>
          <ErrorNote message={error} />
          <div className="lab-actions">
            <RunButton
              busy={busy}
              onClick={() => invoke("live")}
              onCancel={() => controller.current?.abort()}
              disabled={!request.trim()}
            >
              Invoke LangChain tool
            </RunButton>
            <button
              className="button"
              disabled={busy || !request.trim()}
              onClick={() => invoke("mock")}
            >
              Try mock invocation
            </button>
          </div>
          <p className="field-hint">
            Both buttons invoke a real LangChain structured tool on the server.
            Live mode uses Jev; mock mode substitutes seeded predictions.
            Neither executes a downstream action.
          </p>
          <details>
            <summary>What this integration guarantees</summary>
            <ul>
              <li>
                Zod validates the request and the two supported routing points.
              </li>
              <li>
                Blocked requests stop before Jev; forbidden nodes never enter
                the candidate set.
              </li>
              <li>
                Both scores must reach 85%. Low confidence asks for
                clarification.
              </li>
              <li>
                Configuration changes return an approval requirement, not
                permission to execute.
              </li>
            </ul>
          </details>
        </section>
        <section
          id="langchain-result"
          className="panel lab-panel lab-result-target"
        >
          <div className="panel-heading">
            <h2>Tool response</h2>
            <Export data={result} name="langchain-tool-result.json" />
          </div>
          {result ? (
            <div className="lab-result-stack">
              <div
                className={`compact-verdict router-verdict status-${result.output.status}`}
                role="status"
              >
                <div className="router-verdict-meta">
                  <span className="eyebrow">ROUTING RESULT</span>
                  <span className="tag">
                    {result.mode === "mock"
                      ? "Mock Jev · real tool invocation"
                      : "Live integration"}
                  </span>
                </div>
                <h2>
                  {nodeById(result.output.final_node)?.label ||
                    result.output.final_node}
                </h2>
                <p>{result.output.explanation}</p>
              </div>
              <dl className="routing-facts">
                <div>
                  <dt>Tool</dt>
                  <dd>
                    <code>{result.tool}</code>
                  </dd>
                </div>
                <div>
                  <dt>Invocation latency</dt>
                  <dd>{Math.round(result.latencyMs)} ms</dd>
                </div>
                <div>
                  <dt>Downstream execution</dt>
                  <dd>None · routing only</dd>
                </div>
              </dl>
              <ConfidenceBar
                label="Confidence"
                value={result.output.confidence}
              />
              <ConfidenceBar
                label="Probability"
                value={result.output.probability}
              />
              {result.output.requires_approval && (
                <div className="approval-card">
                  <h3>Your host must ask for approval</h3>
                  <p>
                    This tool returns requires_approval: true and executed:
                    false. Keep the action paused until a separate trusted
                    approval flow authorizes it.
                  </p>
                  <Link href="/agents/tool-router">
                    Try the approval walkthrough →
                  </Link>
                </div>
              )}
              <details open>
                <summary>Structured output</summary>
                <pre className="diff-evidence">
                  {JSON.stringify(result.output, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <Empty title="A tool result your application can use">
              Inspect the selected node, policy override and confidence as
              structured data. The host retains control of execution.
            </Empty>
          )}
        </section>
      </div>
      <section className="panel lab-panel integration-code">
        <div className="panel-heading">
          <div>
            <h2>Use it in your TypeScript app</h2>
            <p className="field-hint">
              Local integration example · not a published LangChain plugin
              package
            </p>
          </div>
          <button className="button" onClick={copy}>
            {copied ? "Copied" : "Copy example"}
          </button>
        </div>
        <pre className="diff-evidence">{snippet}</pre>
        <div className="integration-notes">
          <p>
            <strong>Try locally:</strong> <code>pnpm example:langchain</code>{" "}
            runs the actual tool through a RunnableLambda chain with mock
            predictions.
          </p>
          <p>
            <strong>Use live Jev:</strong> set <code>TYPESAFE_API_KEY</code> in
            your server environment or <code>.env.local</code>, then run{" "}
            <code>pnpm example:langchain --live</code>.
          </p>
          <p>
            The factory is in <code>lib/langchain/jev-tool.ts</code>. Pass it as
            a tool to your LangChain host or call <code>.invoke()</code>{" "}
            directly. No OpenAI or LangSmith key is required for this example.
          </p>
        </div>
      </section>
    </div>
  );
}
