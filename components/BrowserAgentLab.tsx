"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  AppWindow,
  Bot,
  Eye,
  Play,
  RotateCcw,
  ShieldCheck,
  SkipForward,
  Square,
  ArrowLeft,
  PanelRight,
  Globe2,
} from "lucide-react";
import { useUsage, usageBlocked } from "../lib/logUsageEntry";
import { errorMessage, percent } from "../lib/client";
import {
  agentCycle,
  createAgentState,
  observe,
  runAgent,
  type LoopState,
} from "../lib/agentLoop";
import {
  FLIGHT_GOAL,
  defaultSandbox,
  flightSandboxHtml,
  flightRequirements,
  verifyFlightSearch,
  type SandboxOptions,
} from "../lib/flightSandbox";
import { formatElementTable } from "../lib/getElementTable";
import {
  describeCycle,
  exportRun,
  isEscalation,
  outcomeLabels,
} from "../lib/logStep";
import type {
  AgentStatus,
  CycleLog,
  TextHelperMode,
  VerificationReport,
} from "../types/browserAgent";
import { Empty, ErrorNote, Export, Heading } from "./ui";
import { PcBuildResearch } from "./PcBuildResearch";
import { BrowserAgentDiagnostics } from "./BrowserAgentDiagnostics";
import {
  PC_BUILD_GOAL,
  resolveBrowserContext,
} from "../lib/browserTaskContext";
import { WorkspaceGuide } from "./WorkspaceGuide";
import { BrowserAgentGuide } from "./BrowserAgentGuide";
const statusLabels: Record<AgentStatus, string> = {
  ready: "Ready",
  running: "Running",
  done: "Done · verified",
  blocked: "Blocked",
  failed: "Failed",
  stopped: "Stopped",
};
function Bars({
  probabilities,
  chosen,
  limit = 6,
}: {
  probabilities: Record<string, number>;
  chosen: string | null;
  limit?: number;
}) {
  const rows = Object.entries(probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (!rows.length)
    return <p className="field-hint">No probabilities reported.</p>;
  return (
    <ul className="agent-bars">
      {rows.map(([key, value]) => (
        <li key={key} aria-current={key === chosen ? "true" : undefined}>
          <span>{key}</span>
          <i style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} />
          <b>{percent(value)}</b>
        </li>
      ))}
    </ul>
  );
}
function Checks({ report }: { report: VerificationReport }) {
  return (
    <ul className="agent-checks">
      {Object.entries(report.checks).map(([name, ok]) => (
        <li key={name} data-ok={ok ? "true" : "false"}>
          <span aria-hidden="true">{ok ? "✓" : "✗"}</span>
          {name.replaceAll("_", " ")}
        </li>
      ))}
    </ul>
  );
}
export function BrowserAgentLab() {
  const [goal, setGoal] = useState(PC_BUILD_GOAL);
  const [busy, setBusy] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [controlsHost, setControlsHost] = useState<HTMLDivElement | null>(null);
  const context = resolveBrowserContext(goal);
  return (
    <div className="browser-studio">
      <header className="browser-toolbar">
        <Link className="icon-button" href="/" aria-label="Back to playground">
          <ArrowLeft size={17} />
        </Link>
        <div className="browser-identity">
          <Globe2 size={18} />
          <h1>Jev-powered browser agent</h1>
        </div>
        <div className="browser-address">
          <span className="browser-status-dot" data-busy={busy} />
          <span>
            {context.kind === "newegg"
              ? "newegg.com"
              : context.kind === "flight"
                ? "skyline.local / flight sandbox"
                : "Choose a task"}
          </span>
        </div>
        <button
          type="button"
          className="button quiet"
          aria-pressed={inspectorOpen}
          aria-controls="browser-inspector"
          onClick={() => setInspectorOpen(!inspectorOpen)}
        >
          <PanelRight size={16} />
          Inspector
        </button>
        <WorkspaceGuide compact>
          <BrowserAgentGuide />
        </WorkspaceGuide>
      </header>
      <div className="browser-stage" aria-label="Browser workspace">
        {context.kind === "flight" && (
          <FlightBrowserAgentLab
            key={goal}
            goal={goal}
            onBusyChange={setBusy}
            inspectorOpen={inspectorOpen}
            controlsHost={controlsHost}
          />
        )}
        {context.kind === "newegg" && (
          <div className="browser-research-stage">
            <PcBuildResearch
              key={goal}
              goal={goal}
              onBusyChange={setBusy}
              controlsHost={controlsHost}
              inspectorOpen={inspectorOpen}
              onOpenInspector={() => setInspectorOpen(true)}
            />
          </div>
        )}
        {context.kind === "unsupported" && (
          <div className="browser-start">
            <Globe2 size={36} />
            <h2>A browser for your next task.</h2>
            <p>{context.reason}</p>
          </div>
        )}
      </div>
      <section
        className="browser-composer"
        aria-label="Browser task composer"
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            (event.metaKey || event.ctrlKey) &&
            !busy
          ) {
            event.preventDefault();
            controlsHost
              ?.querySelector<HTMLButtonElement>("button:not([disabled])")
              ?.click();
          }
        }}
      >
        <div className="browser-composer-meta">
          <label className="browser-preset">
            Task preset
            <select
              aria-label="Task preset"
              disabled={busy}
              value={context.kind}
              onChange={(event) =>
                setGoal(
                  event.target.value === "newegg" ? PC_BUILD_GOAL : FLIGHT_GOAL,
                )
              }
            >
              <option value="flight">Flight sandbox</option>
              <option value="newegg">Newegg · $2,500 / 1440p PC</option>
              {context.kind === "unsupported" && (
                <option value="unsupported" disabled>
                  Custom goal · unsupported
                </option>
              )}
            </select>
          </label>
          <p role="status">
            Execution context:{" "}
            {context.kind === "flight"
              ? "flight sandbox"
              : context.kind === "newegg"
                ? "Newegg PC research"
                : "unsupported goal"}
          </p>
        </div>
        <div className="browser-input-row">
          <textarea
            aria-label="Goal"
            placeholder="What would you like the browser to do?"
            rows={2}
            maxLength={2000}
            disabled={busy}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
          />
          <div className="browser-run-controls" ref={setControlsHost} />
        </div>
        <div className="browser-composer-foot">
          <span>
            {busy
              ? "Working in the browser…"
              : "Your goal stays attached to every step."}
          </span>
          <span>
            <kbd>⌘ / Ctrl</kbd> + <kbd>Enter</kbd> to run · Inspector for
            details
          </span>
        </div>
      </section>
    </div>
  );
}

function FlightBrowserAgentLab({
  goal,
  onBusyChange,
  inspectorOpen,
  controlsHost,
}: {
  goal: string;
  onBusyChange: (busy: boolean) => void;
  inspectorOpen: boolean;
  controlsHost: HTMLDivElement | null;
}) {
  useUsage();
  const quotaBlocked = usageBlocked();
  const [model, setModel] = useState("jev-latest");
  const textMode: TextHelperMode = "jev-span";
  const [sandbox, setSandbox] = useState<SandboxOptions>(defaultSandbox);
  const [sandboxKey, setSandboxKey] = useState(0);
  const [state, setState] = useState<LoopState>(() =>
    createAgentState(FLIGHT_GOAL),
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const controller = useRef<AbortController | null>(null);
  const html = useMemo(() => flightSandboxHtml(sandbox), [sandbox]);
  useEffect(() => () => controller.current?.abort(), []);

  function frameContext() {
    const doc = frame.current?.contentDocument;
    const win = frame.current?.contentWindow;
    if (!doc?.body || !win) throw Error("The sandbox site has not loaded yet.");
    return { doc, win };
  }
  function reset(options = sandbox) {
    controller.current?.abort();
    setSandbox(options);
    setSandboxKey((k) => k + 1);
    setState(createAgentState(goal));
    setSelected(null);
    setError("");
  }
  const finished = !["ready", "running"].includes(state.status);
  async function run(steps: number) {
    setError("");
    setBusy(true);
    const c = new AbortController();
    controller.current = c;
    try {
      const { doc, win } = frameContext();
      const final = await runAgent(
        {
          doc,
          win,
          goal,
          model,
          textMode,
          verify: (d) => verifyFlightSearch(d),
          signal: c.signal,
          onUpdate: setState,
        },
        { ...state, goal },
        steps,
      );
      setState(final);
      setSelected(null);
    } catch (e) {
      setError(c.signal.aborted ? "Run stopped." : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function look() {
    try {
      const { doc, win } = frameContext();
      setState((s) =>
        observe(
          {
            doc,
            win,
            goal,
            model,
            textMode,
            verify: (d) => verifyFlightSearch(d),
            signal: new AbortController().signal,
          },
          s,
        ),
      );
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function verifyNow() {
    try {
      const { doc } = frameContext();
      setState((s) => ({ ...s, verification: verifyFlightSearch(doc) }));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const last = state.log.at(-1) ?? null;
  const shown: CycleLog | null =
    selected === null
      ? last
      : (state.log.find((e) => e.step === selected) ?? last);
  const table = state.page ? formatElementTable(state.page.elements) : [];
  const escalations = state.log.filter((e) => isEscalation(e.outcome)).length;
  const helperLabel = "Jev picks a span of the goal";
  return (
    <div className="agent-workspace" data-status={state.status}>
      <section className="agent-sandbox-panel" aria-label="Browser page">
        <iframe
          key={sandboxKey}
          ref={frame}
          className="agent-sandbox"
          title="Skyline, a synthetic flight search site"
          srcDoc={html}
        />
        <div className="browser-page-caption">
          <span className="tag">Synthetic sandbox</span>
          <span>
            {statusLabels[state.status]} · {state.actions} actions
          </span>
        </div>
      </section>
      <aside
        id="browser-inspector"
        className="browser-sidepanel"
        hidden={!inspectorOpen}
        aria-label="Browser inspector"
      >
        <div className="lab-columns agent-columns">
          <section className="panel lab-panel">
            <div className="panel-heading">
              <h2>Flight sandbox run</h2>
              <button
                className="button quiet"
                disabled={busy}
                onClick={() => reset()}
              >
                <RotateCcw size={14} /> Reset sandbox
              </button>
            </div>
            <details className="inspector-section">
              <summary>Run settings</summary>
              <fieldset className="lab-fields" disabled={busy}>
                <p className="field-hint">
                  The verifier checks a one-way Zurich → London search on
                  2026-09-20 for one adult in economy, with results visible and
                  nothing selected. This executor only runs the matching flight
                  preset.
                </p>
                <div className="row-fields">
                  <label>
                    Model
                    <input
                      aria-label="Model"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                    />
                  </label>
                </div>
                <p className="field-hint">Text for TYPE_TEXT: {helperLabel}.</p>
                <label className="lab-checkbox">
                  <input
                    type="checkbox"
                    checked={sandbox.overlay}
                    onChange={(e) =>
                      reset({ ...sandbox, overlay: e.target.checked })
                    }
                  />
                  A popover covers the Search button until dismissed
                  (covered-target path)
                </label>
                <label className="lab-checkbox">
                  <input
                    type="checkbox"
                    checked={sandbox.slowResults}
                    onChange={(e) =>
                      reset({ ...sandbox, slowResults: e.target.checked })
                    }
                  />
                  Results load slowly (WAIT path)
                </label>
              </fieldset>
            </details>
            <ErrorNote message={error} />
            <div className="lab-actions">
              {controlsHost &&
                createPortal(
                  <button
                    className="button primary"
                    disabled={busy || finished || quotaBlocked}
                    onClick={() => run(Infinity)}
                  >
                    <Play size={14} /> Run agent
                  </button>,
                  controlsHost,
                )}
              <button
                className="button"
                disabled={busy || finished || quotaBlocked}
                onClick={() => run(1)}
              >
                <SkipForward size={14} /> One cycle
              </button>
              {busy &&
                controlsHost &&
                createPortal(
                  <button
                    className="button"
                    onClick={() => controller.current?.abort()}
                  >
                    <Square size={13} /> Stop
                  </button>,
                  controlsHost,
                )}
              <button className="button" disabled={busy} onClick={look}>
                <Eye size={14} /> Observe only
              </button>
              <button className="button" disabled={busy} onClick={verifyNow}>
                <ShieldCheck size={14} /> Verify now
              </button>
            </div>
            <dl className="agent-status">
              <div>
                <dt>Status</dt>
                <dd>
                  <span className="tag" data-status={state.status}>
                    {statusLabels[state.status]}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Elapsed</dt>
                <dd>{(state.elapsedMs / 1000).toFixed(2)} s</dd>
              </div>
              <div>
                <dt>Decisions</dt>
                <dd>{state.decisions}</dd>
              </div>
              <div>
                <dt>Actions</dt>
                <dd>{state.actions}</dd>
              </div>
              <div>
                <dt>Escalations</dt>
                <dd>{escalations}</dd>
              </div>
              <div>
                <dt>Text calls</dt>
                <dd>{state.textCalls}</dd>
              </div>
            </dl>
            {state.reason && <p className="agent-reason">{state.reason}</p>}
            <div className="agent-verification" id="agent-verification">
              <div className="router-section-title">
                <h3>Independent verification</h3>
                <span className="tag">
                  {state.verification
                    ? state.verification.passed
                      ? "passed"
                      : "not passed"
                    : "not run"}
                </span>
              </div>
              {state.verification ? (
                <>
                  <p className="field-hint">{state.verification.summary}</p>
                  <Checks report={state.verification} />
                </>
              ) : (
                <p className="field-hint">
                  Runs when Jev chooses DONE, or on demand. It reads the sandbox
                  DOM, never the model.
                </p>
              )}
            </div>
          </section>
        </div>
        <div
          className="lab-columns agent-columns agent-inspector"
          id="agent-inspector"
        >
          <section className="panel lab-panel">
            <div className="panel-heading">
              <h2>What Jev sees</h2>
              <span className="tag">
                {table.length} {table.length === 1 ? "element" : "elements"}
              </span>
            </div>
            {table.length ? (
              <pre className="agent-table" aria-label="Indexed element table">
                {table.join("\n")}
              </pre>
            ) : (
              <Empty title="No observation yet">
                Run a cycle or choose Observe only to read the current element
                table.
              </Empty>
            )}
            {state.page && (
              <details>
                <summary>Visible page text sent with the table</summary>
                <pre className="agent-table">{state.page.text || "(none)"}</pre>
              </details>
            )}
          </section>
          <section className="panel lab-panel">
            <div className="panel-heading">
              <h2>
                {shown && shown !== last
                  ? `Cycle ${shown.step}`
                  : "Latest decision"}
              </h2>
              <Export
                data={
                  state.log.length ? exportRun(state, state.verification) : null
                }
                name="jev-browser-agent-run.json"
              />
            </div>
            {shown ? (
              <div className="agent-decision">
                <p>
                  <strong>{describeCycle(shown)}</strong>
                </p>
                <div className="step-badges">
                  <span className="tag">{outcomeLabels[shown.outcome]}</span>
                  {shown.confidence !== null && (
                    <span className="tag">
                      operation confidence {percent(shown.confidence)}
                    </span>
                  )}
                  {shown.targetConfidence !== null && (
                    <span className="tag">
                      target confidence {percent(shown.targetConfidence)}
                    </span>
                  )}
                  <span className="tag">Jev {shown.jevLatencyMs} ms</span>
                  {shown.textHelper && (
                    <span className="tag">
                      text · {shown.textHelper} · {shown.textLatencyMs} ms
                    </span>
                  )}
                  {shown.speculativeHeads.length > 0 && (
                    <span className="tag">
                      discarded heads: {shown.speculativeHeads.join(", ")}
                    </span>
                  )}
                </div>
                <h3>Operation</h3>
                <Bars
                  probabilities={shown.operationProbabilities}
                  chosen={shown.operation}
                />
                {Object.keys(shown.targetProbabilities).length > 0 && (
                  <>
                    <h3>Target for {shown.operation}</h3>
                    <Bars
                      probabilities={shown.targetProbabilities}
                      chosen={shown.target}
                    />
                  </>
                )}
                {shown.verification && <Checks report={shown.verification} />}
              </div>
            ) : (
              <Empty title="No decision yet">
                Each cycle sends the operation question and every compatible
                target head in one request.
              </Empty>
            )}
            <BrowserAgentDiagnostics
              state={state}
              busy={busy}
              context={{
                verifier: {
                  name: "verifyFlightSearch",
                  requirements: flightRequirements,
                },
                sandbox,
              }}
            />
            <section className="router-step-log">
              <div className="router-section-title">
                <h3>Cycle log</h3>
                <span className="tag">
                  {state.log.length}{" "}
                  {state.log.length === 1 ? "cycle" : "cycles"}
                </span>
              </div>
              <ol>
                {state.log.map((e) => (
                  <li key={e.step} data-outcome={e.outcome}>
                    <div className="step-number">{e.step}</div>
                    <div>
                      <button
                        className="link-button"
                        type="button"
                        onClick={() => setSelected(e.step)}
                        aria-pressed={shown?.step === e.step}
                      >
                        {describeCycle(e)}
                      </button>
                      <div className="step-badges">
                        <span className="tag">{e.elapsedMs} ms</span>
                        {e.confidence !== null && (
                          <span className="tag">{percent(e.confidence)}</span>
                        )}
                        {e.pageChanged !== null && (
                          <span className="tag">
                            {e.pageChanged ? "page changed" : "no change"}
                          </span>
                        )}
                      </div>
                      <details>
                        <summary>Element table at this cycle</summary>
                        <pre className="agent-table">
                          {e.elementTable.join("\n")}
                        </pre>
                      </details>
                    </div>
                  </li>
                ))}
              </ol>
              {!state.log.length && (
                <p className="field-hint">Your first cycle will appear here.</p>
              )}
            </section>
          </section>
        </div>
      </aside>
    </div>
  );
}
