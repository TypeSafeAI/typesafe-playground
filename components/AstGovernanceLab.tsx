"use client";
import { useUsage, usageBlocked } from "../lib/logUsageEntry";
import { revealResults } from "../lib/scroll";
import { useEffect, useRef, useState } from "react";
import { Heading, ErrorNote, RunButton, Export, Empty } from "./ui";
import { DiffInput } from "./DiffInput";
import { ReviewResults } from "./ReviewResults";
import { analyzeGovernance } from "../lib/analyzeImpact";
import {
  GOVERNANCE_SAMPLE,
  GOVERNANCE_MANIFEST,
  mockGovernanceResults,
} from "../lib/governanceSample";
import { buildGovernanceUnits, classifyWithJev } from "../lib/classifyWithJev";
import { createMockVerifiedRun, testCache } from "../lib/testCache";
import { errorMessage } from "../lib/client";
import type { GovernanceAnalysis, GovernanceInput } from "../types/governance";
import type { GovernanceDecision, TestCacheResult } from "../types/review";
import type { VerifiedRun } from "../types/ast";
const sample: GovernanceInput = {
  ...GOVERNANCE_SAMPLE,
  manifest: JSON.stringify(GOVERNANCE_MANIFEST, null, 2),
  policy: "[]",
};
export function AstGovernanceLab() {
  useUsage();
  const quotaBlocked = usageBlocked();
  const [input, setInput] = useState(sample),
    [analysis, setAnalysis] = useState<GovernanceAnalysis | null>(null),
    [decisions, setDecisions] = useState<GovernanceDecision[]>([]),
    [cache, setCache] = useState<TestCacheResult | null>(null),
    [prior, setPrior] = useState<VerifiedRun>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [threshold, setThreshold] = useState(0.85);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function inspect(mock = false) {
    setBusy(true);
    setError("");
    setAnalysis(null);
    setDecisions([]);
    try {
      const a = await analyzeGovernance(mock ? sample : input);
      if (mock) setInput(sample);
      setAnalysis(a);
      setCache(await testCache(a, prior));
      if (mock) setDecisions(mockGovernanceResults(a));
      revealResults("governance-results");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function classify() {
    if (!analysis) return;
    setBusy(true);
    setError("");
    setDecisions([]);
    const controller = new AbortController();
    abort.current = controller;
    const units = buildGovernanceUnits(analysis);
    let cursor = 0;
    const output: GovernanceDecision[] = [];
    await Promise.all(
      Array.from({ length: Math.min(3, units.length) }, async () => {
        while (cursor < units.length) {
          const unit = units[cursor++];
          let d: GovernanceDecision;
          try {
            if (controller.signal.aborted)
              throw Error("Cancelled; human review required.");
            d = await classifyWithJev(
              unit,
              analysis,
              undefined,
              controller.signal,
            );
          } catch (e) {
            d = {
              unit,
              outcome: "needs_human_review",
              confidence: null,
              probability: null,
              source: "unclassified",
              error: errorMessage(e),
            };
          }
          output.push(d);
          setDecisions([...output]);
        }
      }),
    );
    setBusy(false);
    revealResults("governance-results");
  }
  async function simulate() {
    if (!analysis) return;
    setError("");
    try {
      const p = await createMockVerifiedRun(analysis);
      setPrior(p);
      setCache(await testCache(analysis, p));
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <div className="workspace governance-workspace compact-lab">
      <Heading
        eyebrow="STATIC ANALYSIS + CLOSED-SET ROUTING"
        title="AST-aware governance"
        description="Understand what a code change affects, why it needs review, and what to check before merging."
      />
      <ol className="governance-steps" aria-label="How governance works">
        <li>
          <span>1</span>
          <div>
            <strong>Map the change</strong>
            <p>
              Read the diff and supplied symbol index to connect functions to
              callers.
            </p>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>Apply fixed rules</strong>
            <p>
              Check sensitive paths, public interfaces and related test updates
              first.
            </p>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>Classify uncertainty</strong>
            <p>Jev selects a fixed label. Low confidence goes to a human.</p>
          </div>
        </li>
        <li>
          <span>4</span>
          <div>
            <strong>Review the evidence</strong>
            <p>
              Use the recommendation and linked hunks. No merge or test is
              executed.
            </p>
          </div>
        </li>
      </ol>
      <div className="lab-columns">
        <section className="panel lab-panel">
          <div className="panel-heading">
            <h2>Proposed change</h2>
            <button
              className="button quiet"
              disabled={busy}
              onClick={() => inspect(true)}
            >
              Run mock demo
            </button>
          </div>
          <p className="field-hint">
            Start with the seeded auth change or paste your own diff. “Analyze
            changes” runs local static checks; “Classify with Jev” sends only
            the relevant structured context.
          </p>
          <details className="governance-explainer">
            <summary>What does “AST-aware” mean here?</summary>
            <p>
              An abstract syntax tree represents code as named structures such
              as functions, parameters and imports. This prototype uses a
              lightweight parser plus your manifest, not a full compiler or a
              live repository checkout.
            </p>
            <p>
              The manifest lists known symbols (named code units), callers (code
              that uses them), and test mappings. Missing information stays
              unknown; the app does not discover your whole repository.
            </p>
            <p>
              <strong>Demo story:</strong> createUser gains organizationId. The
              registration caller is updated, the invitation job is unchanged,
              and no tests are updated. Expect human review.
            </p>
          </details>
          <DiffInput
            value={input}
            disabled={busy}
            onChange={(v) => {
              setInput(v);
              setAnalysis(null);
              setDecisions([]);
              setCache(null);
              setError("");
            }}
          />
          <ErrorNote message={error} />
          <div className="lab-actions">
            <RunButton
              usesJev={false}
              busy={busy}
              onClick={() => inspect()}
              disabled={!input.diff.trim()}
            >
              Analyze changes
            </RunButton>
            {analysis && (
              <button
                className="button"
                disabled={
                  quotaBlocked ||
                  busy ||
                  analysis.checks.blocked ||
                  !buildGovernanceUnits(analysis).length
                }
                onClick={classify}
              >
                Classify with Jev
              </button>
            )}
            {busy && (
              <button className="button" onClick={() => abort.current?.abort()}>
                Stop classification
              </button>
            )}
          </div>
          <p className="field-hint">
            {analysis?.checks.blocked
              ? "Sensitive-file rule triggered: Jev is disabled for this proposal."
              : analysis
                ? `${buildGovernanceUnits(analysis).length} focused classifications available. The mock demo makes no API calls; Classify with Jev replaces demo labels with live predictions.`
                : "Try Run mock demo for a complete walkthrough without API calls."}
          </p>
          <label className="threshold-control">
            Minimum confidence{" "}
            <input
              type="number"
              min="0.5"
              max="1"
              step="0.01"
              value={threshold}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 0.5 && n <= 1) setThreshold(n);
              }}
            />
          </label>
          <p className="field-hint">
            Both the selected-label probability and confidence must meet this
            threshold. A higher score never overrides a policy finding.
          </p>
        </section>
        <section
          id="governance-results"
          className="panel lab-panel lab-result-target"
        >
          <div className="panel-heading">
            <h2>Governance decision</h2>
            <Export
              name="governance-analysis.json"
              data={
                analysis
                  ? { analysis, decisions, cache, simulatedVerifiedRun: prior }
                  : null
              }
            />
          </div>
          {analysis ? (
            <ReviewResults
              analysis={analysis}
              decisions={decisions}
              threshold={threshold}
              cache={cache}
              onSimulate={simulate}
              busy={busy}
            />
          ) : (
            <Empty title="Follow the change through the codebase">
              Analyze a diff to see symbols, callers, activated policy and test
              scope.
            </Empty>
          )}
        </section>
      </div>
    </div>
  );
}
