"use client";
import { useUsage, usageBlocked } from "../lib/logUsageEntry";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Maximize2, Minimize2 } from "lucide-react";
import { Heading, ErrorNote, Export } from "./ui";
import { JevDoomBrand } from "./JevDoomBrand";
import { GameViewport } from "./GameViewport";
import { StateInspector } from "./StateInspector";
import { ActionProbabilities } from "./ActionProbabilities";
import { ControlModeToggle } from "./ControlModeToggle";
import { Scoreboard } from "./Scoreboard";
import { createGame, stepGame, TICK_MS } from "../lib/gameLoop";
import { executeJevAction } from "../lib/executeJevAction";
import { extractGameState } from "../lib/extractGameState";
import { baselineRandomAgent } from "../lib/baselineRandomAgent";
import {
  classifyActionWithJev,
  ACTION_LABELS,
} from "../lib/classifyActionWithJev";
import {
  DOOM_ACTIONS,
  type ActionDecision,
  type ControlMode,
  type DoomAction,
  type GameFrame,
  type GameTrial,
} from "../types/doom";
const keys: Record<string, DoomAction> = {
  w: "move_forward",
  s: "move_backward",
  a: "strafe_left",
  d: "strafe_right",
  q: "turn_left",
  e: "turn_right",
  ArrowUp: "move_forward",
  ArrowDown: "move_backward",
  ArrowLeft: "turn_left",
  ArrowRight: "turn_right",
  " ": "shoot",
  f: "open_door",
  r: "use_item",
};
type Trace = {
  frames: GameFrame[];
  decisions: ActionDecision[];
  latencyMs: number;
  receivedAtTick: number;
  applied: boolean;
};
export function DoomLab() {
  useUsage();
  const quotaBlocked = usageBlocked();
  const arenaRef = useRef<HTMLElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [captureMode, setCaptureMode] = useState(false);
  useEffect(() => {
    const changed = () => {
      setFullscreen(document.fullscreenElement === arenaRef.current);
      if (!document.fullscreenElement) setCaptureMode(false);
    };
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  useEffect(() => {
    if (!fullscreen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    arenaRef.current?.querySelector<HTMLElement>(".doom-viewport")?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) {
        setFullscreen(false);
        setCaptureMode(false);
        fullscreenButton.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", escape);
    };
  }, [fullscreen]);
  async function toggleFullscreen() {
    if (fullscreen) {
      if (document.fullscreenElement) await document.exitFullscreen();
      setFullscreen(false);
      setCaptureMode(false);
      fullscreenButton.current?.focus();
      return;
    }
    if (document.fullscreenEnabled && arenaRef.current?.requestFullscreen) {
      try {
        await arenaRef.current.requestFullscreen();
        return;
      } catch {
        /* Fall back to a viewport-sized arena. */
      }
    }
    setFullscreen(true);
  }
  const [game, setGame] = useState(() => createGame(7)),
    [mode, setMode] = useState<ControlMode>("human"),
    [active, setActive] = useState(false),
    [chaos, setChaos] = useState(false),
    [batchSize, setBatchSize] = useState(4),
    [trials, setTrials] = useState<GameTrial[]>([]),
    [trace, setTrace] = useState<Trace[]>([]),
    [submitted, setSubmitted] = useState<GameFrame | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [measured, setMeasured] = useState({
      decisions: 0,
      requestMs: 0,
      requests: 0,
    });
  const state = useRef(game),
    human = useRef<DoomAction>("idle"),
    humanPulse = useRef<DoomAction | null>(null),
    frames = useRef<GameFrame[]>([]),
    command = useRef<{ action: DoomAction; tick: number } | null>(null),
    inFlight = useRef(false),
    abort = useRef<AbortController | null>(null),
    epoch = useRef(0);
  useEffect(
    () => () => {
      epoch.current++;
      abort.current?.abort();
    },
    [],
  );
  function halt() {
    epoch.current++;
    abort.current?.abort();
    inFlight.current = false;
    setPending(false);
    setActive(false);
    human.current = "idle";
    humanPulse.current = null;
    command.current = null;
  }
  function reset(nextMode = mode, nextChaos = chaos, nextBatch = batchSize) {
    halt();
    const s = state.current;
    if (s.tick > 0)
      setTrials((prev) => [
        ...prev.slice(-29),
        {
          mode,
          chaos,
          seed: s.seed,
          kills: s.kills,
          damageTaken: s.damageTaken,
          seconds: (s.tick * TICK_MS) / 1000,
          accuracy: s.shots ? s.hits / s.shots : null,
          actions: s.actions,
          outcome: s.status === "playing" ? "stopped" : s.status,
          classificationsPerSecond:
            measured.requestMs > 0
              ? measured.decisions / (measured.requestMs / 1000)
              : null,
        },
      ]);
    const fresh = createGame(s.seed);
    state.current = fresh;
    setGame(fresh);
    setMode(nextMode);
    setChaos(nextChaos);
    setBatchSize(nextBatch);
    frames.current = [];
    setTrace([]);
    setSubmitted(null);
    setError("");
    setMeasured({ decisions: 0, requestMs: 0, requests: 0 });
  }
  useEffect(() => {
    if (!active) return;
    const round = epoch.current;
    async function classify(snapshot: GameFrame[]) {
      setSubmitted(snapshot.at(-1)!);
      inFlight.current = true;
      setPending(true);
      const controller = new AbortController();
      abort.current = controller;
      try {
        const result = await classifyActionWithJev(snapshot, {
          signal: controller.signal,
        });
        if (epoch.current !== round) return;
        const latest = result.decisions.at(-1)!;
        const age = state.current.tick - latest.tick;
        const applied =
          state.current.status === "playing" && age === 0 && !latest.error;
        command.current = applied
          ? { action: latest.action, tick: latest.tick }
          : null;
        setMeasured((m) => ({
          decisions:
            m.decisions + result.decisions.filter((d) => !d.error).length,
          requestMs: m.requestMs + result.latencyMs,
          requests: m.requests + 1,
        }));
        setTrace((prev) => [
          ...prev.slice(-7),
          {
            ...result,
            frames: snapshot,
            receivedAtTick: state.current.tick,
            applied,
          },
        ]);
        setError(
          latest.error ??
            (applied
              ? ""
              : "The latest frame was too old to apply. Waiting for a fresh decision."),
        );
      } catch (e) {
        if (epoch.current !== round) return;
        command.current = null;
        setActive(false);
        setError(
          controller.signal.aborted
            ? "Stopped."
            : e instanceof Error
              ? e.message
              : "Jev request failed. Resume to retry.",
        );
      } finally {
        if (epoch.current === round) {
          inFlight.current = false;
          setPending(false);
        }
      }
    }
    const timer = setInterval(() => {
      if (document.hidden) return; // background tabs cannot silently keep spending requests.
      // Keep the observed world stable until Jev responds; latency cannot expire every choice.
      if (mode === "jev" && inFlight.current) return;
      let action: DoomAction = "idle";
      if (mode === "human") {
        action = humanPulse.current ?? human.current;
        humanPulse.current = null;
      }
      if (mode === "random") action = baselineRandomAgent(state.current);
      if (mode === "jev" && command.current?.tick === state.current.tick) {
        action = command.current.action;
        command.current = null; // One decision, one action pulse; never repeat a turn.
      }
      const next =
        mode === "jev"
          ? executeJevAction(state.current, action)
          : stepGame(state.current, action);
      state.current = next;
      setGame(next);
      if (next.status !== "playing") {
        clearInterval(timer);
        epoch.current++;
        abort.current?.abort();
        inFlight.current = false;
        setPending(false);
        setActive(false);
        return;
      }
      if (mode === "jev") {
        frames.current = [
          ...frames.current,
          { tick: next.tick, features: extractGameState(next, chaos) },
        ].slice(-batchSize);
        if (frames.current.length === batchSize && !inFlight.current)
          void classify(
            frames.current.map((f) => ({
              tick: f.tick,
              features: { ...f.features },
            })),
          );
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [active, mode, chaos, batchSize]);
  const last = trace.at(-1),
    decision = last?.decisions.at(-1) ?? null,
    seen = submitted;
  const confidence = decision?.confidence ?? null,
    face =
      confidence === null
        ? "🤖"
        : confidence >= 0.85
          ? "😎"
          : confidence >= 0.6
            ? "😐"
            : "😬";
  const throughput =
    measured.requestMs > 0
      ? measured.decisions / (measured.requestMs / 1000)
      : null;
  function start() {
    if (game.status !== "playing") return;
    setError("");
    setActive(true);
  }
  function keyboard(e: React.KeyboardEvent<HTMLDivElement>, pressed: boolean) {
    const action = keys[e.key] ?? keys[e.key.toLowerCase()];
    if (!action || mode !== "human" || !active) return;
    e.preventDefault();
    if (pressed) {
      human.current = action;
      humanPulse.current = action;
    } else if (human.current === action) human.current = "idle";
  }
  return (
    <div className="workspace compact-lab doom-lab">
      <Heading
        eyebrow="Reactive decisions · browser arena"
        title="JevDoom."
        description="Ten actions. One tiny decision at a time. Play the first-person 3D shooter, then hand the controls to Jev."
      />
      <div className="doom-layout">
        <section
          ref={arenaRef}
          className={
            "panel doom-arena-panel" +
            (fullscreen ? " doom-fullscreen" : "") +
            (captureMode ? " doom-capture" : "")
          }
        >
          <div className="panel-heading">
            <JevDoomBrand />
            <div className="doom-window-actions">
              {fullscreen && (
                <button
                  className="button"
                  aria-pressed={captureMode}
                  onClick={() => {
                    halt();
                    setCaptureMode(!captureMode);
                  }}
                >
                  {captureMode ? "Show controls" : "Screenshot mode"}
                </button>
              )}
              <button
                ref={fullscreenButton}
                className="button"
                aria-pressed={fullscreen}
                onClick={() => void toggleFullscreen()}
              >
                {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                {fullscreen ? "Exit fullscreen" : "Fullscreen"}
              </button>
            </div>
          </div>
          <div className="doom-arena-content">
            <div className="doom-capture-caption">
              SECTOR 01 <span>•</span> A LITTLE CHAOS, CLASSIFIED.
              <small>TypeSafe AI · Powered by Jev</small>
            </div>
            <ControlModeToggle
              mode={mode}
              onChange={(m) => {
                if (m !== mode) reset(m);
              }}
            />
            <GameViewport
              pending={pending}
              game={game}
              active={active}
              mode={mode}
              onAction={(action) => {
                if (active && mode === "human") humanPulse.current = action;
              }}
              onKeyDown={(e) => keyboard(e, true)}
              onKeyUp={(e) => keyboard(e, false)}
              onBlur={() => {
                human.current = "idle";
              }}
            />
            <div className="doom-actions">
              <button
                className="button primary"
                onClick={active ? halt : start}
                disabled={
                  game.status !== "playing" ||
                  (!active && mode === "jev" && quotaBlocked)
                }
              >
                {active ? <Pause size={15} /> : <Play size={15} />}{" "}
                {active ? "Pause arena" : "Start arena"}
              </button>
              <button className="button" onClick={() => reset()}>
                <RotateCcw size={14} />
                Restart same seed
              </button>
              <span>
                Seed {game.seed} · tick{" "}
                <b data-testid="doom-tick">{game.tick}</b>
              </span>
            </div>
            {mode === "human" && (
              <>
                <p className="doom-controls-hint">
                  Focus the arena: W/S move · A/D strafe · Q/E or ←/→ turn ·
                  Space shoot · F door · R item. Drag the 3D view to turn; click
                  or tap to fire.
                </p>
                <div
                  className="doom-touch-controls"
                  aria-label="On-screen game controls"
                >
                  {DOOM_ACTIONS.map((action) => (
                    <button
                      key={action}
                      className="button"
                      disabled={!active}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        human.current = action;
                        humanPulse.current = action;
                      }}
                      onPointerUp={() => {
                        human.current = "idle";
                      }}
                      onPointerCancel={() => {
                        human.current = "idle";
                      }}
                      onClick={(e) => {
                        if (e.detail === 0 && active) {
                          humanPulse.current = action;
                        }
                      }}
                    >
                      {ACTION_LABELS[action]}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="doom-options">
              <label>
                <input
                  type="checkbox"
                  checked={chaos}
                  onChange={(e) => reset(mode, e.target.checked)}
                />
                Chaos mode · hide enemy distance
              </label>
              <label>
                Frames per Jev batch
                <select
                  value={batchSize}
                  onChange={(e) => reset(mode, chaos, Number(e.target.value))}
                >
                  <option value={1}>1 · live only</option>
                  <option value={4}>4 · history + live</option>
                  <option value={8}>8 · history + live</option>
                </select>
              </label>
            </div>
            <p className="doom-controls-hint">
              Changing controls or chaos starts a fresh run. The optional
              tactical map shows the whole arena; Jev gets only the inspectable
              visibility features. No Doom assets or emulator are required.
            </p>
            <ErrorNote message={error} />
          </div>
        </section>
        <section className="panel doom-decision-panel">
          <div className="panel-heading">
            <h2>Inside the decision</h2>
            <Export
              data={
                trace.length
                  ? {
                      seed: game.seed,
                      mode,
                      chaos,
                      batchSize,
                      trace,
                      measured,
                      trials,
                    }
                  : null
              }
              name="jev-doom-decisions.json"
            />
          </div>
          <div className="doom-decision-content">
            <div className="doom-current-action">
              <span className="doom-face" aria-hidden="true">
                {face}
              </span>
              <div>
                <span className="eyebrow">
                  {mode === "jev"
                    ? "Jev’s latest choice"
                    : mode === "human"
                      ? "Your latest action"
                      : "Random baseline action"}
                </span>
                <strong>
                  {mode === "jev"
                    ? decision
                      ? ACTION_LABELS[decision.action]
                      : "Waiting for a frame"
                    : ACTION_LABELS[game.lastAction]}
                </strong>
                <span>
                  {mode === "jev"
                    ? confidence === null
                      ? "No valid confidence yet"
                      : (confidence * 100).toFixed(1) + "% confidence"
                    : "No model call"}
                </span>
              </div>
            </div>
            <div className="doom-speed">
              <div>
                <span>Decision latency (batch)</span>
                <strong>
                  {last ? Math.round(last.latencyMs) + "ms" : "—"}
                </strong>
              </div>
              <div>
                <span>Classifications / second</span>
                <strong>{throughput?.toFixed(1) ?? "—"}</strong>
              </div>
              <div>
                <span>Blink challenge</span>
                <strong>
                  {last
                    ? last.latencyMs < 200
                      ? "Under 200ms"
                      : "Over 200ms"
                    : "200ms target"}
                </strong>
              </div>
            </div>
            <p className="doom-controls-hint">
              Jev waits for each response, then applies one action. Turns toward
              a visible enemy stop at its bearing; Jev still chooses when to
              turn and shoot. Throughput = valid classifications ÷ elapsed request
              time, including the safety queue and network. The 200ms target is a demo challenge, not
              a claim about human perception. One newest decision can control
              the arena per batch.
            </p>
            <p className="doom-run-status" role="status">
              {pending
                ? "Jev is scoring " +
                  batchSize +
                  " captured frame" +
                  (batchSize === 1 ? "" : "s") +
                  "…"
                : mode !== "jev"
                  ? "Switch to Jev control to watch live classification."
                  : last
                    ? last.applied
                      ? "Newest frame accepted; earlier frames are trace only."
                      : "Batch inspected; no new action applied."
                    : "Start the arena to capture live state."}
            </p>
            <ActionProbabilities decision={decision} />
            <StateInspector
              current={extractGameState(game, chaos)}
              seen={seen}
              currentTick={game.tick}
            />
            <details className="doom-trace">
              <summary>
                Decision trace <span>{measured.requests} batches</span>
              </summary>
              <p className="muted">
                Only the newest frame may set the action, and only while it is
                still current. Simulation waits during the request. Each
                accepted choice executes once; earlier frames are classification
                samples, never queued controls. The last eight batches are
                retained.
              </p>
              {[...trace].reverse().map((batch, i) => (
                <div key={batch.receivedAtTick + "-" + i}>
                  <strong>
                    Frames {batch.frames[0].tick}–{batch.frames.at(-1)!.tick} ·{" "}
                    {Math.round(batch.latencyMs)}ms
                  </strong>
                  <span>
                    Received at tick {batch.receivedAtTick} ·{" "}
                    {batch.applied ? "latest accepted" : "not applied"}
                  </span>
                  {batch.decisions.map((d, j) => (
                    <p key={d.tick}>
                      Tick {d.tick}: {ACTION_LABELS[d.action]} ·{" "}
                      {d.confidence === null
                        ? "invalid"
                        : (d.confidence * 100).toFixed(0) + "%"}{" "}
                      ·{" "}
                      {j === batch.decisions.length - 1
                        ? "live candidate"
                        : "history only"}
                    </p>
                  ))}
                </div>
              ))}
            </details>
          </div>
        </section>
      </div>
      <Scoreboard
        game={game}
        trials={trials}
        mode={mode}
        chaos={chaos}
        classificationsPerSecond={throughput}
      />
    </div>
  );
}
