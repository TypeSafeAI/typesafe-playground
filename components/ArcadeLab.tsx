"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dices,
  Gamepad2,
  Info,
  Keyboard,
  Pause,
  Play,
  RotateCcw,
  StepForward,
  Trophy,
} from "lucide-react";
import { errorMessage, percent, runJev } from "../lib/client";
import { useUsage, usageBlocked } from "../lib/logUsageEntry";
import {
  ARCADE_GAMES,
  playOut,
  randomBaseline,
  randomPolicy,
} from "../lib/arcade";
import {
  buildArcadePayload,
  forcedAction,
  resolveArcadeDecision,
  type DecisionSource,
} from "../lib/arcade/jev";
import type { ArcadeGameId } from "../lib/arcade/types";
import { ArcadeBoard } from "./ArcadeBoard";
import { Empty, ErrorNote, Export, Heading } from "./ui";

export type ArcadeMode = "jev" | "scripted" | "random" | "human";
type RecordSource = DecisionSource | "scripted" | "random" | "human";

interface DecisionRecord {
  tick: number;
  action: string;
  source: RecordSource;
  confidence: number | null;
  probabilities: Record<string, number>;
  outcomes: Record<string, Record<string, unknown>>;
  latencyMs: number | null;
  scoreAfter: number;
  error?: string;
}

const MODE_LABELS: Record<ArcadeMode, string> = {
  jev: "Live Jev",
  scripted: "Scripted demo",
  random: "Random baseline",
  human: "You play",
};
const MODE_BLURBS: Record<ArcadeMode, string> = {
  jev: "Each move is one Jev request over the legal moves. Uses the configured API key.",
  scripted:
    "A short hand-written rule plays locally. Not Jev, and no model call.",
  random:
    "Picks a random legal move that avoids an instant crash. No model call.",
  human: "Use the arrow keys or WASD while the board has focus. No model call.",
};
const SOURCE_LABELS: Record<RecordSource, string> = {
  jev: "Jev choice",
  fallback: "Fallback: invalid answer",
  forced: "Forced: one safe move",
  scripted: "Scripted rule",
  random: "Random",
  human: "You",
};
/**
 * The playground server allows 60 requests per rolling minute per key, so a
 * live run starts at most one request a second and never trips that limit.
 */
const LIVE_SPACING_MS = 1050;
const SPEEDS = { slow: 320, normal: 140, fast: 50 } as const;
const HUMAN_TICK_MS: Record<ArcadeGameId, number> = {
  snake: 190,
  breakout: 110,
  "meteor-dodge": 320,
};
const KEYS: Record<string, "up" | "down" | "left" | "right"> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

export function ArcadeLab({
  gameId,
  title,
  description,
}: {
  gameId: ArcadeGameId;
  title: string;
  description: string;
}) {
  useUsage();
  const game = ARCADE_GAMES[gameId];
  const [mode, setMode] = useState<ArcadeMode>("scripted");
  const [seed, setSeed] = useState(1);
  const [speed, setSpeed] = useState<keyof typeof SPEEDS>("normal");
  const [model, setModel] = useState("jev-latest");
  const [state, setState] = useState<unknown>(() => game.create(1));
  const [history, setHistory] = useState<DecisionRecord[]>([]);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const runningRef = useRef(false);
  /** Bumped by every reset, so a late answer for an old game is discarded. */
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const lastRequest = useRef(0);
  const random = useRef(randomPolicy(game, 1));
  const humanKey = useRef<string | null>(null);
  const board = useRef<HTMLDivElement>(null);

  const over = game.over(state);
  const score = game.score(state);
  const baseline = useMemo(() => randomBaseline(game, seed), [game, seed]);
  const scripted = useMemo(() => playOut(game, seed, "scripted"), [game, seed]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    controller.current?.abort();
  }, []);

  const reset = useCallback(
    (nextSeed = seed) => {
      stop();
      generation.current++;
      random.current = randomPolicy(game, nextSeed);
      humanKey.current = null;
      const fresh = game.create(nextSeed);
      stateRef.current = fresh;
      setState(fresh);
      setHistory([]);
      setSelected(null);
      setError("");
      setNotice("");
      setBusy(false);
    },
    [game, seed, stop],
  );

  useEffect(() => () => controller.current?.abort(), []);

  // A hidden tab pauses the run, so nothing keeps spending requests unseen.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && runningRef.current) {
        stop();
        setNotice("Paused because the tab was hidden. Press Play to resume.");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [stop]);

  /** Chooses and applies one move. Returns false when the run should stop. */
  const advance = useCallback(async (): Promise<boolean> => {
    const current = stateRef.current;
    if (game.over(current)) return false;
    const gen = generation.current;
    const tick = game.tick(current);
    const outcomes = Object.fromEntries(
      Object.entries(game.outcomes(current)).map(([a, o]) => [
        a,
        { crash: o.crash, ...o.facts },
      ]),
    );
    let record: Omit<DecisionRecord, "scoreAfter">;
    if (mode === "jev") {
      const forced = forcedAction(game, current);
      if (forced !== null) {
        record = {
          tick,
          action: forced,
          source: "forced",
          confidence: null,
          probabilities: {},
          outcomes,
          latencyMs: null,
        };
      } else {
        if (usageBlocked()) {
          setError("Live Jev calls are paused. Open Usage in the header.");
          return false;
        }
        const ac = new AbortController();
        controller.current = ac;
        const wait = lastRequest.current + LIVE_SPACING_MS - Date.now();
        try {
          if (wait > 0) await sleep(wait, ac.signal);
        } catch {
          return false;
        }
        lastRequest.current = Date.now();
        const started = performance.now();
        let response: unknown;
        try {
          response = await runJev(
            buildArcadePayload(game, current, model.trim() || "jev-latest"),
            ac.signal,
          );
        } catch (e) {
          if (ac.signal.aborted) return false;
          setError(errorMessage(e));
          return false;
        }
        // Freshness: drop the answer if the game was reset or moved on.
        if (gen !== generation.current || stateRef.current !== current)
          return false;
        const decision = resolveArcadeDecision(game, current, response);
        record = {
          tick,
          action: decision.action,
          source: decision.source,
          confidence: decision.confidence,
          probabilities: decision.probabilities,
          outcomes,
          latencyMs: performance.now() - started,
          error: decision.error,
        };
      }
    } else if (mode === "human") {
      const legal = game.legal(current);
      const pressed = humanKey.current;
      humanKey.current = null;
      const fallback =
        gameId === "snake" ? (current as { heading: string }).heading : "stay";
      const action =
        pressed && legal.includes(pressed)
          ? pressed
          : legal.includes(fallback)
            ? fallback
            : legal[0];
      record = {
        tick,
        action,
        source: "human",
        confidence: null,
        probabilities: {},
        outcomes,
        latencyMs: null,
      };
    } else {
      record = {
        tick,
        action:
          mode === "scripted"
            ? game.scripted(current)
            : random.current(current),
        source: mode,
        confidence: null,
        probabilities: {},
        outcomes,
        latencyMs: null,
      };
    }
    const next = game.step(current, record.action);
    stateRef.current = next;
    setState(next);
    setHistory((list) => [
      ...list,
      { ...record, scoreAfter: game.score(next) },
    ]);
    return !game.over(next);
  }, [game, gameId, mode, model]);

  const play = useCallback(async () => {
    if (runningRef.current || game.over(stateRef.current)) return;
    runningRef.current = true;
    setRunning(true);
    setError("");
    setNotice("");
    if (mode === "human") board.current?.focus();
    try {
      while (runningRef.current) {
        setBusy(mode === "jev");
        const more = await advance();
        setBusy(false);
        if (!more) break;
        if (mode === "scripted" || mode === "random")
          await sleep(SPEEDS[speed]);
        else if (mode === "human") await sleep(HUMAN_TICK_MS[gameId]);
      }
    } finally {
      runningRef.current = false;
      setRunning(false);
      setBusy(false);
    }
  }, [advance, gameId, mode, speed, game]);

  const stepOnce = useCallback(async () => {
    if (runningRef.current || busy || game.over(stateRef.current)) return;
    setError("");
    setBusy(mode === "jev");
    try {
      await advance();
    } finally {
      setBusy(false);
    }
  }, [advance, busy, game, mode]);

  function onKey(event: React.KeyboardEvent) {
    if (mode !== "human") return;
    const key = KEYS[event.key] ?? KEYS[event.key.toLowerCase()];
    if (!key) return;
    event.preventDefault();
    if (game.legal(stateRef.current).includes(key)) humanKey.current = key;
  }

  const jevRecords = history.filter((r) => r.source === "jev");
  const fallbacks = history.filter((r) => r.source === "fallback").length;
  const forced = history.filter((r) => r.source === "forced").length;
  const mean = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const meanConfidence = mean(
    jevRecords.map((r) => r.confidence).filter((c): c is number => c !== null),
  );
  const meanLatency = mean(
    jevRecords.map((r) => r.latencyMs).filter((l): l is number => l !== null),
  );
  const shown =
    history.find((r) => r.tick === selected) ?? history[history.length - 1];
  const quotaBlocked = mode === "jev" && usageBlocked();
  const verdict =
    score > baseline.sameSeed
      ? "beat"
      : score === baseline.sameSeed
        ? "tied"
        : "trailed";

  return (
    <div className="workspace compact-lab arcade-lab" data-game={gameId}>
      <Heading eyebrow="Arcade" title={title} description={description}>
        <Export
          data={
            history.length
              ? {
                  game: gameId,
                  seed,
                  mode,
                  model: mode === "jev" ? model : null,
                  score,
                  endReason: game.endReason(state),
                  baseline,
                  decisions: history,
                }
              : null
          }
          name={`arcade-${gameId}-seed-${seed}.json`}
        />
      </Heading>
      <div className="callout arcade-callout">
        <Info size={16} />
        <div>
          <strong>Code computes the consequences. Jev picks the move.</strong>
          <p>
            Before every move, the game works out what each legal action would
            do: crash or not, distance to the goal, and a short look-ahead where
            noted. Jev reads those facts and chooses one action from the offered
            set. It is a reactive choice, not a planner, and a malformed answer
            plays a safe fallback that is counted separately. Scores are
            compared with a random baseline on the same seed, which sees the
            identical world.
          </p>
        </div>
      </div>
      <div className="split arcade-split">
        <section className="panel arcade-board-panel">
          <div className="panel-heading">
            <div>
              <Gamepad2 size={15} />
              <h2>{MODE_LABELS[mode]}</h2>
            </div>
            <span className="muted" aria-live="polite">
              {over
                ? (game.endReason(state) ?? "Game over")
                : running
                  ? `Playing · move ${game.tick(state)} of ${game.maxDecisions}`
                  : `Ready · move ${game.tick(state)} of ${game.maxDecisions}`}
            </span>
          </div>
          <div
            className="arcade-controls"
            role="group"
            aria-label="Game controls"
          >
            {running ? (
              <button type="button" className="button primary" onClick={stop}>
                <Pause size={15} /> Pause
              </button>
            ) : (
              <button
                type="button"
                className="button primary"
                onClick={play}
                disabled={over || quotaBlocked}
                title={
                  quotaBlocked
                    ? "Live API calls paused. Open Usage in the header."
                    : undefined
                }
              >
                <Play size={15} /> {history.length && !over ? "Resume" : "Play"}
              </button>
            )}
            <button
              type="button"
              className="button"
              onClick={stepOnce}
              disabled={
                running || busy || over || quotaBlocked || mode === "human"
              }
            >
              <StepForward size={14} /> One move
            </button>
            <button
              type="button"
              className="button quiet"
              onClick={() => reset()}
            >
              <RotateCcw size={14} /> Restart
            </button>
          </div>
          <div className="panel-content">
            <div
              ref={board}
              className="arcade-stage"
              tabIndex={0}
              onKeyDown={onKey}
              aria-label={
                mode === "human"
                  ? "Game board. Use the arrow keys or W, A, S and D to move."
                  : "Game board"
              }
            >
              <ArcadeBoard game={gameId} state={state} />
              {over && (
                <div className="arcade-over" role="status">
                  <Trophy size={18} aria-hidden="true" />
                  <strong>
                    {game.scoreLabel}: {score}
                  </strong>
                  <span>{game.endReason(state)}</span>
                </div>
              )}
            </div>
            {mode === "human" && (
              <p className="muted arcade-hint">
                <Keyboard size={13} aria-hidden="true" /> Click the board, then
                use the arrow keys or WASD.
              </p>
            )}
          </div>
          {notice && (
            <p className="arcade-notice" role="status">
              {notice}
            </p>
          )}
          <ErrorNote message={error} />
        </section>
        <div className="arcade-side">
          <section className="panel arcade-score" aria-label="Scoreboard">
            <div className="panel-heading">
              <h2>Scoreboard</h2>
              <span className="muted">seed {seed}</span>
            </div>
            <div className="panel-content">
              <div className="arcade-score-main">
                <span>{game.scoreLabel}</span>
                <strong data-testid="arcade-score">{score}</strong>
              </div>
              <dl className="arcade-compare">
                <div>
                  <dt>Random baseline, this seed</dt>
                  <dd>{baseline.sameSeed}</dd>
                </div>
                <div>
                  <dt>Random baseline, mean of {baseline.runs} seeds</dt>
                  <dd>{baseline.mean.toFixed(1)}</dd>
                </div>
                <div>
                  <dt>Scripted rule, this seed</dt>
                  <dd>{scripted.score}</dd>
                </div>
              </dl>
              {over && history.length > 0 && (
                <p className="arcade-verdict" data-verdict={verdict}>
                  {MODE_LABELS[mode]} {verdict} the random baseline on this
                  seed: {score} vs {baseline.sameSeed}.
                  {mode === "jev" && fallbacks > 0
                    ? ` ${fallbacks} move${fallbacks === 1 ? " was a fallback" : "s were fallbacks"}, not Jev choices.`
                    : ""}
                </p>
              )}
              {mode === "jev" && (
                <dl className="arcade-stats">
                  <div>
                    <dt>Jev choices</dt>
                    <dd>{jevRecords.length}</dd>
                  </div>
                  <div>
                    <dt>Forced moves</dt>
                    <dd>{forced}</dd>
                  </div>
                  <div>
                    <dt>Fallbacks</dt>
                    <dd>{fallbacks}</dd>
                  </div>
                  <div>
                    <dt>Mean confidence</dt>
                    <dd>
                      {meanConfidence === null ? "—" : percent(meanConfidence)}
                    </dd>
                  </div>
                  <div>
                    <dt>Mean latency</dt>
                    <dd>
                      {meanLatency === null
                        ? "—"
                        : `${Math.round(meanLatency)} ms`}
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          </section>
          <section className="panel arcade-setup">
            <div className="panel-heading">
              <h2>Setup</h2>
            </div>
            <div className="panel-content">
              <label htmlFor={`${gameId}-mode`}>Player</label>
              <select
                id={`${gameId}-mode`}
                value={mode}
                disabled={running}
                onChange={(e) => {
                  setMode(e.target.value as ArcadeMode);
                  reset();
                }}
              >
                {(Object.keys(MODE_LABELS) as ArcadeMode[]).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABELS[m]}
                  </option>
                ))}
              </select>
              <p className="muted">{MODE_BLURBS[mode]}</p>
              <label htmlFor={`${gameId}-seed`}>Seed</label>
              <div className="arcade-seed">
                <input
                  id={`${gameId}-seed`}
                  type="number"
                  min={1}
                  value={seed}
                  disabled={running}
                  onChange={(e) => {
                    const next = Math.max(
                      1,
                      Math.trunc(Number(e.target.value)) || 1,
                    );
                    setSeed(next);
                    reset(next);
                  }}
                />
                <button
                  type="button"
                  className="button quiet"
                  disabled={running}
                  onClick={() => {
                    const next = 1 + Math.floor(Math.random() * 9999);
                    setSeed(next);
                    reset(next);
                  }}
                >
                  <Dices size={14} /> New seed
                </button>
              </div>
              {(mode === "scripted" || mode === "random") && (
                <>
                  <label htmlFor={`${gameId}-speed`}>Speed</label>
                  <select
                    id={`${gameId}-speed`}
                    value={speed}
                    onChange={(e) =>
                      setSpeed(e.target.value as keyof typeof SPEEDS)
                    }
                  >
                    <option value="slow">Slow</option>
                    <option value="normal">Normal</option>
                    <option value="fast">Fast</option>
                  </select>
                </>
              )}
              {mode === "jev" && (
                <>
                  <label htmlFor={`${gameId}-model`}>Model</label>
                  <input
                    id={`${gameId}-model`}
                    value={model}
                    maxLength={100}
                    disabled={running}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="jev-latest"
                  />
                </>
              )}
            </div>
            <p className="panel-footnote">
              The seed fixes the whole world, so every player faces the same
              game. Live runs are capped at {game.maxDecisions} moves and send
              at most one request a second.
            </p>
          </section>
        </div>
      </div>
      <div className="split arcade-split-lower">
        <section className="panel">
          <div className="panel-heading">
            <h2>The decision</h2>
            {shown && <span className="muted">move {shown.tick + 1}</span>}
          </div>
          <div className="panel-content">
            {shown ? (
              <DecisionDetail record={shown} labels={game.actionLabels} />
            ) : (
              <Empty title="No moves yet">
                Press Play or One move. Each move shows the facts the game
                computed for every legal action and the choice that was made.
              </Empty>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Move log</h2>
            <span className="muted">{history.length} moves</span>
          </div>
          <div className="panel-content">
            {history.length ? (
              <ol className="arcade-log" reversed>
                {history
                  .slice(-60)
                  .reverse()
                  .map((r) => (
                    <li key={r.tick}>
                      <button
                        type="button"
                        aria-pressed={shown?.tick === r.tick}
                        onClick={() => setSelected(r.tick)}
                      >
                        <span className="arcade-log-tick">{r.tick + 1}</span>
                        <span className="arcade-log-action">
                          {game.actionLabels[r.action] ?? r.action}
                        </span>
                        <span className={`arcade-source source-${r.source}`}>
                          {SOURCE_LABELS[r.source]}
                        </span>
                        <span className="arcade-log-conf">
                          {r.confidence === null ? "" : percent(r.confidence)}
                        </span>
                      </button>
                    </li>
                  ))}
              </ol>
            ) : (
              <Empty title="No moves yet">
                Every move lands here with who chose it: Jev, a forced move, a
                fallback, the scripted rule, random, or you.
              </Empty>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function DecisionDetail({
  record,
  labels,
}: {
  record: DecisionRecord;
  labels: Record<string, string>;
}) {
  const actions = Object.keys(record.outcomes);
  const factKeys = [
    ...new Set(actions.flatMap((a) => Object.keys(record.outcomes[a]))),
  ];
  const format = (v: unknown) =>
    v === null || v === undefined
      ? "—"
      : typeof v === "boolean"
        ? v
          ? "yes"
          : "no"
        : String(v);
  return (
    <div className="arcade-decision">
      <div className="arcade-decision-head">
        <div>
          <span className="eyebrow">Move played</span>
          <strong>{labels[record.action] ?? record.action}</strong>
          <span className={`arcade-source source-${record.source}`}>
            {SOURCE_LABELS[record.source]}
          </span>
        </div>
        <div className="arcade-decision-stats">
          <div>
            <span>Confidence</span>
            <strong>
              {record.confidence === null ? "—" : percent(record.confidence)}
            </strong>
          </div>
          <div>
            <span>Latency</span>
            <strong>
              {record.latencyMs === null
                ? "—"
                : `${Math.round(record.latencyMs)} ms`}
            </strong>
          </div>
        </div>
      </div>
      {record.error && <p className="arcade-fallback-note">{record.error}</p>}
      <div className="arcade-table-wrap">
        <table className="arcade-outcomes">
          <caption>
            What each legal move would do, as computed by the game
          </caption>
          <thead>
            <tr>
              <th scope="col">Move</th>
              {Object.keys(record.probabilities).length > 0 && (
                <th scope="col">Jev probability</th>
              )}
              {factKeys.map((k) => (
                <th scope="col" key={k}>
                  {k.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {actions.map((a) => (
              <tr key={a} data-chosen={a === record.action ? "yes" : "no"}>
                <th scope="row">{labels[a] ?? a}</th>
                {Object.keys(record.probabilities).length > 0 && (
                  <td>
                    <span className="arcade-prob">
                      <span
                        style={{
                          width: `${Math.round((record.probabilities[a] ?? 0) * 100)}%`,
                        }}
                      />
                    </span>
                    {a in record.probabilities
                      ? percent(record.probabilities[a])
                      : "—"}
                  </td>
                )}
                {factKeys.map((k) => (
                  <td key={k}>{format(record.outcomes[a][k])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
