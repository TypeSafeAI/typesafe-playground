"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Play,
  Square,
  GitBranch,
} from "lucide-react";
import { API_KEY_EVENT, apiKeyRevision } from "../lib/api-key";
import { runJev, percent } from "../lib/client";
import { useUsage, usageBlocked } from "../lib/logUsageEntry";
import {
  ACTION_LABELS,
  TROLLEY_ACTIONS,
  TROLLEY_CASES,
  type TrolleyAction,
  type TrolleyDecision,
} from "../lib/trolley";
import { runTrolleyCases } from "../lib/trolley-runner";
import { Heading, Export } from "./ui";
import { TrolleyScene } from "./TrolleyScene";

export function TrolleyLab() {
  useUsage();
  const [selected, setSelected] = useState(0);
  const [decision, setDecision] = useState<TrolleyDecision | null>(null);
  const [history, setHistory] = useState<TrolleyDecision[]>([]);
  const [busy, setBusy] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const [sceneVersion, setSceneVersion] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [runSize, setRunSize] = useState(0);
  const [notice, setNotice] = useState(
    "Ready when you are. Choose yourself, or hand the lever to Jev.",
  );
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const scenario = TROLLEY_CASES[selected];
  const blocked = usageBlocked();

  const stop = useCallback((message: string) => {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setMotionPaused(true);
    setNotice(message);
  }, []);

  useEffect(() => {
    let revision = apiKeyRevision();
    const visibility = () => {
      if (document.hidden)
        stop(
          "Paused while this page is hidden. Start explicitly to make another Jev request.",
        );
    };
    const keyChanged = () => {
      const next = apiKeyRevision();
      if (next === revision) return;
      revision = next;
      stop(
        "API key changed. Pending decisions were discarded; start again when ready.",
      );
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener(API_KEY_EVENT, keyChanged);
    window.addEventListener("storage", keyChanged);
    return () => {
      generation.current++;
      controller.current?.abort();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener(API_KEY_EVENT, keyChanged);
      window.removeEventListener("storage", keyChanged);
    };
  }, [stop]);

  function chooseCase(index: number) {
    if (index < 0 || index >= TROLLEY_CASES.length) return;
    stop("Scenario ready. Choose yourself, or ask Jev.");
    setSelected(index);
    setDecision(null);
    setError("");
    setCompleted(0);
    setRunSize(0);
  }

  function record(result: TrolleyDecision) {
    setSceneVersion((previous) => previous + 1);
    setMotionPaused(false);
    setDecision(result);
    setHistory((previous) => [...previous, result].slice(-48));
  }

  function humanChoice(action: TrolleyAction) {
    if (controller.current) return;
    setError("");
    setRunSize(0);
    record({
      scenarioId: scenario.id,
      source: "human",
      action,
      probabilities: null,
      confidence: null,
      latencyMs: null,
    });
    setNotice(
      `Your choice: ${ACTION_LABELS[action].toLowerCase()}. No model request was made.`,
    );
  }

  async function play(all: boolean) {
    if (controller.current || document.hidden || usageBlocked()) return;
    const active = new AbortController();
    controller.current = active;
    const gen = ++generation.current;
    const revision = apiKeyRevision();
    const ids = all ? TROLLEY_CASES.map((item) => item.id) : [scenario.id];
    const isCurrent = () =>
      generation.current === gen &&
      apiKeyRevision() === revision &&
      !active.signal.aborted &&
      !document.hidden;
    setBusy(true);
    setError("");
    setCompleted(0);
    setRunSize(ids.length);
    try {
      await runTrolleyCases({
        ids,
        signal: active.signal,
        transport: runJev,
        assertCurrent: () => {
          if (!isCurrent())
            throw Error("This trolley run is no longer current.");
          if (usageBlocked()) throw Error("Live Jev is paused in Usage.");
        },
        onCase: (id) => {
          const index = TROLLEY_CASES.findIndex((item) => item.id === id);
          setSelected(index);
          setDecision(null);
          setNotice(`Asking Jev: ${TROLLEY_CASES[index].title}…`);
        },
        onDecision: (result) => {
          record(result);
          setCompleted((previous) => previous + 1);
          setNotice(
            `Jev chose: ${ACTION_LABELS[result.action].toLowerCase()}. ${TROLLEY_CASES.find((item) => item.id === result.scenarioId)!.outcomes[result.action]}`,
          );
        },
      });
      if (isCurrent())
        setNotice(
          `${all ? "All twelve scenarios complete" : "Jev decision complete"}. These are judgments, not right or wrong answers.`,
        );
    } catch {
      if (isCurrent()) {
        // Do not echo arbitrary provider messages or credentials into the UI/export.
        setError(
          "Jev could not complete this decision. No replacement action was applied. Check your key and Usage, then try again.",
        );
        setNotice("Run stopped. Completed decisions are retained.");
      }
    } finally {
      if (generation.current === gen) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <div className="workspace trolley-lab">
      <Heading
        eyebrow="The decision lab"
        title="Jev takes the lever"
        description="Twelve dilemmas. Two tracks. Your judgment, or Jev’s."
      >
        <Export
          name="trolley-decisions.json"
          data={{
            version: 1,
            boundary:
              "Subjective hypothetical judgments; no universal answer key. Latest 48 decisions only.",
            decisions: history,
          }}
        />
      </Heading>
      <div className="trolley-layout">
        <section className="trolley-stage" aria-labelledby="trolley-case-title">
          <div className="trolley-case-nav">
            <span className="trolley-case-count">
              {String(selected + 1).padStart(2, "0")} <span>/ 12</span>
            </span>
            <label className="sr-only" htmlFor="trolley-case">
              Trolley scenario
            </label>
            <select
              id="trolley-case"
              value={selected}
              onChange={(event) => chooseCase(Number(event.target.value))}
            >
              {TROLLEY_CASES.map((item, index) => (
                <option value={index} key={item.id}>
                  {String(index + 1).padStart(2, "0")} · {item.title}
                </option>
              ))}
            </select>
            <div className="trolley-case-arrows">
              <button
                className="button icon-button"
                aria-label="Previous scenario"
                disabled={selected === 0}
                onClick={() => chooseCase(selected - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                className="button icon-button"
                aria-label="Next scenario"
                disabled={selected === 11}
                onClick={() => chooseCase(selected + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="trolley-case-heading">
            <span className="trolley-kicker">{scenario.theme}</span>
            <h2 id="trolley-case-title">{scenario.title}</h2>
          </div>
          <TrolleyScene
            key={`${scenario.id}-${sceneVersion}`}
            scenario={scenario}
            decision={decision}
            paused={motionPaused}
          />
          <div className="trolley-situation">
            <p>{scenario.prompt}</p>
            <details>
              <summary>
                Assumptions{" "}
                {scenario.uncertain
                  ? "· outcome uncertain"
                  : scenario.loop
                    ? "· stipulated loop physics"
                    : "& limits"}
              </summary>
              <p>{scenario.assumption}</p>
            </details>
          </div>
          <div
            className="trolley-human-controls"
            role="group"
            aria-label="Make your own choice"
          >
            <span>
              You decide <small>No API call</small>
            </span>
            <button
              className="button"
              disabled={busy}
              onClick={() => humanChoice("pull")}
            >
              <GitBranch size={16} />
              Pull the lever
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => humanChoice("stay")}
            >
              <ArrowRight size={16} />
              Do nothing
            </button>
          </div>
          <div
            className={`trolley-consequence${decision ? " has-decision" : ""}`}
            aria-label="Hypothetical outcome"
          >
            <span className="trolley-kicker">
              {decision
                ? `${decision.source === "jev" ? "Jev" : "Human"} choice · ${ACTION_LABELS[decision.action]}`
                : "The lever is yours"}
            </span>
            <p>
              {decision
                ? scenario.outcomes[decision.action]
                : "Choose an action to see the route and its stated consequences."}
            </p>
          </div>
        </section>
        <aside className="trolley-console" aria-label="Jev decision console">
          <div className="trolley-console-heading">
            <span className="trolley-live-label">
              <i aria-hidden="true" />
              Live Jev
            </span>
            <span className="trolley-kicker">jev-latest</span>
          </div>
          <div className="trolley-console-intro">
            <h2>Hand over the lever.</h2>
            <p>
              Jev reads the scenario and chooses an action. Code animates its
              choice.
            </p>
          </div>
          <div className="trolley-jev-controls">
            <button
              className="button primary"
              onClick={() => void play(false)}
              disabled={busy || blocked}
            >
              <Play size={15} />
              Let Jev decide
            </button>
            <div>
              <button
                className="button"
                onClick={() => void play(true)}
                disabled={busy || blocked}
              >
                Run all 12
              </button>
              <button
                className="button"
                onClick={() =>
                  stop(
                    "Paused. Completed decisions are retained; no further requests will start.",
                  )
                }
                disabled={!busy}
              >
                <Square size={13} />
                Pause
              </button>
            </div>
            <p className="trolley-call-note">
              One call per case · Run all starts at 01
            </p>
          </div>
          {blocked && (
            <p className="trolley-error">
              Live calls are paused. Open Usage in the header.
            </p>
          )}
          {error && (
            <p role="alert" className="trolley-error">
              {error}
            </p>
          )}
          <div
            className="trolley-distribution"
            aria-label="Jev choice probabilities"
          >
            <div className="trolley-mini-heading">
              <h3>Choice probabilities</h3>
              <span>
                {decision?.source === "jev"
                  ? `${decision.latencyMs} ms`
                  : "Awaiting Jev"}
              </span>
            </div>
            {TROLLEY_ACTIONS.map((action) => (
              <div className="trolley-probability" key={action}>
                <div>
                  <span>{ACTION_LABELS[action]}</span>
                  <strong>
                    {decision?.probabilities
                      ? percent(decision.probabilities[action])
                      : "—"}
                  </strong>
                </div>
                <div className="trolley-probability-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${(decision?.probabilities?.[action] ?? 0) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            <p className="trolley-call-note">
              Probability is not ethical correctness.
            </p>
          </div>
          <div className="trolley-session-heading">
            <h3>Decision log</h3>
            <button
              className="button icon-button"
              aria-label="Reset trolley session"
              onClick={() => {
                chooseCase(0);
                setHistory([]);
              }}
            >
              <RotateCcw size={14} />
            </button>
          </div>
          <div
            className="trolley-history"
            role="region"
            aria-label="Recent trolley decisions"
            tabIndex={0}
          >
            {history.length ? (
              <ol>
                {[...history].reverse().map((item, index) => (
                  <li key={history.length - index}>
                    <span>
                      <strong>
                        {
                          TROLLEY_CASES.find(
                            (entry) => entry.id === item.scenarioId,
                          )!.title
                        }
                      </strong>
                      <small>
                        {item.source === "jev" ? "Jev" : "Human"} ·{" "}
                        {ACTION_LABELS[item.action]}
                      </small>
                    </span>
                    <span aria-hidden="true">
                      {item.action === "pull" ? "↗" : "→"}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p>
                Your choices will appear here.
                <br />
                Nothing runs automatically.
              </p>
            )}
          </div>
          <p className="trolley-console-boundary">
            Thought experiments, not an ethics test. No universal answer key.
          </p>
        </aside>
      </div>
      <div className="trolley-status" role="status" aria-live="polite">
        <span>{notice}</span>
        {runSize > 0 && (
          <strong>
            {completed} / {runSize} decisions
          </strong>
        )}
      </div>
    </div>
  );
}
