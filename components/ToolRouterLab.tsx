"use client";
import { useEffect, useRef, useState } from "react";
import { Heading, RunButton, ErrorNote, Export } from "./ui";
import { GraphView } from "./GraphView";
import { RoutingResult } from "./RoutingResult";
import { StepLog } from "./StepLog";
import { initialRouterState, ROUTER_SCENARIOS } from "../lib/workflowGraph";
import { routeStep, approveMockStep } from "../lib/routeStep";
import { errorMessage } from "../lib/client";
import { revealResults } from "../lib/scroll";
import {
  ArrowRight,
  Route,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
export function ToolRouterLab() {
  const [scenario, setScenario] = useState(0),
    [state, setState] = useState(
      initialRouterState(ROUTER_SCENARIOS[0].request),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function step() {
    setBusy(true);
    setError("");
    const controller = new AbortController();
    abort.current = controller;
    try {
      setState(await routeStep(state, undefined, controller.signal));
      revealResults("router-results");
    } catch (e) {
      setError(
        controller.signal.aborted
          ? "Stopped. No new step was executed."
          : errorMessage(e),
      );
    } finally {
      setBusy(false);
    }
  }
  async function demo() {
    setBusy(true);
    setError("");
    const selected = ROUTER_SCENARIOS[scenario];
    let s = initialRouterState(selected.request);
    try {
      for (let i = 0; i < 6 && s.status === "ready"; i++) {
        s = await routeStep(
          s,
          async () => {
            const choice = selected.path[s.log.length] || "needs_clarification";
            return {
              answers: {
                next_node: {
                  type: "choice",
                  choice,
                  confidence: 0.98,
                  probabilities: { [choice]: 0.99 },
                },
              },
            };
          },
          undefined,
          "mock",
        );
      }
      setState(s);
      revealResults("router-results");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function approve(yes: boolean) {
    try {
      setState(approveMockStep(state, yes));
      setError("");
      revealResults("router-results");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <div className="workspace compact-lab router-workspace">
      <Heading
        eyebrow="LANGGRAPH-STYLE · MOCK EXECUTION"
        title="Jev tool router"
        description="Find the right tool for a request. Follow each decision, approval, and policy stop."
      />
      <div className="router-journey" aria-label="How routing works">
        <span>
          <Route size={18} />
          <strong>Choose a request</strong>
        </span>
        <ArrowRight size={15} aria-hidden="true" />
        <span>
          <ShieldCheck size={18} />
          <strong>Check the next step</strong>
        </span>
        <ArrowRight size={15} aria-hidden="true" />
        <span>
          <span className="router-journey-dot" />
          <strong>Follow the path</strong>
        </span>
        <small>All execution is simulated</small>
      </div>
      <div className="lab-columns">
        <section className="panel lab-panel">
          <div className="panel-heading">
            <h2>Your request</h2>
            <button
              className="button quiet"
              disabled={busy}
              onClick={() => {
                setState(initialRouterState(state.request));
                setError("");
              }}
            >
              Reset path
            </button>
          </div>
          <fieldset className="lab-fields" disabled={busy}>
            <label>
              Demo scenario
              <select
                aria-label="Demo scenario"
                value={scenario}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setScenario(n);
                  setState(initialRouterState(ROUTER_SCENARIOS[n].request));
                  setError("");
                }}
              >
                {ROUTER_SCENARIOS.map((s, i) => (
                  <option key={s.name} value={i}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {state.request === ROUTER_SCENARIOS[scenario].request && (
              <p className="field-hint">
                Expected demo path: {ROUTER_SCENARIOS[scenario].expectation}
              </p>
            )}
            <label>
              User request
              <textarea
                aria-label="User request"
                rows={4}
                maxLength={6000}
                value={state.request}
                onChange={(e) => {
                  setState(initialRouterState(e.target.value));
                  setError("");
                }}
              />
            </label>
          </fieldset>
          <ErrorNote message={error} />
          <div className="lab-actions">
            <RunButton
              busy={busy}
              onClick={step}
              onCancel={() => abort.current?.abort()}
              disabled={state.status !== "ready" || !state.request.trim()}
            >
              Run Routing Step
            </RunButton>
            <button className="button" disabled={busy} onClick={demo}>
              Run mock scenario
            </button>
          </div>
          <p className="field-hint">
            Live step: Jev chooses. Mock scenario: seeded choices. All execution
            is simulated.
          </p>
          <details className="router-inspector">
            <summary>
              <SlidersHorizontal size={15} /> Routing inspector
            </summary>
            <GraphView state={state} />
          </details>
          <details className="router-policy">
            <summary>How policy overrides Jev</summary>
            <ol>
              <li>
                Sensitive-data keywords block the entire request before any
                model call.
              </li>
              <li>Always-blocked nodes are removed from the candidate set.</li>
              <li>
                Both Jev scores must meet 85%; otherwise the path stops for
                clarification.
              </li>
              <li>Configuration changes pause for explicit mock approval.</li>
            </ol>
            <p className="field-hint">
              The keyword rule is intentionally broad for this demo. It is not a
              complete production intent detector. The fixed graph also makes
              secret export impossible regardless of phrasing.
            </p>
          </details>
        </section>
        <section
          id="router-results"
          className="panel lab-panel lab-result-target"
        >
          <div className="panel-heading">
            <h2>The next step</h2>
            <Export
              data={
                state.log.length
                  ? {
                      ...state,
                      execution: "mock",
                      engine: "LangGraph-style simulation",
                    }
                  : null
              }
              name="tool-router-path.json"
            />
          </div>
          <RoutingResult
            state={state}
            onApprove={approve}
            busy={busy}
            onContinue={step}
            onCancel={() => abort.current?.abort()}
            onEdit={() => {
              const field = document.querySelector<HTMLTextAreaElement>(
                'textarea[aria-label="User request"]',
              );
              field?.focus();
              field?.scrollIntoView({
                block: "center",
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "instant"
                  : "smooth",
              });
            }}
          />
          <StepLog entries={state.log} />
        </section>
      </div>
    </div>
  );
}
