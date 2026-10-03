"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Crown, Info, Play, RotateCcw, SkipForward } from "lucide-react";
import { useUsage, usageBlocked } from "../lib/logUsageEntry";
import { errorMessage, runJev } from "../lib/client";
import {
  buildMovePayload,
  resolveMove,
  type JevResponse,
} from "../lib/classifyMoveWithJev";
import { legalMoves, replay, rng } from "../lib/chessEngine";
import {
  JEV_COLOR,
  defaultOptions,
  opponentMove,
  pendingAsk,
  playPly,
  summarize,
  type LoopOptions,
} from "../lib/chessGameLoop";
import {
  gameModes,
  modeBlurbs,
  modeLabels,
  type GameMode,
  type MoveRecord,
} from "../types/chess";
import { BoardView } from "./BoardView";
import { GameLog } from "./GameLog";
import { MoveCandidates } from "./MoveCandidates";
import { MoveProbabilities } from "./MoveProbabilities";
import { ResultSummary } from "./ResultSummary";
import { Empty, ErrorNote, Export, Heading, RunButton } from "./ui";
/** Half-moves before the page calls it a day, so a shuffling draw terminates. */
const MOVE_LIMIT = 160;
export function ChessLab() {
  useUsage();
  const quotaBlocked = usageBlocked();
  const [options, setOptions] = useState<LoopOptions>(defaultOptions);
  const [model, setModel] = useState("jev-latest");
  const [sans, setSans] = useState<string[]>([]);
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  // The PRNG is rebuilt from the seed whenever the game restarts, so a seeded
  // run replays move for move.
  const random = useRef(rng(defaultOptions.seed));
  const running = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const game = useMemo(() => replay(sans), [sans]);
  const over = game.isGameOver() || sans.length >= MOVE_LIMIT;
  const summary = useMemo(
    () => summarize(sans, moves, options, sans.length >= MOVE_LIMIT),
    [sans, moves, options],
  );
  const shown =
    moves.find((move) => move.ply === selected) ??
    [...moves].reverse().find((move) => move.color === JEV_COLOR);
  const lastMove = moves.at(-1);
  const lastSquares = lastMove
    ? legalMovesFrom(sans.slice(0, -1), lastMove.san)
    : undefined;
  function reset(patch: Partial<LoopOptions> = {}) {
    controller.current?.abort();
    running.current = false;
    const next = { ...options, ...patch };
    setOptions(next);
    random.current = rng(next.seed);
    setSans([]);
    setMoves([]);
    setSelected(null);
    setPick(null);
    setError("");
    setAutoPlay(false);
    setBusy(false);
  }
  /**
   * One Jev ply, then the opponent's reply. Returns false when the game ended
   * or the request failed, which is what stops auto-play.
   */
  async function advance(fromSans: string[]): Promise<string[] | null> {
    const current = replay(fromSans);
    const ask = pendingAsk(current);
    if (!ask) {
      // No decision to make: either the game is over, or the single legal move
      // plays itself. A one-move "choice" is not a decision worth asking about.
      const only = legalMoves(current);
      if (current.isGameOver() || current.turn() !== JEV_COLOR || !only.length)
        return null;
      const forced = playPly(
        current,
        { san: only[0].san, source: "jev" },
        options,
      );
      const after = [...fromSans, forced.record.san];
      setMoves((list) => [...list, forced.record]);
      setSans(after);
      return withOpponent(after);
    }
    const request = buildMovePayload(ask.summary, ask.candidates, model);
    controller.current = new AbortController();
    const started = performance.now();
    let response: JevResponse | undefined;
    let failure = "";
    try {
      response = (await runJev(
        request.payload,
        controller.current.signal,
      )) as JevResponse;
    } catch (e) {
      if (controller.current.signal.aborted) return null;
      failure = errorMessage(e);
    }
    const latencyMs = performance.now() - started;
    if (failure) {
      setError(failure);
      return null;
    }
    const choice = resolveMove(response, ask.candidates);
    const played = playPly(
      current,
      {
        san: choice.san,
        source: choice.source,
        summary: ask.summary,
        candidates: ask.candidates,
        probabilities: choice.probabilities,
        confidence: choice.confidence,
        latencyMs,
      },
      options,
    );
    const after = [...fromSans, played.record.san];
    setMoves((list) => [...list, played.record]);
    setSans(after);
    setSelected(played.record.ply);
    return withOpponent(after);
  }
  /** Plays the opponent's reply, when the mode has one to play. */
  function withOpponent(fromSans: string[]): string[] {
    const current = replay(fromSans);
    const reply = opponentMove(current, options, random.current);
    if (!reply) return fromSans;
    const played = playPly(current, reply, options);
    const after = [...fromSans, played.record.san];
    setMoves((list) => [...list, played.record]);
    setSans(after);
    return after;
  }
  async function step() {
    if (busy || over) return;
    setBusy(true);
    setError("");
    try {
      await advance(sans);
    } finally {
      setBusy(false);
    }
  }
  /**
   * Plays until the game ends, the move limit is hit, or a request fails.
   * Each ply is a separate request, so this is a loop of awaits rather than a
   * batch — the page is showing what one-decision-at-a-time actually costs.
   */
  async function playOut() {
    if (busy || over) return;
    setBusy(true);
    setAutoPlay(true);
    setError("");
    running.current = true;
    let current = sans;
    try {
      while (running.current && current.length < MOVE_LIMIT) {
        const next = await advance(current);
        if (!next) break;
        current = next;
        if (replay(current).isGameOver()) break;
      }
    } finally {
      running.current = false;
      setAutoPlay(false);
      setBusy(false);
    }
  }
  function stop() {
    running.current = false;
    controller.current?.abort();
  }
  /** Human mode: click a piece, then its destination. */
  function onSquare(square: string) {
    if (busy || over || game.turn() === JEV_COLOR) return;
    const candidates = legalMoves(game);
    if (pick) {
      const move = candidates.find(
        (candidate) => candidate.from === pick && candidate.to === square,
      );
      if (move) {
        const played = playPly(
          game,
          { san: move.san, source: "human" },
          options,
        );
        setMoves((list) => [...list, played.record]);
        setSans((list) => [...list, played.record.san]);
        setPick(null);
        return;
      }
    }
    setPick(
      candidates.some((candidate) => candidate.from === square) ? square : null,
    );
  }
  const targets = pick
    ? legalMoves(game)
        .filter((candidate) => candidate.from === pick)
        .map((candidate) => candidate.to)
    : [];
  const humanTurn =
    options.mode === "jev_human" && game.turn() !== JEV_COLOR && !over;
  return (
    <div className="workspace compact-lab chess-lab">
      <Heading
        eyebrow="Known limitation"
        title="Jev attempts chess"
        description="A System One model picking one legal move at a time, with no search behind it. It never plays an illegal move, and it plays badly — that gap is the whole demo."
      >
        <Export
          data={moves.length ? { options, model, sans, moves, summary } : null}
          name="chess-game.json"
        />
      </Heading>
      <div className="callout chess-callout">
        <Info size={16} />
        <div>
          <strong>This is the wrong tool for this job, on purpose.</strong>
          <details className="game-explanation">
            <summary>Why this is a one-move experiment</summary>
            <p>
              Jev&rsquo;s own guidance puts chess-like planning outside what a
              fast decision model should be asked to do: positions that need
              lookahead, a search tree and an evaluation function belong to a
              dedicated engine, or to a large reasoning model that can think in
              extended steps. Jev answers in one classification and keeps
              nothing between calls — no plan, no memory of the last move, no
              idea what the reply will be. This page wires it up to a real board
              anyway, so the shape of that limit is something you can watch
              rather than something you have to take on trust.
            </p>
          </details>
        </div>
      </div>
      <div className="split chess-split">
        <section className="panel chess-board-panel">
          <div className="panel-heading">
            <div>
              <Crown size={15} />
              <h2>{modeLabels[options.mode]}</h2>
            </div>
            <span className="muted">
              {over
                ? "Game over"
                : humanTurn
                  ? "Your move"
                  : `Move ${game.moveNumber()}, ${game.turn() === "w" ? "white" : "black"} to play`}
            </span>
          </div>
          <div className="panel-content">
            <BoardView
              sans={sans}
              lastMove={lastSquares}
              selected={pick}
              targets={targets}
              onSquare={onSquare}
              interactive={humanTurn}
            />
            {humanTurn && (
              <p className="muted chess-turn-hint">
                Click one of your pieces, then the square to move it to.
              </p>
            )}
          </div>
          <div className="panel-bottom">
            <RunButton
              busy={busy}
              onClick={autoPlay ? undefined : playOut}
              onCancel={stop}
              disabled={over || humanTurn}
            >
              <Play size={15} /> Play out
            </RunButton>
            <button
              type="button"
              className="button"
              onClick={step}
              disabled={busy || over || humanTurn || quotaBlocked}
            >
              <SkipForward size={14} /> One move
            </button>
            <button
              type="button"
              className="button quiet"
              onClick={() => reset()}
            >
              <RotateCcw size={14} /> New game
            </button>
          </div>
          <ErrorNote message={error} />
        </section>
        <section className="panel chess-setup">
          <div className="panel-heading">
            <h2>Setup</h2>
          </div>
          <div className="panel-content">
            <label htmlFor="chess-mode">Mode</label>
            <select
              id="chess-mode"
              value={options.mode}
              onChange={(event) =>
                reset({ mode: event.target.value as GameMode })
              }
            >
              {gameModes.map((mode) => (
                <option key={mode} value={mode}>
                  {modeLabels[mode]}
                </option>
              ))}
            </select>
            <p className="muted">{modeBlurbs[options.mode]}</p>
            <label htmlFor="chess-depth">
              Minimax depth <span className="count">{options.depth}</span>
            </label>
            <input
              id="chess-depth"
              type="range"
              min={1}
              max={3}
              step={1}
              value={options.depth}
              disabled={options.mode !== "jev_minimax"}
              onChange={(event) => reset({ depth: Number(event.target.value) })}
            />
            <label htmlFor="chess-blunder">
              Blunder threshold{" "}
              <span className="count">{options.blunderCp} cp</span>
            </label>
            <input
              id="chess-blunder"
              type="range"
              min={50}
              max={500}
              step={50}
              value={options.blunderCp}
              onChange={(event) =>
                setOptions((current) => ({
                  ...current,
                  blunderCp: Number(event.target.value),
                }))
              }
            />
            <label htmlFor="chess-seed">Seed</label>
            <input
              id="chess-seed"
              type="number"
              value={options.seed}
              min={1}
              onChange={(event) =>
                reset({ seed: Number(event.target.value) || 1 })
              }
            />
            <label htmlFor="chess-model">Model</label>
            <input
              id="chess-model"
              value={model}
              maxLength={100}
              onChange={(event) => setModel(event.target.value)}
              placeholder="jev-latest"
            />
          </div>
          <p className="panel-footnote">
            The seed fixes the opponent&rsquo;s choices, so the same seed and
            mode replay the same game. Changing the blunder threshold re-marks
            the moves already played without asking Jev anything again.
          </p>
        </section>
      </div>
      {over && moves.length > 0 && (
        <ResultSummary
          summary={summary}
          mode={options.mode}
          blunderCp={options.blunderCp}
          refereeDepth={options.refereeDepth}
        />
      )}
      <details className="workspace-more game-history">
        <summary>Decision details and move history</summary>
        <div className="split chess-split">
          <section className="panel">
            <div className="panel-heading">
              <h2>The decision</h2>
              {shown && <span className="muted">move {shown.ply}</span>}
            </div>
            <div className="panel-content">
              {shown ? (
                <>
                  <MoveProbabilities move={shown} />
                  {shown.summary && shown.candidates && (
                    <MoveCandidates
                      summary={shown.summary}
                      candidates={shown.candidates}
                      chosen={shown.san}
                      best={shown.bestSan}
                    />
                  )}
                </>
              ) : (
                <Empty title="No moves yet">
                  Play a move to see the position summary Jev received, the
                  legal moves it chose between, and what the referee made of its
                  pick.
                </Empty>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Game log</h2>
            </div>
            <div className="panel-content">
              {moves.length ? (
                <GameLog
                  moves={moves}
                  selected={selected}
                  onSelect={setSelected}
                />
              ) : (
                <Empty title="No moves yet">
                  Every half-move lands here. Jev&rsquo;s are marked with what
                  they cost against the referee&rsquo;s best line.
                </Empty>
              )}
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}
/** Resolves a played SAN back to its from/to squares, for board highlighting. */
function legalMovesFrom(
  before: string[],
  san: string,
): { from: string; to: string } | undefined {
  const move = legalMoves(replay(before)).find(
    (candidate) => candidate.san === san,
  );
  return move ? { from: move.from, to: move.to } : undefined;
}
