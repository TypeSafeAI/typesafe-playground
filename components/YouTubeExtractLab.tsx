"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Heading, RunButton, ErrorNote } from "./ui";
import { limitNotes, type TranscriptFailure } from "../lib/youtubeErrors";
import { API_KEY_EVENT, apiKeyRevision } from "../lib/api-key";
import { runJev, errorMessage, percent } from "../lib/client";
import { estimateCost, reportedTokens } from "../lib/estimateCost";
import {
  chunkCaptions,
  readScores,
  scoringPayload,
  selectExtract,
  timestamp,
  videoId,
  type ScoredChunk,
  type Transcript,
} from "../lib/youtubeExtract";
const DRAFT = "youtube-extract-draft-v1";
export function YouTubeExtractLab() {
  const [url, setUrl] = useState("");
  const [length, setLength] = useState(15);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failure, setFailure] = useState<TranscriptFailure | null>(null);
  const [status, setStatus] = useState("Ready");
  const [phase, setPhase] = useState<
    "idle" | "retrieving" | "scoring" | "scored" | "stopped" | "cancelled"
  >("idle");
  const [source, setSource] = useState<Transcript | null>(null);
  const [chunks, setChunks] = useState<ScoredChunk[]>([]);
  const [raw, setRaw] = useState(false);
  const [calls, setCalls] = useState(0);
  const [tokens, setTokens] = useState(0);
  const [unknown, setUnknown] = useState(0);
  const [pending, setPending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const started = useRef(0);
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT) ?? "null");
      if (draft && typeof draft.url === "string")
        setUrl(draft.url.slice(0, 1000));
      if (
        Number.isInteger(draft?.length) &&
        draft.length >= 5 &&
        draft.length <= 100
      )
        setLength(draft.length);
    } catch {}
    setReady(true);
    const stop = () => {
      controller.current?.abort();
    };
    window.addEventListener(API_KEY_EVENT, stop);
    return () => {
      controller.current?.abort();
      window.removeEventListener(API_KEY_EVENT, stop);
    };
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(DRAFT, JSON.stringify({ url, length }));
      } catch {}
  }, [url, length, ready]);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(
      () => setElapsed(performance.now() - started.current),
      100,
    );
    return () => clearInterval(timer);
  }, [busy]);
  const result = useMemo(() => selectExtract(chunks, length), [chunks, length]);
  const processed = chunks.filter(
    (c) => c.score !== null && c.keyClaim !== null && c.confidence !== null,
  ).length;
  function reset() {
    setSource(null);
    setChunks([]);
    setCalls(0);
    setTokens(0);
    setUnknown(0);
    setPending(false);
    setElapsed(0);
    setStatus("Ready");
    setError("");
    setFailure(null);
    setPhase("idle");
  }
  async function run() {
    if (controller.current) return;
    reset();
    const abort = new AbortController();
    controller.current = abort;
    const revision = apiKeyRevision();
    const active = () => !abort.signal.aborted && revision === apiKeyRevision();
    setBusy(true);
    started.current = performance.now();
    setPhase("retrieving");
    setStatus("Step 1 of 3 · Retrieving the existing caption track");
    let inFlight = false;
    try {
      videoId(url);
      const response = await fetch("/api/youtube-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: abort.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        if (data?.cause && data?.detail) setFailure(data as TranscriptFailure);
        throw Error(data?.error ?? "Caption retrieval failed.");
      }
      if (!active()) return;
      const transcript = data as Transcript;
      if (transcript.videoId !== videoId(url))
        throw Error("Caption video does not match the requested source.");
      const natural = chunkCaptions(transcript.lines);
      let rows: ScoredChunk[] = natural.map((c) => ({
        ...c,
        score: null,
        keyClaim: null,
        confidence: null,
      }));
      setSource(transcript);
      setChunks(rows);
      for (const c of natural) {
        if (!active()) break;
        if (!c.text) continue;
        setPhase("scoring");
        setStatus(
          `Step 2 of 3 · Scoring chunk ${c.id + 1} of ${natural.length} — one Jev request each`,
        );
        setCalls((v) => v + 1);
        setPending(true);
        inFlight = true;
        const answer = await runJev(
          scoringPayload(c, transcript.title, natural),
          abort.signal,
        );
        if (!active()) break;
        inFlight = false;
        setPending(false);
        const count = reportedTokens(
          answer?._playgroundUsage?.inputTokens ?? answer?.usage?.input_tokens,
        );
        if (count === null) setUnknown((v) => v + 1);
        else setTokens((v) => v + count);
        const scores = readScores(answer);
        rows = rows.map((row) =>
          row.id === c.id ? { ...row, ...scores } : row,
        );
        setChunks(rows);
        if (
          scores.score === null ||
          scores.keyClaim === null ||
          scores.confidence === null
        )
          throw Error(
            `Chunk ${c.id + 1} returned incomplete scoring. The run is incomplete; unknown chunks are not selected.`,
          );
      }
      if (active()) {
        setPhase("scored");
        setStatus(
          "Step 3 of 3 · Scored. Selection runs locally; compare kept and dropped passages against the source.",
        );
      }
    } catch (e) {
      if (active()) {
        setError(errorMessage(e));
        setPhase("stopped");
        setStatus(
          "Stopped · scoring did not finish, so unknown chunks are not selected",
        );
      }
    } finally {
      if (inFlight) {
        setUnknown((v) => v + 1);
        setPending(false);
      }
      if (!active()) {
        setPhase("cancelled");
        setStatus(
          "Cancelled · partial results only, nothing selected from unscored chunks",
        );
      }
      setElapsed(performance.now() - started.current);
      setBusy(false);
      controller.current = null;
    }
  }
  return (
    <div className="workspace compact-lab youtube-extract-lab">
      <Heading
        eyebrow="Language & data · extractive prototype"
        title="Keep the words. Find the point."
        description="Existing YouTube captions → Jev relevance decisions → a chronological extract. No generated prose, transcription, or translation."
      />
      <section className="panel">
        <div className="panel-heading">
          <h2>YouTube extract</h2>
          <span className="muted">Live Jev · two questions per call</span>
        </div>
        <div className="panel-content">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <label htmlFor="youtube-url">YouTube URL</label>
            <input
              id="youtube-url"
              type="url"
              required
              maxLength={1000}
              placeholder="https://www.youtube.com/watch?v=…"
              value={url}
              disabled={busy}
              onChange={(e) => {
                setUrl(e.target.value);
                reset();
              }}
            />
            <p className="muted">
              Public captions only, never transcription or translation. Caption
              access can be blocked by YouTube. Running sends caption text to
              TypeSafe.
            </p>
            <details className="disclosure extract-limits">
              <summary>Limits before a run</summary>
              <dl>
                {limitNotes.map((limit) => (
                  <div key={limit.label}>
                    <dt>
                      {limit.label} <strong>{limit.value}</strong>
                    </dt>
                    <dd>{limit.note}</dd>
                  </div>
                ))}
              </dl>
              <p className="muted">
                A track over any of these fails and names which one. Nothing is
                truncated to fit.
              </p>
            </details>
            <RunButton
              busy={busy}
              disabled={!ready || !url.trim()}
              onCancel={() => controller.current?.abort()}
            >
              Create extract · Live Jev
            </RunButton>
          </form>
          <label htmlFor="extract-length">
            Extract length · top {length}% of all chunks
          </label>
          <input
            id="extract-length"
            type="range"
            min="5"
            max="100"
            step="5"
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
          />
          <p className="muted">
            Recomputes locally without more calls. Relevance ≥ 50%; word-overlap
            duplicates above 60% are dropped. Key claims are shown for
            inspection, not used as a selection gate.
          </p>
          <ErrorNote message={error} />
          {failure && (
            <div
              className="extract-failure"
              role="group"
              aria-label="Failure detail"
            >
              <dl>
                <div>
                  <dt>Cause</dt>
                  <dd>
                    <code>{failure.cause}</code>
                  </dd>
                </div>
                {failure.limit && (
                  <div>
                    <dt>Limit</dt>
                    <dd>
                      {failure.limit.actual.toLocaleString()} of{" "}
                      {failure.limit.allowed.toLocaleString()}{" "}
                      {failure.limit.name}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Why</dt>
                  <dd>{failure.detail}</dd>
                </div>
                <div>
                  <dt>Next</dt>
                  <dd>{failure.fix}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </section>
      <section className="panel" aria-label="Run metrics">
        <div className="panel-content">
          <p role="status">{status}</p>
          <dl className="extract-metrics">
            <div>
              <dt>Chunks processed</dt>
              <dd>
                {processed} / {chunks.length}
              </dd>
            </div>
            <div>
              <dt>Chunks kept</dt>
              <dd>{result.kept.length}</dd>
            </div>
            <div>
              <dt>Average kept relevance</dt>
              <dd>{percent(result.average)}</dd>
            </div>
            <div>
              <dt>Jev calls attempted</dt>
              <dd data-testid="extract-calls">{calls}</dd>
            </div>
            <div>
              <dt>Input cost estimate</dt>
              <dd>
                ${estimateCost(tokens).toFixed(6)}
                {unknown > 0 || pending ? " + unknown" : ""}
              </dd>
            </div>
            <div>
              <dt>Elapsed</dt>
              <dd>{(elapsed / 1000).toFixed(1)}s</dd>
            </div>
          </dl>
          <p className="muted">
            Reported input tokens only; excludes output and hosting costs. Not
            an invoice. {unknown} calls with unknown usage
            {pending ? "; one call pending" : ""}.
          </p>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>{phase === "scored" ? "Extract" : "Extract preview"}</h2>
        </div>
        <div className="panel-content">
          {source && (
            <p>
              {source.title} · {source.language} ·{" "}
              {source.automatic
                ? "Existing automatic captions"
                : "Existing manual captions"}
            </p>
          )}
          <p className="extract-text" data-testid="extract-text">
            {result.text ||
              (chunks.length
                ? "No eligible chunks selected."
                : "Your source-linked extract will appear here.")}
          </p>
          <p className="muted">
            An extract can omit critical context. Jev scores and confidence are
            not verification. Compare kept and dropped passages with the video.
            Cleanup removes fillers conservatively; joining adds whitespace
            only, preserving existing source transitions.
          </p>
          {!!result.kept.length && (
            <ul className="extract-sources">
              {result.kept.map((c) => (
                <li key={c.id}>
                  <a
                    href={`https://www.youtube.com/watch?v=${source!.videoId}&t=${Math.floor(c.start)}s`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {timestamp(c.start)} · View source
                  </a>
                  <p>{c.text}</p>
                  <details>
                    <summary>Original captions</summary>
                    <p>{c.original}</p>
                  </details>
                </li>
              ))}
            </ul>
          )}
          <label className="extract-toggle">
            <input
              type="checkbox"
              checked={raw}
              onChange={(e) => setRaw(e.target.checked)}
            />{" "}
            Show raw scored chunks
          </label>
          {raw && (
            <div
              className="extract-raw"
              tabIndex={0}
              aria-label="All scored chunks"
            >
              {chunks.map((c) => (
                <article key={c.id}>
                  <h3>
                    <a
                      href={`https://www.youtube.com/watch?v=${source!.videoId}&t=${Math.floor(c.start)}s`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {timestamp(c.start)}
                    </a>{" "}
                    · {result.reasons[c.id]}
                  </h3>
                  <p>{c.text || "(Empty after cleanup)"}</p>
                  <p className="muted">
                    Relevance: {percent(c.score)} · Key claim:{" "}
                    {c.keyClaim === null
                      ? "unknown"
                      : c.keyClaim
                        ? "yes"
                        : "no"}{" "}
                    · Confidence: {percent(c.confidence)}
                  </p>
                  <details>
                    <summary>
                      Original · caption lines{" "}
                      {c.lineIds.map((i) => i + 1).join(", ")}
                    </summary>
                    <p>{c.original}</p>
                  </details>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
