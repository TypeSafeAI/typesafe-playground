"use client";
import { useEffect, useRef, useState } from "react";
import { API_KEY_EVENT, apiKeyRevision } from "../lib/api-key";
import { runJev, errorMessage, percent } from "../lib/client";
import { useUsage, usageBlocked } from "../lib/logUsageEntry";
import {
  parseMoves,
  type PuzzleId,
  type PuzzleResult,
} from "../lib/twisty/contracts";
import {
  buildTwistyPayload,
  MAX_JEV_MOVES,
  resolveTwistyChoice,
} from "../lib/twisty/jev";
import { solved } from "../lib/twisty/state";

type Receipt = ReturnType<typeof resolveTwistyChoice>;

export function TwistyJevPlayer({
  puzzle,
  scramble,
  disabled,
  onMoves,
  onSolved,
}: {
  puzzle: PuzzleId;
  scramble: string;
  disabled: boolean;
  onMoves: (moves: string[]) => void;
  onSolved: (result: PuzzleResult) => void;
}) {
  useUsage();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [notice, setNotice] = useState(
    "One real Jev request per move. Nothing runs until you press a control.",
  );
  const [error, setError] = useState("");
  const history = useRef<Receipt[]>([]);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);

  function stop() {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
  }

  useEffect(() => {
    let revision = apiKeyRevision();
    function visibility() {
      if (document.hidden && controller.current) {
        stop();
        setNotice(
          "Jev paused because the page was hidden. Applied moves are retained.",
        );
      }
    }
    function keyChanged() {
      const next = apiKeyRevision();
      if (revision === next) return;
      revision = next;
      stop();
      setNotice(
        "API key changed. Pending answers were discarded; resume explicitly.",
      );
    }
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
  }, []);

  async function play(one: boolean) {
    if (
      controller.current ||
      disabled ||
      finished ||
      history.current.length >= MAX_JEV_MOVES
    )
      return;
    const active = new AbortController();
    controller.current = active;
    const gen = ++generation.current;
    const revision = apiKeyRevision();
    const current = () => {
      if (generation.current !== gen || apiKeyRevision() !== revision)
        return false;
      if (active.signal.aborted) throw Error("Jev request timed out.");
      return true;
    };
    setBusy(true);
    setError("");
    setNotice("Preparing the current puzzle state…");
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      deadline = setTimeout(() => active.abort(), 45_000);
      const { puzzles } = await import("cubing/puzzles");
      const kpuzzle = await puzzles[puzzle].kpuzzle();
      if (!current()) return;
      let pattern = kpuzzle
        .defaultPattern()
        .applyAlg(parseMoves(puzzle, scramble).join(" "))
        .applyAlg(history.current.map((entry) => entry.move).join(" "));
      const complete = () => {
        const moves = history.current.map((entry) => entry.move);
        setFinished(true);
        setNotice(
          moves.length
            ? "Solved by Jev-selected moves; the complete puzzle state is independently verified."
            : "Already solved. No Jev request was needed.",
        );
        onSolved({
          puzzle,
          scramble,
          moves,
          solution: moves.join(" "),
          method: "jev-moves",
          verified: true,
        });
      };
      if (solved(pattern, puzzle)) {
        complete();
        return;
      }
      do {
        if (!current()) return;
        if (usageBlocked())
          throw Error("Live Jev calls are paused. Open Usage in the header.");
        clearTimeout(deadline);
        deadline = setTimeout(() => active.abort(), 45_000);
        const moves = history.current.map((entry) => entry.move);
        setNotice(
          `Asking Jev for move ${moves.length + 1} of at most ${MAX_JEV_MOVES}…`,
        );
        const response = await runJev(
          buildTwistyPayload(puzzle, pattern, moves),
          active.signal,
        );
        if (!current()) return;
        const receipt = resolveTwistyChoice(puzzle, response);
        pattern = pattern.applyMove(receipt.move);
        history.current = [...history.current, receipt];
        setReceipts(history.current);
        onMoves(history.current.map((entry) => entry.move));
        if (solved(pattern, puzzle)) {
          complete();
          return;
        }
        if (one) break;
      } while (history.current.length < MAX_JEV_MOVES);
      setNotice(
        history.current.length === MAX_JEV_MOVES
          ? `Incomplete: reached the ${MAX_JEV_MOVES}-move limit. The puzzle is not solved. Load a scramble to start a new attempt.`
          : "Jev move applied. The puzzle is not solved; continue when ready.",
      );
    } catch (e) {
      if (generation.current !== gen) return;
      setError(
        active.signal.aborted
          ? "Jev reached the 45-second request limit. No pending move was applied."
          : errorMessage(e),
      );
      setNotice(
        "Attempt stopped without a verified solution. Applied moves are retained; no local fallback ran.",
      );
    } finally {
      clearTimeout(deadline);
      if (generation.current === gen) {
        controller.current = null;
        setBusy(false);
        // A key revision changed without a delivered browser event.
        if (apiKeyRevision() !== revision)
          setNotice(
            "API key changed. Pending answers were discarded; resume explicitly.",
          );
      }
    }
  }

  return (
    <div className="twisty-jev">
      <p className="muted">
        Jev chooses each legal turn from the current piece state and one-turn
        outcomes. Local code checks the result; it does not search for Jev’s
        moves. Hard scrambles may remain unsolved.
      </p>
      <div className="twisty-actions">
        <button
          className="button primary"
          disabled={
            disabled ||
            busy ||
            finished ||
            receipts.length >= MAX_JEV_MOVES ||
            usageBlocked()
          }
          onClick={() => void play(false)}
        >
          Run Jev · up to 40 moves
        </button>
        <button
          className="button"
          disabled={
            disabled ||
            busy ||
            finished ||
            receipts.length >= MAX_JEV_MOVES ||
            usageBlocked()
          }
          onClick={() => void play(true)}
        >
          One Jev move
        </button>
        {busy && (
          <button
            className="button"
            onClick={() => {
              stop();
              setNotice(
                "Jev paused. Pending answers were discarded; applied moves are retained.",
              );
            }}
          >
            Pause Jev
          </button>
        )}
      </div>
      {usageBlocked() && (
        <p className="muted">
          Live Jev calls are paused. Open Usage in the header.
        </p>
      )}
      <p role="status" className="twisty-jev-status">
        {notice}
      </p>
      {error && (
        <p role="alert" className="error-note">
          {error}
        </p>
      )}
      <p className="muted">
        {receipts.length} Jev moves applied · requested model jev-latest · usage
        recorded in the header
      </p>
      {receipts.length > 0 && (
        <details className="twisty-receipts">
          <summary>Jev decision receipts ({receipts.length})</summary>
          <ol>
            {receipts.map((receipt, index) => (
              <li key={index}>
                <strong>{receipt.move}</strong> · confidence{" "}
                {percent(receipt.confidence)} · returned model{" "}
                {receipt.model ?? "not reported"}
                <details>
                  <summary>Move probabilities</summary>
                  <pre className="twisty-solution">
                    {JSON.stringify(receipt.probabilities, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
