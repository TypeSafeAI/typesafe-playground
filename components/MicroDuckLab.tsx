"use client";
import { useUsage, usageBlocked } from "../lib/logUsageEntry";
import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  Gamepad2,
  Play,
  RotateCcw,
  SkipForward,
  Square,
} from "lucide-react";
import { errorMessage, percent, runJev } from "../lib/client";
import {
  buildDrivePayload,
  randomAction,
  resolveAction,
  scoreboard,
  topAction,
  type JevResponse,
} from "../lib/driveDuckWithJev";
import {
  advance,
  createWorld,
  defaultArena,
  observe,
  rng,
  step,
  type ArenaOptions,
} from "../lib/microduckWorld";
import { runBatches } from "../web/conversation";
import {
  actionLabels,
  hideableFields,
  modeLabels,
  simActions,
  type ControlMode,
  type Decision,
  type SimAction,
  type SimStateField,
  type World,
} from "../types/microduck";
import { MicroDuckStage } from "./MicroDuckStage";
import { DuckTelemetry } from "./DuckTelemetry";
import { Empty, ErrorNote, Export, Heading } from "./ui";
const logLimit = 240;
const defaultHidden: SimStateField[] = ["obstacle_left", "obstacle_right"];
interface Ask {
  duckId: string;
  degraded: boolean;
  request: ReturnType<typeof buildDrivePayload>;
}
interface Reply {
  ask: Ask;
  response?: JevResponse;
  error?: string;
  latencyMs: number;
}
export function MicroDuckLab() {
  useUsage();
  const quotaBlocked = usageBlocked();
  const [options, setOptions] = useState<ArenaOptions>(defaultArena);
  const [world, setWorld] = useState<World>(() => createWorld(defaultArena));
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [mode, setMode] = useState<ControlMode>("jev");
  const [model, setModel] = useState("jev-latest");
  const [ticks, setTicks] = useState(15);
  const [degrade, setDegrade] = useState(false);
  const [hidden, setHidden] = useState<SimStateField[]>(defaultHidden);
  const [selected, setSelected] = useState("d1");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const latest = useRef(world);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const commit = (next: World) => {
    latest.current = next;
    setWorld(next);
  };
  function rebuild(patch: Partial<ArenaOptions>) {
    const next = { ...options, ...patch };
    setOptions(next);
    try {
      const built = createWorld(next);
      commit(built);
      setDecisions([]);
      setElapsed(0);
      setError("");
      if (!built.ducks.some((duck) => duck.id === selected))
        setSelected(built.ducks[0].id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  /** Every duck decides from the same snapshot, then the actions are applied. */
  async function tick(signal: AbortSignal) {
    const snapshot = latest.current;
    const states = snapshot.ducks.map((duck) => observe(snapshot, duck));
    const replies = new Map<string, Reply>();
    if (mode === "jev") {
      const asks: Ask[] = [];
      snapshot.ducks.forEach((duck, index) => {
        asks.push({
          duckId: duck.id,
          degraded: false,
          request: buildDrivePayload(states[index], model),
        });
        if (degrade && hidden.length)
          asks.push({
            duckId: duck.id,
            degraded: true,
            request: buildDrivePayload(states[index], model, hidden),
          });
      });
      const settled = await runBatches(
        asks,
        async (ask: Ask): Promise<Reply> => {
          const started = performance.now();
          try {
            return {
              ask,
              response: (await runJev(
                ask.request.payload,
                signal,
              )) as JevResponse,
              latencyMs: performance.now() - started,
            };
          } catch (e) {
            if (signal.aborted) throw e;
            return {
              ask,
              error: errorMessage(e),
              latencyMs: performance.now() - started,
            };
          }
        },
        {
          signal,
          onProgress: (p) =>
            setProgress(`tick ${snapshot.tick} · ${p.completed}/${p.total}`),
        },
      );
      settled.forEach((result, index) => {
        const ask = asks[index];
        replies.set(
          `${ask.duckId}:${ask.degraded}`,
          result.status === "fulfilled"
            ? result.value
            : { ask, error: errorMessage(result.reason), latencyMs: 0 },
        );
      });
    }
    if (signal.aborted) return;
    let next = snapshot;
    const fresh: Decision[] = [];
    snapshot.ducks.forEach((duck, index) => {
      const state = states[index];
      const random = rng(snapshot.seed + snapshot.tick * 977 + index);
      const main = replies.get(`${duck.id}:false`);
      const choice =
        mode === "random"
          ? {
              action: randomAction(random),
              probabilities: {},
              source: "random" as const,
            }
          : main?.error
            ? {
                action: "stop" as SimAction,
                probabilities: {},
                source: "fallback" as const,
              }
            : resolveAction(main?.response);
      const applied = step(next, duck.id, choice.action);
      next = applied.world;
      const shadow = replies.get(`${duck.id}:true`);
      fresh.push({
        duckId: duck.id,
        tick: snapshot.tick,
        state,
        sent: mode === "jev" ? (main?.ask.request.sent ?? state) : state,
        action: choice.action,
        probabilities: choice.probabilities,
        source: choice.source,
        latencyMs: main?.latencyMs ?? 0,
        event: applied.event,
        ...(shadow
          ? {
              degraded: {
                sent: shadow.ask.request.sent,
                hidden: shadow.ask.request.hidden,
                ...(shadow.error
                  ? {
                      action: "stop" as SimAction,
                      probabilities: {},
                      source: "fallback" as const,
                      error: shadow.error,
                    }
                  : resolveAction(shadow.response)),
                latencyMs: shadow.latencyMs,
              },
            }
          : {}),
        ...(main?.error ? { error: main.error } : {}),
      });
    });
    commit(advance(next));
    setDecisions((prev) => [...prev, ...fresh].slice(-logLimit));
  }
  async function run(count: number) {
    setError("");
    setProgress("");
    setBusy(true);
    controller.current = new AbortController();
    const signal = controller.current.signal;
    const started = performance.now();
    try {
      for (let i = 0; i < count; i++) {
        if (signal.aborted) break;
        await tick(signal);
        if (mode === "jev" && usageBlocked()) break;
        if (i < count - 1 && !signal.aborted)
          await new Promise<void>((resolve) => {
            const done = () => {
              clearTimeout(timer);
              signal.removeEventListener("abort", done);
              resolve();
            };
            const timer = setTimeout(done, 220);
            signal.addEventListener("abort", done, { once: true });
          });
      }
    } catch (e) {
      setError(signal.aborted ? "Run stopped." : errorMessage(e));
    } finally {
      setElapsed((prev) => prev + (performance.now() - started));
      setProgress("");
      setBusy(false);
    }
  }
  /** Manual mode: the human acts, and Jev is asked what it would have done. */
  async function drive(action: SimAction) {
    setError("");
    setBusy(true);
    controller.current = new AbortController();
    const signal = controller.current.signal;
    const started = performance.now();
    const snapshot = latest.current;
    const duck =
      snapshot.ducks.find((d) => d.id === selected) ?? snapshot.ducks[0];
    const state = observe(snapshot, duck);
    const request = buildDrivePayload(state, model);
    let probabilities = {};
    let latencyMs = 0;
    let advice = "";
    try {
      const at = performance.now();
      probabilities = resolveAction(
        (await runJev(request.payload, signal)) as JevResponse,
      ).probabilities;
      latencyMs = performance.now() - at;
    } catch (e) {
      advice = signal.aborted ? "Advice cancelled." : errorMessage(e);
    }
    if (signal.aborted) {
      setBusy(false);
      return;
    }
    const applied = step(snapshot, duck.id, action);
    commit(advance(applied.world));
    setDecisions((prev) =>
      [
        ...prev,
        {
          duckId: duck.id,
          tick: snapshot.tick,
          state,
          sent: request.sent,
          action,
          probabilities,
          source: "manual" as const,
          latencyMs,
          event: applied.event,
          ...(advice ? { error: advice } : {}),
        },
      ].slice(-logLimit),
    );
    setElapsed((prev) => prev + (performance.now() - started));
    setBusy(false);
  }
  const board = scoreboard(world, decisions, elapsed);
  const shown = decisions.filter((d) => d.duckId === selected);
  const last = shown.at(-1);
  const duck = world.ducks.find((d) => d.id === selected) ?? world.ducks[0];
  const perTick = world.ducks.length * (degrade && hidden.length ? 2 : 1);
  return (
    <div className="workspace microduck-lab">
      <Heading
        eyebrow="MicroDuck arena"
        title="Can a typed choice drive a robot?"
        description="Jev sees nine sensor fields and picks one of seven actions per tick. The arena applies it, dents and all."
      >
        <span className="pill">
          <Bot size={15} />
          Closed action set · one request per duck per tick
        </span>
      </Heading>
      <div className="split">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <Gamepad2 size={18} />
              <h2>Arena</h2>
            </div>
            <button
              className="button quiet"
              disabled={busy}
              onClick={() => rebuild({})}
            >
              <RotateCcw size={14} />
              Reset arena
            </button>
          </div>
          <div className="panel-content scroll">
            <MicroDuckStage
              world={world}
              selected={selected}
              onSelect={setSelected}
              busy={busy}
              controls={
                <>
                  <select
                    aria-label="Arena control mode"
                    value={mode}
                    disabled={busy}
                    onChange={(e) => setMode(e.target.value as ControlMode)}
                  >
                    {Object.entries(modeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {mode === "manual" ? (
                    simActions.map((action) => (
                      <button
                        key={action}
                        className="button"
                        disabled={busy || quotaBlocked}
                        onClick={() => drive(action)}
                      >
                        {actionLabels[action]}
                      </button>
                    ))
                  ) : (
                    <>
                      <button
                        className="button"
                        disabled={busy || (mode === "jev" && quotaBlocked)}
                        onClick={() => run(1)}
                      >
                        <SkipForward size={14} /> Step
                      </button>
                      <button
                        className="button primary"
                        disabled={busy || (mode === "jev" && quotaBlocked)}
                        onClick={() => run(ticks)}
                      >
                        <Play size={14} /> Run {ticks} ticks
                      </button>
                    </>
                  )}
                  {busy && (
                    <button
                      className="button"
                      onClick={() => controller.current?.abort()}
                    >
                      <Square size={14} /> Stop
                    </button>
                  )}
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => rebuild({})}
                  >
                    <RotateCcw size={14} /> Reset
                  </button>
                </>
              }
            />
            <details className="game-settings">
              <summary>Arena setup and robot roster</summary>
              <div className="table-wrap">
                <table className="duck-roster">
                  <caption className="muted">
                    Tick {world.tick} · seed {world.seed}. Select a duck to read
                    its decisions.
                  </caption>
                  <thead>
                    <tr>
                      <th>Duck</th>
                      <th>Battery</th>
                      <th>Cargo</th>
                      <th>Delivered</th>
                      <th>Dents</th>
                      <th>Wasted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {world.ducks.map((d, index) => (
                      <tr
                        key={d.id}
                        data-duck={index + 1}
                        aria-current={d.id === selected ? "true" : undefined}
                      >
                        <td>
                          <button
                            className="link-button"
                            onClick={() => setSelected(d.id)}
                          >
                            {d.name}
                          </button>
                        </td>
                        <td>{d.battery}%</td>
                        <td>{d.carrying ? "aboard" : "—"}</td>
                        <td>{d.goals}</td>
                        <td>{d.collisions}</td>
                        <td>{d.wasted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <fieldset disabled={busy}>
                <label htmlFor="duck-mode">Who drives</label>
                <select
                  id="duck-mode"
                  value={mode}
                  onChange={(event) =>
                    setMode(event.target.value as ControlMode)
                  }
                >
                  {Object.entries(modeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <div className="arena-options">
                  <label>
                    Ducks
                    <input
                      type="number"
                      min={1}
                      max={4}
                      value={options.ducks}
                      onChange={(event) =>
                        rebuild({ ducks: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Seed
                    <input
                      type="number"
                      value={options.seed}
                      onChange={(event) =>
                        rebuild({ seed: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Width
                    <input
                      type="number"
                      min={5}
                      max={14}
                      value={options.width}
                      onChange={(event) =>
                        rebuild({ width: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Height
                    <input
                      type="number"
                      min={5}
                      max={14}
                      value={options.height}
                      onChange={(event) =>
                        rebuild({ height: Number(event.target.value) })
                      }
                    />
                  </label>
                </div>
                <details className="disclosure">
                  <summary>Withheld-sensor test and model</summary>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={degrade}
                      onChange={(event) => setDegrade(event.target.checked)}
                    />
                    Re-ask each tick with fields withheld
                  </label>
                  <span className="field-hint">
                    Doubles the requests. The second ask drops these fields from
                    the state entirely.
                  </span>
                  <div className="field-options">
                    {hideableFields.map((field) => (
                      <label
                        key={field}
                        className={hidden.includes(field) ? "selected" : ""}
                      >
                        <input
                          type="checkbox"
                          checked={hidden.includes(field)}
                          onChange={(event) =>
                            setHidden(
                              event.target.checked
                                ? [...hidden, field]
                                : hidden.filter((f) => f !== field),
                            )
                          }
                        />
                        <Check size={13} />
                        {field}
                      </label>
                    ))}
                  </div>
                  <label>
                    Model
                    <input
                      value={model}
                      maxLength={100}
                      onChange={(event) => setModel(event.target.value)}
                    />
                  </label>
                </details>
              </fieldset>
            </details>
          </div>
          <div className="panel-bottom">
            <label className="tick-count">
              Ticks
              <input
                type="number"
                min={1}
                max={60}
                value={ticks}
                disabled={busy}
                onChange={(event) =>
                  setTicks(
                    Math.max(1, Math.min(60, Number(event.target.value) || 1)),
                  )
                }
              />
            </label>
            <span className="muted">
              Step, run, or drive from the arena controls.
            </span>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>What Jev decided</h2>
            <Export
              data={
                decisions.length
                  ? { arena: options, mode, scoreboard: board, decisions }
                  : null
              }
              name="microduck-run.json"
            />
          </div>
          <div className="panel-content scroll" aria-live="polite">
            <ErrorNote message={error} />
            {busy && (
              <p role="status" className="muted">
                {progress || "Deciding…"}
              </p>
            )}
            <dl className="scoreboard">
              <div>
                <dt>Delivered</dt>
                <dd>{board.goals}</dd>
              </div>
              <div>
                <dt>Dents</dt>
                <dd>{board.collisions}</dd>
              </div>
              <div>
                <dt>Wasted</dt>
                <dd>{board.wasted}</dd>
              </div>
              <div>
                <dt>Decisions</dt>
                <dd>{board.decisions}</dd>
              </div>
              <div>
                <dt>Mean latency</dt>
                <dd>
                  {board.meanLatencyMs
                    ? `${Math.round(board.meanLatencyMs)} ms`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>
                  {mode === "manual" ? "Agreed with you" : "Failed calls"}
                </dt>
                <dd>
                  {mode === "manual"
                    ? board.agreement === null
                      ? "—"
                      : `${percent(board.agreement)} of ${board.agreementOf}`
                    : board.failures}
                </dd>
              </div>
            </dl>
            {last ? (
              <DuckTelemetry decision={last} name={duck.name} />
            ) : (
              <Empty title="The arena is still.">
                Run a tick to see the nine fields the duck sent, the action Jev
                picked, and what the arena did with it.
              </Empty>
            )}
            {shown.length > 1 && (
              <div className="table-wrap">
                <table className="decision-log">
                  <caption className="muted">
                    {duck.name}: last {Math.min(12, shown.length)} of{" "}
                    {shown.length} decisions
                  </caption>
                  <thead>
                    <tr>
                      <th>Tick</th>
                      <th>Action</th>
                      <th>Top score</th>
                      <th>Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...shown]
                      .slice(-12)
                      .reverse()
                      .map((decision) => {
                        const best = topAction(decision.probabilities);
                        return (
                          <tr key={`${decision.duckId}-${decision.tick}`}>
                            <td>{decision.tick}</td>
                            <td>{actionLabels[decision.action]}</td>
                            <td>
                              {best
                                ? percent(decision.probabilities[best])
                                : "—"}
                            </td>
                            <td>
                              {decision.error ? "failed" : decision.event}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="panel-footnote">
            One tick costs {perTick} request{perTick === 1 ? "" : "s"} at this
            setting. Jev never sees the arena, only the fields listed above, and
            an unusable answer stops the duck instead of guessing a move.
          </p>
        </section>
      </div>
    </div>
  );
}
