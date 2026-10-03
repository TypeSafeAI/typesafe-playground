"use client";
import dynamic from "next/dynamic";
import workerAsset from "../lib/twisty/worker-url.json";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Shuffle, RotateCcw } from "lucide-react";
import { Heading } from "./ui";
import { TwistyJevPlayer } from "./TwistyJevPlayer";
import { revealResults } from "../lib/scroll";
import {
  PUZZLES,
  isPuzzleId,
  parseMoves,
  practiceScramble,
  MAX_INPUT,
  type PuzzleId,
  type PuzzleResult,
} from "../lib/twisty/contracts";

const Board = dynamic(() => import("./TwistyBoard"), {
  ssr: false,
  loading: () => <div className="twisty-board">Loading puzzle diagram…</div>,
});
const STORAGE_KEY = "typesafe:twisty-puzzles:v1";
const LIMIT_MS = 60_000;

export function TwistyPuzzleLab() {
  const [mode, setMode] = useState<"jev" | "local">("jev");
  const [liveSession, setLiveSession] = useState(0);
  const [liveMoves, setLiveMoves] = useState<string[]>([]);
  const [puzzle, setPuzzle] = useState<PuzzleId>("3x3x3");
  const [drafts, setDrafts] = useState<Record<PuzzleId, string>>(
    () =>
      Object.fromEntries(
        Object.entries(PUZZLES).map(([id, value]) => [id, value.sample]),
      ) as Record<PuzzleId, string>,
  );
  const [restored, setRestored] = useState(false);
  const [storageNote, setStorageNote] = useState("");
  const [applied, setApplied] = useState("");
  const [result, setResult] = useState<PuzzleResult | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    "Choose a puzzle, then load its scramble.",
  );
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);

  function terminate() {
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  function clearRun() {
    terminate();
    setBusy(false);
    setError("");
    setResult(null);
    setStep(0);
    setLiveMoves([]);
    setLiveSession((value) => value + 1);
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && raw.length < 12_000) {
        const saved = JSON.parse(raw);
        if (isPuzzleId(saved.puzzle)) setPuzzle(saved.puzzle);
        setDrafts((previous) => {
          const next = { ...previous };
          for (const id of Object.keys(PUZZLES) as PuzzleId[])
            if (
              typeof saved.drafts?.[id] === "string" &&
              saved.drafts[id].length <= MAX_INPUT
            )
              next[id] = saved.drafts[id];
          return next;
        });
      }
    } catch {
      setStorageNote(
        "Saved drafts could not be restored. You can still use the solver.",
      );
    }
    setRestored(true);
    return terminate;
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ puzzle, drafts }));
    } catch {
      setStorageNote(
        "Browser storage is unavailable. Copy your scramble before leaving.",
      );
    }
  }, [puzzle, drafts, restored]);
  useEffect(() => {
    function onVisibility() {
      if (document.hidden && worker.current) {
        terminate();
        setBusy(false);
        setNotice(
          "Search stopped while this page was hidden. Solve again when ready.",
        );
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  function load(input = drafts[puzzle]) {
    clearRun();
    try {
      const normalized = parseMoves(puzzle, input).join(" ");
      setApplied(normalized);
      setNotice(
        normalized
          ? "Scramble loaded. Find a solution, then follow one move at a time."
          : "Solved starting position loaded.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid scramble.");
    }
  }
  function solve() {
    clearRun();
    setBusy(true);
    setNotice("Searching locally. You can cancel at any time.");
    const current = generation.current;
    const finish = () => {
      terminate();
      setBusy(false);
    };
    try {
      const active = new Worker(workerAsset.url, { type: "module" });
      worker.current = active;
      timer.current = setTimeout(() => {
        if (generation.current !== current) return;
        finish();
        setError(
          "Search reached the 60-second limit. No solution was accepted. Try a shorter scramble.",
        );
        setNotice("");
      }, LIMIT_MS);
      active.onmessage = (
        event: MessageEvent<{ result?: PuzzleResult; error?: string }>,
      ) => {
        if (generation.current !== current) return;
        finish();
        if (event.data.result) {
          setResult(event.data.result);
          revealResults("twisty-solution-panel");
          setNotice(
            event.data.result.moves.length
              ? "Solution verified against the puzzle state. Follow the steps below."
              : "This position is already solved.",
          );
        } else {
          setError(
            event.data.error || "Search failed. No solution was accepted.",
          );
          setNotice("");
        }
      };
      active.onerror = () => {
        if (generation.current !== current) return;
        finish();
        setError("The solver could not start. Reload the page and try again.");
        setNotice("");
      };
      active.postMessage({ puzzle, scramble: applied });
    } catch {
      finish();
      setError("This browser could not start a puzzle worker.");
      setNotice("");
    }
  }
  const draft = drafts[puzzle];
  const dirty = draft.trim().replace(/\s+/g, " ") !== applied;
  const algorithm = [
    applied,
    ...(result ? result.moves.slice(0, step) : liveMoves),
  ].join(" ");

  return (
    <div className="workspace twisty-workspace">
      <Heading
        eyebrow="JEV PUZZLE LAB"
        title="Twisty puzzle solver"
        description="Scramble it. Understand each turn. Watch the solution come together."
      >
        <span className="tag">
          {mode === "jev"
            ? "Live Jev · local state verification"
            : "Local solver · no model calls"}
        </span>
      </Heading>
      <div className="twisty-layout">
        <section
          className="panel twisty-controls"
          aria-labelledby="twisty-setup"
        >
          <div className="twisty-section-heading">
            <span className="twisty-number">1</span>
            <h2 id="twisty-setup">Choose your puzzle</h2>
          </div>
          <div
            className="twisty-puzzle-picker"
            role="group"
            aria-label="Puzzle type"
          >
            {(
              Object.entries(PUZZLES) as [
                PuzzleId,
                (typeof PUZZLES)[PuzzleId],
              ][]
            ).map(([id, value]) => (
              <button
                key={id}
                className="button"
                aria-pressed={puzzle === id}
                onClick={() => {
                  clearRun();
                  setPuzzle(id);
                  setApplied("");
                  setNotice("Load your saved scramble or create a new one.");
                }}
              >
                {value.label}
              </button>
            ))}
          </div>
          <p className="muted">
            {puzzle === "megaminx"
              ? "A twelve-sided dodecahedral puzzle. Every face turns in fifths."
              : puzzle === "4x4x4"
                ? "Includes wide turns that move two layers together."
                : "Jev can choose legal turns; the local solver is available as a comparison."}
          </p>
          <label htmlFor="twisty-scramble">Scramble from a solved puzzle</label>
          <textarea
            id="twisty-scramble"
            value={draft}
            maxLength={MAX_INPUT}
            rows={4}
            spellCheck={false}
            aria-describedby="twisty-notation"
            onChange={(event) => {
              clearRun();
              setDrafts((previous) => ({
                ...previous,
                [puzzle]: event.target.value,
              }));
              setNotice("Draft changed. Load it to update the diagram.");
            }}
          />
          <p id="twisty-notation" className="muted">
            Space-separated turns. Prime (′) means reverse; 2 means twice. Use
            the straight apostrophe in input.{" "}
            {puzzle === "4x4x4"
              ? "Rw turns the two right layers."
              : puzzle === "megaminx"
                ? "R++ / D-- scramble notation is also supported."
                : "Try R U R' U'."}
          </p>
          <div className="twisty-actions">
            <button className="button" onClick={() => load()}>
              Load scramble
            </button>
            <button
              className="button"
              onClick={() => {
                const input = practiceScramble(
                  puzzle,
                  crypto.getRandomValues(new Uint32Array(1))[0],
                );
                setDrafts((previous) => ({ ...previous, [puzzle]: input }));
                load(input);
              }}
            >
              <Shuffle size={16} /> New scramble
            </button>
            <button
              className="button"
              onClick={() => {
                setDrafts((previous) => ({ ...previous, [puzzle]: "" }));
                load("");
              }}
            >
              <RotateCcw size={16} /> Reset
            </button>
          </div>
          <div className="twisty-section-heading">
            <span className="twisty-number">2</span>
            <h2>Choose how to solve</h2>
          </div>
          <div
            className="twisty-puzzle-picker"
            role="group"
            aria-label="Solver mode"
          >
            <button
              className="button"
              aria-pressed={mode === "jev"}
              onClick={() => {
                clearRun();
                setMode("jev");
                setNotice(
                  "Live Jev selected. Load a scramble, then ask for a move.",
                );
              }}
            >
              Live Jev
            </button>
            <button
              className="button"
              aria-pressed={mode === "local"}
              onClick={() => {
                clearRun();
                setMode("local");
                setNotice(
                  "Local comparison selected. No model requests will be sent.",
                );
              }}
            >
              Local solver
            </button>
          </div>
          <p className="muted">
            {dirty
              ? "Load your draft first. The diagram still shows the last loaded position."
              : "The solution is checked by applying every move to the loaded position."}
          </p>
          {mode === "jev" ? (
            <TwistyJevPlayer
              key={liveSession}
              puzzle={puzzle}
              scramble={applied}
              disabled={dirty}
              onMoves={setLiveMoves}
              onSolved={(value) => {
                setResult(value);
                setStep(value.moves.length);
                revealResults("twisty-solution-panel");
              }}
            />
          ) : (
            <>
              <p className="muted">
                Local state search only. This comparison mode makes no Jev
                request.
              </p>
              <div className="twisty-actions">
                <button
                  className="button primary"
                  disabled={busy || dirty}
                  onClick={solve}
                >
                  {busy ? "Searching…" : "Solve puzzle"}
                </button>
                {busy && (
                  <button
                    className="button"
                    onClick={() => {
                      terminate();
                      setBusy(false);
                      setNotice("Search cancelled. No solution was accepted.");
                    }}
                  >
                    Cancel search
                  </button>
                )}
              </div>
            </>
          )}
          <p role="status" className="twisty-status">
            {notice}
          </p>
          {error && (
            <p role="alert" className="error-note">
              {error}
            </p>
          )}
          {storageNote && <p className="muted">{storageNote}</p>}
        </section>
        <section
          className="panel twisty-view"
          id="twisty-solution-panel"
          aria-labelledby="twisty-position"
        >
          <div className="twisty-view-heading">
            <div>
              <span className="eyebrow">{PUZZLES[puzzle].label}</span>
              <h2 id="twisty-position">
                {result && step === result.moves.length
                  ? "Solved position"
                  : "Your puzzle"}
              </h2>
            </div>
            <span className="tag">Unfolded view</span>
          </div>
          <Board puzzle={puzzle} algorithm={algorithm} />
          <p className="muted">
            All faces are visible at once. Keep your orientation for face turns;
            reorient the whole puzzle when a rotation appears in the solution.
            Megaminx face labels mark fixed positions, not sticker colors.
          </p>
          <div className="twisty-section-heading">
            <span className="twisty-number">3</span>
            <h2>Follow the moves</h2>
          </div>
          {result ? (
            <>
              <p className="twisty-proof">
                {result.method === "jev-moves"
                  ? result.moves.length
                    ? "Verified · Jev-selected moves"
                    : "Already solved · No Jev request"
                  : "Verified · State search"}{" "}
                · {result.moves.length} moves
              </p>
              <div className="twisty-step-controls">
                <button
                  className="button"
                  aria-label="Previous solution step"
                  disabled={step === 0}
                  onClick={() => setStep((value) => value - 1)}
                >
                  <ChevronLeft size={18} /> Back
                </button>
                <span role="status">
                  Step {step} of {result.moves.length}
                </span>
                <button
                  className="button primary"
                  aria-label="Next solution step"
                  disabled={step === result.moves.length}
                  onClick={() => setStep((value) => value + 1)}
                >
                  Next <ChevronRight size={18} />
                </button>
              </div>
              <p className="twisty-next">
                {step < result.moves.length ? (
                  <>
                    Next turn <strong>{result.moves[step]}</strong>
                  </>
                ) : (
                  "All faces solved."
                )}
              </p>
              <div
                className="twisty-moves"
                role="group"
                aria-label="Solution steps"
              >
                {result.moves.map((move, index) => (
                  <button
                    className="button"
                    key={index}
                    aria-label={`Step ${index + 1}: ${move}`}
                    aria-current={step === index + 1 ? "step" : undefined}
                    onClick={() => setStep(index + 1)}
                  >
                    {move}
                  </button>
                ))}
              </div>
              <details>
                <summary>Copyable solution</summary>
                <pre className="twisty-solution">
                  {result.solution || "Already solved"}
                </pre>
              </details>
            </>
          ) : (
            <p className="muted">
              {liveMoves.length
                ? `${liveMoves.length} Jev moves applied. The puzzle is not yet solved.`
                : "Load a scramble, then run Jev or choose the local solver. Nothing runs automatically."}
            </p>
          )}
        </section>
      </div>
      <details className="panel twisty-help">
        <summary>Notation, instructions and solver limits</summary>
        <p>
          Start from a solved puzzle and apply your scramble in order. On cubes,
          R, L, U, D, F and B mean right, left, top, bottom, front and back.
          Turns are clockwise when looking directly at that face; an apostrophe
          reverses the turn. A cube turn is 90°; a Megaminx turn is 72°.
        </p>
        <p>
          The 4×4 accepts wide turns such as Rw (two layers together). Megaminx
          also accepts R++ / R-- and D++ / D-- competition-style turns, which
          move larger blocks and are different from a single-face R or D turn.
        </p>
        <p>
          Megaminx has twelve labeled faces: U, D, F, B, L, R, FL, FR, BL, BR,
          DL and DR. Match the move to the label on the diagram; FR is one face,
          not F followed by R. A 2 turns 144° clockwise; 2′ turns 144° in
          reverse. In solutions, a v suffix rotates the whole puzzle around that
          face’s axis: Rv turns it 72° clockwise as viewed toward R, and Uv′
          turns it 72° in reverse as viewed toward U. The next move uses the new
          orientation.
        </p>
        <p>
          In Local solver mode, all four puzzles use state search. The 4×4
          solves centers and pairs edges before a 3×3 handoff. In its solution,
          x and y rotate the whole cube in the direction of R and U
          respectively. No color-entry or camera input is available. Solutions
          are verified but are not guaranteed shortest. Center artwork
          orientation is ignored.
        </p>
        <p>
          Live Jev sends one closed-set choice request per move using your
          configured key. It receives piece state and one-turn outcomes, never a
          locally searched solution. Attempts stop after 40 moves; each queued
          request has a 45-second deadline. A legal move or high confidence does
          not prove progress. Provider errors and invalid choices stop the
          attempt; there is no local fallback.
        </p>
        <p>
          Practice scrambles use seeded random moves, not official competition
          random-state generation. Local search runs in a browser worker, stops
          after 60 seconds, and is cancelled when you switch puzzles, edit the
          draft, leave or hide this page. Drafts stay in this browser; search
          results are not restored.
        </p>
        <p>
          <a
            href="https://js.cubing.net/cubing/"
            target="_blank"
            rel="noreferrer"
          >
            Powered by cubing.js
          </a>
          . Puzzle rules and verification are local; Live Jev chooses the turns.
          Neither a single solved scramble nor the local comparison is a Jev
          capability benchmark.
        </p>
      </details>
    </div>
  );
}
