"use client";
import { useUsage, usageBlocked } from "../lib/logUsageEntry";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownWideNarrow, Play, RotateCcw } from "lucide-react";
import { Heading, ErrorNote, Export } from "./ui";
import {
  sampleCandidates,
  parseCandidates,
  vectorRanking,
} from "../lib/rerank-data";
import { rerankWithJev } from "../lib/rerankWithJev";
import { rerankWithBaseline } from "../lib/rerankWithBaseline";
import { compareRankings } from "../lib/compareRankings";
import { RankComparison } from "./RankComparison";
import { RerankerGuide } from "./RerankerGuide";
import { MetricsPanel } from "./MetricsPanel";
import type { RankingRun } from "../types/rerank";
const sampleText = () => JSON.stringify(sampleCandidates(), null, 2);
export function RerankerModuleLab() {
  useUsage();
  const quotaBlocked = usageBlocked();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [query, setQuery] = useState("where is authentication handled?");
  const [raw, setRaw] = useState(sampleText);
  const [k, setK] = useState(100);
  const [jev, setJev] = useState<RankingRun | null>(null);
  const [baseline, setBaseline] = useState<RankingRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [cost, setCost] = useState(0);
  const [inspected, setInspected] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const parsed = useMemo(() => {
    try {
      return { candidates: parseCandidates(raw), error: "" };
    } catch (e) {
      return {
        candidates: [],
        error: e instanceof Error ? e.message : "Invalid JSON",
      };
    }
  }, [raw]);
  const candidates = useMemo(
    () =>
      vectorRanking(parsed.candidates)
        .candidates.slice(0, k)
        .map(({ id, text, vectorScore }) => ({ id, text, vectorScore })),
    [parsed, k],
  );
  const vector = useMemo(() => vectorRanking(candidates), [candidates]);
  const metrics = jev && baseline ? compareRankings(jev, baseline) : null;
  const flagged = new Set(metrics?.disagreements.map((c) => c.id) ?? []);
  const selected = candidates.find((c) => c.id === inspected);
  function invalidate() {
    setJev(null);
    setBaseline(null);
    setInspected("");
    setError("");
    setProgress(0);
  }
  async function run(method: "jev" | "baseline" | "both") {
    setError("");
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    if (method !== "baseline") {
      setBusy(true);
      setJev(null);
      setProgress(0);
      controller.current = new AbortController();
    }
    try {
      const input = { query, candidates };
      if (method !== "jev") setBaseline(rerankWithBaseline(input));
      if (method !== "baseline")
        setJev(
          await rerankWithJev(input, {
            signal: controller.current!.signal,
            onProgress: setProgress,
          }),
        );
    } catch (e) {
      setError(
        controller.current?.signal.aborted
          ? "Stopped. Run again to score the complete candidate set."
          : e instanceof Error
            ? e.message
            : "Reranking failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workspace compact-lab reranker-lab">
      <Heading
        eyebrow="Retrieval & relevance"
        title="Good matches. Better order."
        description="Compare the vector shortlist, Jev relevance, and a lexical baseline. Every result stays tied to its original snippet."
      />
      <div className="media-workbench">
        <section className="panel rerank-controls priority-input">
          <div className="panel-heading">
            <div>
              <ArrowDownWideNarrow size={18} />
              <h2>Blink search · reranker</h2>
            </div>
            <Export
              data={
                jev || baseline
                  ? {
                      query,
                      k: candidates.length,
                      vector,
                      jev,
                      baseline,
                      metrics,
                      estimatedJevCost:
                        cost > 0 && jev ? jev.requests * cost : null,
                      unitCost: cost,
                      baselineKind: "lexical mock",
                    }
                  : null
              }
              name="rerank-comparison.json"
            />
          </div>
          <div
            className="task-scroll"
            role="region"
            aria-label="Reranker inputs"
            tabIndex={0}
          >
            <fieldset disabled={busy}>
              <label>
                Search query
                <input
                  value={query}
                  maxLength={2000}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    invalidate();
                  }}
                />
              </label>
              <div className="rerank-options">
                <label>
                  Top-K candidates
                  <input
                    type="number"
                    min={20}
                    max={200}
                    step={20}
                    value={k}
                    onChange={(e) => {
                      setK(
                        Math.max(
                          20,
                          Math.min(200, Number(e.target.value) || 20),
                        ),
                      );
                      invalidate();
                    }}
                  />
                </label>
                <div className="rerank-dataset">
                  <strong>{candidates.length} candidates ready</strong>
                  <span>
                    {parsed.candidates.length} loaded · highest vector scores
                    first
                  </span>
                </div>
                <button
                  className="button"
                  onClick={() => {
                    setRaw(sampleText());
                    setQuery("where is authentication handled?");
                    setK(100);
                    invalidate();
                  }}
                >
                  <RotateCcw size={14} />
                  Load Blink sample
                </button>
              </div>
              <details className="rerank-input">
                <summary>Candidate data & cost settings</summary>
                <p className="muted">
                  Paste a JSON array with id, text, and vectorScore. The seed
                  contains 200 synthetic excerpts from a fictional repository;
                  the default shortlist uses 100. No repository or vector
                  database is queried.
                </p>
                <label>
                  Top-K candidate JSON
                  <textarea
                    rows={8}
                    maxLength={400000}
                    spellCheck={false}
                    value={raw}
                    onChange={(e) => {
                      setRaw(e.target.value);
                      invalidate();
                    }}
                  />
                </label>
                <label>
                  Estimated USD per Jev request
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.001"
                    value={cost}
                    onChange={(e) =>
                      setCost(
                        Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                      )
                    }
                  />
                </label>
                <p className="muted">
                  Default $0 is an unset estimate, not a pricing claim. Enter
                  your contracted per-request price. The local lexical mock
                  makes no paid API calls.
                </p>
              </details>
            </fieldset>
          </div>
          <div className="task-footer">
            <ErrorNote message={error || parsed.error} />
            <div className="inline-actions">
              <button
                className="button primary"
                disabled={
                  quotaBlocked || busy || !!parsed.error || !query.trim()
                }
                onClick={() => run("both")}
              >
                <Play size={15} />
                Compare both
              </button>
              <button
                className="button"
                disabled={
                  quotaBlocked || busy || !!parsed.error || !query.trim()
                }
                onClick={() => run("jev")}
              >
                Rerank with Jev
              </button>
              <button
                className="button"
                disabled={busy || !!parsed.error || !query.trim()}
                onClick={() => run("baseline")}
              >
                Rerank with baseline reranker
              </button>
              {busy && (
                <button
                  className="button"
                  onClick={() => controller.current?.abort()}
                >
                  Stop
                </button>
              )}
            </div>
            <p className="muted" role="status">
              {busy
                ? "Scoring " +
                  progress +
                  " / " +
                  candidates.length +
                  " candidates…"
                : "Jev classifies supplied snippets only. The baseline is a lexical mock, not a traditional neural reranker."}
            </p>
          </div>
        </section>
        <div
          className="media-results"
          role="region"
          aria-label="Rank comparison results"
          tabIndex={0}
        >
          <details className="workspace-more">
            <summary>Run metrics and comparison guide</summary>
            <MetricsPanel jev={jev} baseline={baseline} unitCost={cost} />
            <RerankerGuide />
          </details>
          {!!jev && jev.candidates.some((c) => c.score === null) && (
            <p className="notice" role="status">
              Some candidates are unscored. They appear last; comparison metrics
              are withheld until a complete run.
            </p>
          )}
          {selected && (
            <section
              className="panel rerank-inspector"
              aria-label="Candidate inspection"
            >
              <div className="panel-heading">
                <h2>Inspect this match</h2>
                <button
                  className="button quiet"
                  onClick={() => setInspected("")}
                >
                  Close inspection
                </button>
              </div>
              <div className="panel-content">
                <strong>{selected.id}</strong>
                <p>{selected.text}</p>
                <p>
                  Vector rank{" "}
                  {vector.candidates.findIndex((c) => c.id === selected.id) + 1}{" "}
                  · Jev rank{" "}
                  {jev
                    ? jev.candidates.findIndex((c) => c.id === selected.id) + 1
                    : "—"}{" "}
                  · Baseline rank{" "}
                  {baseline
                    ? baseline.candidates.findIndex(
                        (c) => c.id === selected.id,
                      ) + 1
                    : "—"}
                </p>
                <p className="muted">
                  Compare this unchanged source snippet against the query. A
                  rank difference is a reason to inspect, not evidence that
                  either method is correct.
                </p>
              </div>
            </section>
          )}
          <RankComparison
            showVectorTiming={hydrated}
            vector={vector}
            jev={jev}
            baseline={baseline}
            flagged={flagged}
            onInspect={setInspected}
          />
        </div>
      </div>
    </div>
  );
}
