"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { API_KEY_EVENT, apiKeyRevision } from "../lib/api-key";
import { percent, runJev } from "../lib/client";
import {
  IQ_QUESTIONS,
  IQ_TEST_VERSION,
  summarizeIq,
  unscoredIqResult,
  type IqMode,
  type IqOption,
  type IqResult,
} from "../lib/iq-test";
import { runIqTest } from "../lib/iq-test-runner";
import { ErrorNote, Export, Heading, RunButton } from "./ui";
import { IqTestReport } from "./IqTestReport";

const MODE_LABELS = { demo: "Local demo", live: "Live Jev" };
const STATUS_LABELS = {
  correct: "Correct",
  incorrect: "Incorrect",
  failed: "Failed",
  invalid: "Invalid",
  cancelled: "Cancelled",
};
const DRAFT_KEY = "typesafe-iq-test-mode-v1";
type Phase = "Ready" | "Running" | "Complete" | "Incomplete" | "Stopped";

export function IqTestLab() {
  const [mode, setMode] = useState<IqMode>("demo");
  const [phase, setPhase] = useState<Phase>("Ready");
  const [results, setResults] = useState<IqResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [following, setFollowing] = useState(true);
  const followingRef = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const activeRef = useRef<number | null>(null);
  const detail = useRef<HTMLElement | null>(null);
  const finalReport = useRef<HTMLElement | null>(null);
  const keyRevision = useRef("");
  const busy = phase === "Running";

  function follow(value: boolean) {
    followingRef.current = value;
    setFollowing(value);
  }

  useEffect(() => {
    if (!following) return;
    if (phase === "Running") detail.current?.scrollIntoView({ block: "start" });
    if (phase === "Complete") {
      finalReport.current?.focus({ preventScroll: true });
      finalReport.current?.scrollIntoView({ block: "start" });
    }
  }, [phase, selected, following]);

  const stop = useCallback(
    (message = "Stopped. Start a new run to try the full test again.") => {
      if (!controller.current || controller.current.signal.aborted) return;
      controller.current.abort();
      if (activeRef.current !== null) {
        const id = IQ_QUESTIONS[activeRef.current].id;
        setResults((previous) =>
          previous.some((result) => result.id === id)
            ? previous
            : [
                ...previous,
                unscoredIqResult(
                  id,
                  "cancelled",
                  "Request cancelled; no answer was scored.",
                ),
              ],
        );
      }
      activeRef.current = null;
      setActive(null);
      setPhase("Stopped");
      setNotice(message);
    },
    [],
  );

  const reset = useCallback(() => {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    activeRef.current = null;
    setActive(null);
    setResults([]);
    setPhase("Ready");
    setNotice("");
    setStartedAt(null);
    setSelected(0);
    followingRef.current = true;
    setFollowing(true);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved === "live" || saved === "demo") setMode(saved);
    } catch {
      /* Private browsing can disable storage; the test still works. */
    }
    keyRevision.current = apiKeyRevision();
    const onKey = () => {
      keyRevision.current = apiKeyRevision();
      stop("API key changed. Start a new run with the selected key.");
    };
    const onStorage = () => {
      if (keyRevision.current !== apiKeyRevision()) onKey();
    };
    const onVisibility = () => {
      if (document.hidden)
        stop(
          "Stopped because this tab was hidden. Start a new run when ready.",
        );
    };
    window.addEventListener(API_KEY_EVENT, onKey);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      generation.current++;
      controller.current?.abort();
      window.removeEventListener(API_KEY_EVENT, onKey);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [stop]);

  async function run() {
    if (controller.current && !controller.current.signal.aborted) return;
    const gen = ++generation.current;
    const ac = new AbortController();
    controller.current = ac;
    setResults([]);
    setNotice("");
    setPhase("Running");
    follow(true);
    setSelected(0);
    setStartedAt(new Date().toISOString());
    const collected = await runIqTest({
      mode,
      signal: ac.signal,
      transport: runJev,
      onQuestion: (index) => {
        if (generation.current !== gen || ac.signal.aborted) return;
        activeRef.current = index;
        setActive(index);
        if (followingRef.current) setSelected(index);
      },
      onResult: (result) => {
        if (generation.current !== gen || ac.signal.aborted) return;
        activeRef.current = null;
        setActive(null);
        setResults((previous) => [...previous, result]);
      },
    });
    if (generation.current !== gen || ac.signal.aborted) return;
    controller.current = null;
    setPhase(summarizeIq(collected).complete ? "Complete" : "Incomplete");
  }

  const summary = summarizeIq(results);
  const question = IQ_QUESTIONS[selected];
  const result = results.find((item) => item.id === question.id);
  const watchIndex = active ?? Math.max(0, results.length - 1);
  const watchQuestion = IQ_QUESTIONS[watchIndex];
  const watchResult = results.find((item) => item.id === watchQuestion.id);
  const error =
    results.find(
      (item) => item.status === "failed" || item.status === "invalid",
    )?.error ?? "";
  const report = startedAt
    ? {
        version: IQ_TEST_VERSION,
        execution: mode === "live" ? "live" : "local-demo",
        requestedModel: mode === "live" ? "jev-latest" : null,
        startedAt,
        status: phase.toLowerCase(),
        summary,
        results,
        questions: IQ_QUESTIONS,
        note: "Original educational reasoning puzzles. Estimated IQ is an uncalibrated heuristic using assumed reference values, not a standardized IQ score. Confidence is not correctness.",
      }
    : null;

  return (
    <div className={`workspace iq-lab${busy ? " is-running" : ""}`}>
      <Heading
        eyebrow="REASONING / 12 QUESTIONS"
        title="Jev takes an IQ-style test"
        description="Number sequences, logical deductions, and symbol patterns. Give Jev the questions, then check every choice against the answer key."
      >
        <Export data={report} name="jev-iq-test.json" />
      </Heading>

      <section className="panel iq-controls" aria-label="Test controls">
        <div className="iq-toolbar">
          <label>
            Run mode
            <select
              value={mode}
              disabled={busy}
              onChange={(event) => {
                const value = event.target.value as IqMode;
                reset();
                setMode(value);
                try {
                  localStorage.setItem(DRAFT_KEY, value);
                } catch {
                  /* Optional preference. */
                }
              }}
            >
              <option value="demo">Local demo</option>
              <option value="live">Live Jev</option>
            </select>
          </label>
          <RunButton busy={busy} onClick={run} usesJev={mode === "live"}>
            Run test
          </RunButton>
          <button className="button quiet" onClick={reset}>
            <RotateCcw size={14} /> Reset
          </button>
          <span
            className="iq-run-label"
            data-testid="iq-run-status"
            role="status"
          >
            {phase} · {MODE_LABELS[mode]}
          </span>
        </div>
        <p className="muted">
          {mode === "demo"
            ? "The local demo always picks A. It shows how scoring works and makes no model calls."
            : "Uses jev-latest and your configured API key. Up to 12 requests, one question at a time. Answers and explanations are withheld from Jev."}
        </p>
        <p className="iq-boundary">
          Not a standardized IQ score. The numerical estimate uses assumed
          reference values; these original practice puzzles have no human
          population norms. Patterns are sent as text, not images.
        </p>
      </section>

      <div className="iq-summary" aria-label="Test results">
        <div data-testid="iq-score">
          <span className="iq-caption">
            {summary.complete ? "Raw score" : "Raw score pending"}
          </span>
          <strong>
            {summary.complete
              ? `${summary.correct} / ${summary.total}`
              : "No final score"}
          </strong>
          <span>
            {summary.complete
              ? `${summary.percentage!.toFixed(0)}% correct on this set`
              : `${summary.correct} correct so far · ${summary.answered} of ${summary.total} answered`}
          </span>
        </div>
        {summary.categories.map((category) => {
          return (
            <div key={category.category}>
              <span className="iq-caption">{category.category}</span>
              <strong>
                {category.correct} / {category.total}
              </strong>
              <span>{category.answered} answered</span>
            </div>
          );
        })}
      </div>
      <div className="iq-progress">
        <progress
          max={12}
          value={summary.answered}
          aria-label="Questions answered"
        />
        <p className="muted">
          Uniform random guessing would average 3 / 12 across repeated full
          tests. This is an expected value, not a measured run.
        </p>
      </div>
      {notice && (
        <p role="status" className="callout">
          {notice}
        </p>
      )}
      <ErrorNote message={error} />

      {phase === "Complete" && summary.complete && (
        <IqTestReport summary={summary} mode={mode} reportRef={finalReport} />
      )}

      {busy && (
        <div className="iq-player" aria-label="Watch the test">
          <div
            data-testid="iq-watch-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <strong>
              Question {watchIndex + 1} of 12 · {watchQuestion.title}
            </strong>
            <span>
              {watchResult?.choice
                ? `${STATUS_LABELS[watchResult.status]} · ${watchResult.choice.toUpperCase()} · ${watchQuestion.options[watchResult.choice]} — ${watchIndex === 11 ? "Results next" : "Next question in 2 seconds"}`
                : `${MODE_LABELS[mode]} is choosing…`}
            </span>
          </div>
          <div className="iq-player-controls">
            <label>
              <input
                type="checkbox"
                checked={following}
                onChange={(event) => {
                  follow(event.target.checked);
                  if (event.target.checked) setSelected(watchIndex);
                }}
              />{" "}
              Follow current question
            </label>
            <button className="button" onClick={() => stop()}>
              Stop
            </button>
          </div>
        </div>
      )}

      <div className="iq-body">
        <section className="panel iq-answer-sheet" aria-label="Answer sheet">
          <div className="panel-heading">
            <h2>Answer sheet</h2>
            <span className="muted">Select a question</span>
          </div>
          <ol>
            {IQ_QUESTIONS.map((item, index) => {
              const scored = results.find((r) => r.id === item.id);
              const status =
                active === index
                  ? "Thinking…"
                  : scored
                    ? STATUS_LABELS[scored.status]
                    : "Not run";
              return (
                <li key={item.id}>
                  <button
                    aria-label={`Question ${index + 1}: ${item.title}, ${status}`}
                    aria-pressed={selected === index}
                    onClick={() => {
                      follow(false);
                      setSelected(index);
                      if (window.innerWidth < 760)
                        detail.current?.scrollIntoView({ block: "start" });
                    }}
                  >
                    <span className="iq-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="iq-question-label">
                      <strong>{item.title}</strong>
                      <small>{item.category}</small>
                    </span>
                    <span className={`iq-status ${scored?.status ?? ""}`}>
                      {status}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <section
          ref={detail}
          className="panel iq-question"
          aria-label="Selected question"
        >
          <div className="panel-heading">
            <h2>{question.title}</h2>
            <span className="muted">{selected + 1} / 12</span>
          </div>
          <div className="panel-content" key={question.id}>
            <p className="iq-prompt">{question.prompt}</p>
            <p className="iq-assumption">
              <strong>Assumption</strong> {question.assumption}
            </p>
            <ol className="iq-options" aria-label="Answer options">
              {(Object.entries(question.options) as [IqOption, string][]).map(
                ([id, label]) => (
                  <li
                    key={id}
                    className={result?.choice === id ? "is-selected" : ""}
                  >
                    <span className="iq-option-letter">{id.toUpperCase()}</span>
                    <span>{label}</span>
                    {result?.probabilities && (
                      <span
                        className="iq-probability"
                        aria-label={`Probability ${percent(result.probabilities[id])}`}
                      >
                        {percent(result.probabilities[id])}
                      </span>
                    )}
                  </li>
                ),
              )}
            </ol>
            <div className="iq-verdict">
              <strong>
                {result?.choice
                  ? `Selected: ${result.choice.toUpperCase()} · ${question.options[result.choice]}`
                  : active === selected
                    ? "Waiting for Jev…"
                    : "No scored answer yet"}
              </strong>
              {result && (
                <p>
                  {STATUS_LABELS[result.status]} · {MODE_LABELS[mode]}
                  {result.confidence !== null
                    ? ` · Reported confidence ${percent(result.confidence)}`
                    : ""}
                  {result.latencyMs !== null && result.latencyMs !== undefined
                    ? ` · ${result.latencyMs} ms`
                    : ""}
                </p>
              )}
              <p className="muted">
                Confidence describes the model’s response. The checked answer
                determines correctness.
              </p>
            </div>
            <details>
              <summary>Checked answer and explanation</summary>
              <p>
                <strong>
                  {question.expected.toUpperCase()} ·{" "}
                  {question.options[question.expected]}
                </strong>
              </p>
              <p>{question.explanation}</p>
            </details>
          </div>
        </section>
      </div>
    </div>
  );
}
