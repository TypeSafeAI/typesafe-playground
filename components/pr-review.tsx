"use client";
import { PrDecisionTrace, HunkDecisionTrace } from "./PrDecisionTrace";
import { useEffect, useRef, useState } from "react";
import {
  Download,
  GitPullRequest,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import { download, errorMessage, percent } from "../lib/client";
import { Empty, ErrorNote, Heading, RunButton } from "./ui";
import { ConfidenceBar } from "./ConfidenceBar";
import {
  aggregateReviewResults,
  buildHunkCandidates,
  DEFAULT_THRESHOLDS,
  LABELS,
  mockReviewResults,
  parsePullRequest,
  parseRepoRules,
  reviewPullRequest,
  routeForReview,
  SAMPLE_PR,
  SAMPLE_RULES,
  unclassified,
  validateThresholds,
  type Classification,
  type ParsedPullRequest,
  type RoutedReview,
  type Thresholds,
} from "../src/pr-review";

export function PullRequestReview() {
  const [diff, setDiff] = useState("");
  const source = /^https?:\/\//i.test(diff.trim()) ? "github" : "diff";
  const url = diff.trim();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rulesText, setRulesText] = useState("[]");
  const [pr, setPr] = useState<ParsedPullRequest | null>(null);
  const [results, setResults] = useState<Record<string, Classification>>({});
  const [mode, setMode] = useState<"mock" | "jev" | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [riskFilter, setRiskFilter] = useState("all");
  const [labelFilter, setLabelFilter] = useState("all");
  const [fileFilter, setFileFilter] = useState("all");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  let thresholdError = "";
  try {
    validateThresholds(thresholds);
  } catch (e) {
    thresholdError = errorMessage(e);
  }
  let ruleError = "";
  try {
    parseRepoRules(rulesText);
  } catch (e) {
    ruleError = errorMessage(e);
  }
  const hunks = pr?.files.flatMap((file) => file.hunks) || [];
  const routed = thresholdError
    ? []
    : Object.values(results).map((result) =>
        routeForReview(result, thresholds),
      );
  const summary = aggregateReviewResults(routed, hunks.length);
  const queue = routed.filter((result) => result.route !== "skip");
  const locked = busy || loading;
  function invalidate() {
    setPr(null);
    setResults({});
    setMode(null);
    setError("");
    setRiskFilter("all");
    setLabelFilter("all");
    setFileFilter("all");
  }
  async function inspect() {
    setError("");
    setLoading(true);
    setResults({});
    setMode(null);
    setPr(null);
    controller.current = new AbortController();
    try {
      parseRepoRules(rulesText);
      const parsed =
        source === "diff"
          ? parsePullRequest({ diff, title, description })
          : await (async () => {
              const response = await fetch("/api/pull-request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url }),
                signal: controller.current!.signal,
              });
              const data = await response.json();
              if (!response.ok) throw Error(data.error || "Could not load PR.");
              return data as ParsedPullRequest;
            })();
      setPr(parsed);
      setFileFilter("all");
      setRiskFilter("all");
      setLabelFilter("all");
      return parsed;
    } catch (e) {
      setError(errorMessage(e));
      return null;
    } finally {
      setLoading(false);
    }
  }
  async function run() {
    const current =
      source === "github" ? await inspect() : pr || (await inspect());
    if (!current) return;
    setError("");
    setResults({});
    setMode("jev");
    setBusy(true);
    controller.current = new AbortController();
    try {
      const rules = parseRepoRules(rulesText);
      validateThresholds(thresholds);
      await reviewPullRequest(current, rules, {
        signal: controller.current.signal,
        onResult: (result) =>
          setResults((current) => ({ ...current, [result.hunk.id]: result })),
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function demo() {
    setDiff(SAMPLE_PR.diff);
    setTitle(SAMPLE_PR.title);
    setDescription(SAMPLE_PR.description);
    setRulesText(JSON.stringify(SAMPLE_RULES, null, 2));
    setPr(parsePullRequest(SAMPLE_PR));
    setResults(
      Object.fromEntries(
        mockReviewResults().map((result) => [result.hunk.id, result]),
      ),
    );
    setMode("mock");
    setError("");
    setRiskFilter("all");
    setLabelFilter("all");
    setFileFilter("all");
  }
  const visible = hunks.filter((hunk) => {
    const classification = results[hunk.id];
    const route = routed.find((r) => r.result.hunk.id === hunk.id);
    const labels = classification
      ? classification.decisions
          .filter((d) => d.selected !== "not_applicable")
          .map((d) => d.selected)
      : ["unknown"];
    return (
      (fileFilter === "all" || fileFilter === hunk.path) &&
      (riskFilter === "all" || (route?.risk || "unknown") === riskFilter) &&
      (labelFilter === "all" ||
        labels.includes(labelFilter) ||
        (labelFilter === "unknown" && !!classification?.error))
    );
  });
  return (
    <div className="workspace pr-review-workspace">
      <Heading
        eyebrow="PR REVIEW LAB"
        title="Review the risky parts."
        description="Jev classifies each hunk. A configurable gate queues the hard cases for an LLM or human."
      >
        <button className="button" disabled={locked} onClick={demo}>
          <GitPullRequest size={16} />
          Run mock demo
        </button>
      </Heading>
      <ErrorNote message={error} />
      <div className="pr-review-layout">
        <section className="panel pr-input-panel">
          <div className="panel-heading">
            <h2>Review setup</h2>
            <span className="count">Closed-set only</span>
          </div>
          <div className="panel-content scroll">
            <fieldset disabled={locked}>
              <label htmlFor="pr-source">PR URL or diff</label>
              <textarea
                id="pr-source"
                className="code-input pr-diff-input"
                rows={5}
                maxLength={524288}
                value={diff}
                placeholder="https://github.com/owner/repo/pull/123 — or paste a unified diff"
                onChange={(e) => {
                  setDiff(e.target.value);
                  invalidate();
                }}
              />
              <p className="muted">
                Paste a public GitHub PR link and press Review. Its title,
                changed files, and hunks load automatically. Pasted diffs work
                too.
              </p>
              {source === "diff" && (
                <details className="disclosure">
                  <summary>Optional PR details</summary>
                  <label>
                    PR title
                    <input
                      maxLength={500}
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        invalidate();
                      }}
                    />
                  </label>
                  <label>
                    PR description
                    <textarea
                      rows={2}
                      maxLength={6000}
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                        invalidate();
                      }}
                    />
                  </label>
                </details>
              )}
              <details className="disclosure">
                <summary>Repository rules</summary>
                <p className="muted">
                  Optional rules: use [] for none. The mock demo includes
                  editable examples. Path globs support *; protected paths and
                  test requirements always need human verification.
                </p>
                <label>
                  Repository rules JSON
                  <textarea
                    className="code-input"
                    rows={8}
                    value={rulesText}
                    maxLength={26000}
                    onChange={(e) => {
                      setRulesText(e.target.value);
                      invalidate();
                    }}
                  />
                </label>
                <ErrorNote message={ruleError} />
              </details>
              <button
                className="button"
                disabled={!!ruleError}
                onClick={inspect}
              >
                Preview changes
              </button>
            </fieldset>
            {loading && (
              <p role="status">Loading public PR and verifying its snapshot…</p>
            )}
            <details className="review-thresholds disclosure">
              <summary>Advanced thresholds</summary>
              <h3>Routing thresholds</h3>
              <p className="muted">
                Uses the lower of Jev’s confidence and selected probability.
                Changes re-route existing results without another request.
              </p>
              <div className="threshold-fields">
                {(
                  [
                    ["safe", "Safe threshold"],
                    ["risk", "High-risk threshold"],
                    ["minimum", "Minimum confidence"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      min="0.5"
                      max="1"
                      step="0.01"
                      value={thresholds[key]}
                      onChange={(e) =>
                        setThresholds((current) => ({
                          ...current,
                          [key]: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <ErrorNote message={thresholdError} />
            </details>
            <p className="notice">
              Candidate decisions only. This lab creates review queues; it does
              not call a second LLM, approve, block, merge, or comment on
              GitHub.
            </p>
          </div>
          <div className="panel-bottom review-run-bar">
            <p className="muted">
              {pr
                ? `${hunks.filter((h) => h.complete).length} Jev requests · up to 3 in parallel`
                : "One click loads and reviews the PR."}
            </p>
            <RunButton
              busy={busy || loading}
              disabled={!diff.trim() || !!ruleError || !!thresholdError}
              onClick={run}
              onCancel={() => controller.current?.abort()}
            >
              Review PR
            </RunButton>
          </div>
        </section>
        <section className="panel pr-results-panel">
          <div className="panel-heading">
            <h2>Review decision</h2>
            <button
              className="button quiet"
              disabled={!mode || locked || !!thresholdError || !queue.length}
              onClick={() =>
                download("pr-review-queue.json", {
                  schemaVersion: 1,
                  mode,
                  pr: {
                    title: pr?.title,
                    description: pr?.description,
                    url: pr?.url,
                    headSha: pr?.headSha,
                    baseSha: pr?.baseSha,
                  },
                  rules: parseRepoRules(rulesText),
                  thresholds,
                  summary,
                  queue,
                })
              }
            >
              <Download size={14} />
              Export flagged hunks
            </button>
          </div>
          <div className="panel-content scroll">
            {!pr ? (
              <Empty title="Inspect a diff to begin">
                Paste a public PR or a unified diff, then choose Review PR. Try
                Run mock demo for a complete walkthrough without an API call.
              </Empty>
            ) : (
              <>
                <div className={`pr-verdict ${summary.decision}`}>
                  <span className="eyebrow">
                    {mode ? "PR CANDIDATE RESULT" : "AWAITING CLASSIFICATION"}
                  </span>
                  <strong>
                    {!mode
                      ? "Paste a PR to get started"
                      : busy
                        ? "Reviewing changes…"
                        : summary.decision === "block_candidate"
                          ? "Hold for human review"
                          : summary.decision === "approve_candidate"
                            ? "Candidate for approval"
                            : "Further review required"}
                  </strong>
                  {mode && (
                    <code>
                      {thresholdError ? "needs_review" : summary.decision}
                    </code>
                  )}
                  <div className="review-next-action">
                    {!mode
                      ? "Paste a link or diff, then choose Review PR."
                      : summary.pending
                        ? "Wait for the remaining hunks, or stop and export the incomplete review."
                        : queue.length
                          ? `Next: export ${queue.length} flagged hunk${queue.length === 1 ? "" : "s"} for ${summary.counts.human ? "human review" : "LLM review"}${summary.counts.human && summary.counts.llm ? " and the LLM queue" : ""}.`
                          : "Next: confirm this candidate through your normal approval process."}
                  </div>
                  <p>
                    {summary.pending
                      ? `${summary.pending} hunks still need classification. Unfinished reviews cannot approve.`
                      : "Based on this snapshot only. Model scores are not proof that a change is safe or faulty."}
                  </p>
                </div>
                {mode === "mock" && (
                  <p className="notice">
                    Mock results — no Jev request was made.
                  </p>
                )}
                <div className="review-progress" role="status">
                  {Object.keys(results).length} of {hunks.length} hunks
                  processed
                  {busy ? " · reviewing…" : ""}
                </div>
                <div className="review-metrics">
                  <div>
                    <ShieldCheck size={17} />
                    <strong>{summary.counts.skip}</strong>
                    <span>Skip expensive review</span>
                  </div>
                  <div>
                    <Workflow size={17} />
                    <strong>{summary.counts.llm}</strong>
                    <span>LLM queue</span>
                  </div>
                  <div>
                    <Users size={17} />
                    <strong>{summary.counts.human}</strong>
                    <span>Human queue</span>
                  </div>
                </div>
                {mode && !thresholdError && (
                  <PrDecisionTrace
                    results={routed}
                    pending={summary.pending}
                    thresholds={thresholds}
                    onInspect={(id) => {
                      setRiskFilter("all");
                      setLabelFilter("all");
                      setFileFilter("all");
                      requestAnimationFrame(() => {
                        const target = document.getElementById("pr-hunk-" + id);
                        target?.setAttribute("open", "");
                        target?.scrollIntoView({
                          block: "start",
                          behavior: matchMedia(
                            "(prefers-reduced-motion: reduce)",
                          ).matches
                            ? "instant"
                            : "smooth",
                        });
                      });
                    }}
                  />
                )}
                {pr && (
                  <div className="review-source-meta">
                    <h3>{pr.title}</h3>
                    <p>{pr.description}</p>
                    <span>
                      {pr.files.length} changed files · {hunks.length} hunks ·{" "}
                      {pr.url
                        ? `GitHub snapshot ${pr.headSha?.slice(0, 8)}`
                        : "Pasted diff only; full PR coverage is not verified."}
                    </span>
                  </div>
                )}
                <div className="review-filters">
                  <label>
                    Risk filter
                    <select
                      value={riskFilter}
                      onChange={(e) => setRiskFilter(e.target.value)}
                    >
                      <option value="all">All risks</option>
                      {["low", "medium", "high", "unknown"].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Label filter
                    <select
                      value={labelFilter}
                      onChange={(e) => setLabelFilter(e.target.value)}
                    >
                      <option value="all">All labels</option>
                      {[...LABELS, "unknown"].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Changed file
                    <select
                      value={fileFilter}
                      onChange={(e) => setFileFilter(e.target.value)}
                    >
                      <option value="all">All files</option>
                      {[...new Set(pr?.files.map((file) => file.path))].map(
                        (path) => (
                          <option key={path}>{path}</option>
                        ),
                      )}
                    </select>
                  </label>
                </div>
                <p className="muted">
                  {visible.length} of {hunks.length} hunks shown. Open a hunk
                  for the original diff and every scored decision.
                </p>
                {visible.map((hunk) => (
                  <HunkCard
                    key={hunk.id}
                    result={
                      results[hunk.id] ||
                      unclassified(
                        hunk,
                        buildHunkCandidates(hunk, []),
                        hunk.issue || "Not classified yet.",
                      )
                    }
                    thresholds={thresholds}
                    routed={routed.find(
                      (result) => result.result.hunk.id === hunk.id,
                    )}
                  />
                ))}
                {!visible.length && (
                  <div className="empty">
                    <h3>No matching hunks</h3>
                    <p>Adjust the risk, label, or file filter.</p>
                    {pr && (
                      <button
                        className="button"
                        onClick={() => {
                          setRiskFilter("all");
                          setLabelFilter("all");
                          setFileFilter("all");
                        }}
                      >
                        Clear review filters
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
function HunkCard({
  result,
  routed,
  thresholds,
}: {
  result: Classification;
  routed?: RoutedReview;
  thresholds: Thresholds;
}) {
  const positive = result.decisions.filter(
    (d) => d.selected !== "not_applicable",
  );
  const selected = [...new Set(positive.map((d) => d.selected))].map(
    (label) => {
      const group = positive.filter((d) => d.selected === label);
      return {
        selected: label,
        certainty: group.some((d) => d.certainty === null)
          ? null
          : Math.min(...group.map((d) => d.certainty!)),
      };
    },
  );
  const lines = result.hunk.diff.split("\n").slice(1);
  const added = lines.filter((line) => line.startsWith("+"));
  const removed = lines.filter((line) => line.startsWith("-"));
  const preview = [removed[0], added[0]].filter(Boolean);
  return (
    <details
      id={"pr-hunk-" + result.hunk.id}
      className={`hunk-card risk-${routed?.risk || "unknown"}`}
    >
      <summary>
        <div className="hunk-title">
          <strong>{result.hunk.path}</strong>
          <span>
            Line {result.hunk.oldStart} → {result.hunk.newStart} · +
            {added.length} / −{removed.length} · {routed?.risk || "unknown"}{" "}
            risk
          </span>
        </div>
        <span className="type-badge">
          {routed?.route === "skip"
            ? "Skip review"
            : routed?.route === "llm"
              ? "LLM review"
              : "Human review"}
        </span>
        <div className="hunk-overview">
          <div className="hunk-labels">
            {selected.length ? (
              selected.map((d) => (
                <span key={d.selected}>
                  {d.selected.replaceAll("_", " ")}{" "}
                  <strong>{percent(d.certainty)}</strong>
                </span>
              ))
            ) : (
              <span>unknown · unscored</span>
            )}
          </div>
          <p>{routed?.reason || result.error}</p>
          {!!preview.length && (
            <pre className="hunk-preview">
              {preview.map((line, i) => (
                <span
                  key={i}
                  className={
                    line.startsWith("+") ? "diff-added" : "diff-removed"
                  }
                >
                  {line}
                </span>
              ))}
            </pre>
          )}
          <small className="hunk-expand-label">
            Expand for the complete diff and decision scores
          </small>
        </div>
      </summary>
      <div className="hunk-detail">
        {routed && (
          <HunkDecisionTrace routed={routed} thresholds={thresholds} />
        )}
        <p className="muted">
          {result.source === "mock"
            ? "Mock fixture"
            : result.source === "jev"
              ? "Jev closed-set classification"
              : "Unclassified"}{" "}
          ·{" "}
          {result.hunk.previousPath &&
            `Previously ${result.hunk.previousPath} · `}
          Original file and hunk retained as evidence.
        </p>
        <div className="rule-evidence">
          <strong>Candidate rule: {result.rule.selected}</strong>
          <p>
            {result.candidates.rules[result.rule.selected] ||
              "No grounded rule selection available."}
          </p>
          <ConfidenceBar label="Confidence" value={result.rule.confidence} />
          <ConfidenceBar label="Probability" value={result.rule.probability} />
        </div>
        <div className="decision-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Decision</th>
                <th>Selected candidate</th>
                <th>Confidence</th>
                <th>Probability</th>
              </tr>
            </thead>
            <tbody>
              {result.decisions.map((d) => (
                <tr key={d.label}>
                  <td>{d.label}</td>
                  <td>{d.selected}</td>
                  <td>{percent(d.confidence)}</td>
                  <td>{percent(d.probability)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <pre
          className="diff-evidence"
          tabIndex={0}
          aria-label={`Original diff for ${result.hunk.path}`}
        >
          {result.hunk.diff.split("\n").map((line, i) => (
            <span
              key={i}
              className={
                line.startsWith("+")
                  ? "diff-added"
                  : line.startsWith("-")
                    ? "diff-removed"
                    : line.startsWith("@@")
                      ? "diff-header"
                      : ""
              }
            >
              {line}
              {"\n"}
            </span>
          ))}
        </pre>
      </div>
    </details>
  );
}
