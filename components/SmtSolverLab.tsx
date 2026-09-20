"use client";
import { useUsage, usageBlocked } from "../lib/logUsageEntry";
import { revealResults } from "../lib/scroll";
import { useEffect, useMemo, useRef, useState } from "react";
import { Heading, RunButton, ErrorNote, Export } from "./ui";
import { SOLVER_EXAMPLES } from "../lib/smt/examples";
import {
  Braces,
  ToggleLeft,
  Equal,
  ArrowDownUp,
  CalendarDays,
} from "lucide-react";
import {
  CONSTRAINT_TYPES,
  parseConstraints,
  type ConstraintType,
} from "../lib/smt/parser";
import { runSolverCheck, type SolverRun } from "../lib/smt/runner";
import { errorMessage, percent } from "../lib/client";
const typeNames = {
  boolean: "Boolean logic",
  integer: "Integer arithmetic",
  equality: "Equality checks",
  ordering: "Ordering constraints",
  scheduling: "Simple scheduling conflicts",
};
const scenarioDescriptions = [
  "Can one number fit two impossible bounds?",
  "Are everyone’s availability flags consistent?",
  "Can equal values disagree at the same time?",
  "Can three tasks follow this sequence?",
  "Can these meetings share the same room?",
];
const scenarioIcons = [Braces, ToggleLeft, Equal, ArrowDownUp, CalendarDays];
const ms = (n: number) => `${Math.round(n)} ms`;
export function SmtSolverLab() {
  useUsage();
  const quotaBlocked = usageBlocked();
  const [text, setText] = useState(SOLVER_EXAMPLES[0].text),
    [type, setType] = useState<ConstraintType>("integer"),
    [decompose, setDecompose] = useState(true),
    [proof, setProof] = useState(false),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [result, setResult] = useState<SolverRun | null>(null),
    [bench, setBench] = useState<{ name: string; run: SolverRun }[]>([]);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  function invalidate() {
    setBench([]);
    setResult(null);
    setError("");
    setProgress("");
  }
  async function run(benchmark = false) {
    setBusy(true);
    setError("");
    setProgress("Classifying constraints…");
    if (benchmark) setBench([]);
    else setResult(null);
    const controller = new AbortController();
    abort.current = controller;
    try {
      if (benchmark) {
        for (const example of SOLVER_EXAMPLES) {
          setProgress(`Benchmark: ${example.name}`);
          const r = await runSolverCheck(
            example.text,
            example.type,
            decompose,
            proof,
            controller.signal,
            (s) => setProgress(`${example.name} · ${s}`),
          );
          setBench((old) => [...old, { name: example.name, run: r }]);
        }
      } else
        setResult(
          await runSolverCheck(
            text,
            type,
            decompose,
            proof,
            controller.signal,
            setProgress,
          ),
        );
      setProgress("Complete");
      revealResults(benchmark ? "solver-benchmark" : "solver-results");
    } catch (e) {
      setError(
        controller.signal.aborted
          ? "Stopped. Incomplete checks are not results."
          : errorMessage(e),
      );
      setProgress("");
    } finally {
      setBusy(false);
    }
  }
  const parsed = useMemo(() => {
    try {
      return parseConstraints(text, type);
    } catch {
      return null;
    }
  }, [text, type]);
  const activeScenario = SOLVER_EXAMPLES.findIndex(
    (ex) => ex.text === text && ex.type === type,
  );
  function chooseScenario(index: number) {
    const ex = SOLVER_EXAMPLES[index];
    setText(ex.text);
    setType(ex.type);
    invalidate();
  }
  const eligible = bench.filter((b) => b.run.routing.agreement !== null),
    agreements = eligible.filter((b) => b.run.routing.agreement).length;
  return (
    <div className="workspace compact-lab smt-workspace">
      <Heading
        eyebrow="EXACT VERIFICATION + PROBABILISTIC TRIAGE"
        title="SMT solver lab"
        description="Can every constraint be true at once? Compare Jev’s prediction with Z3’s exact check."
      />
      <div className="solver-scenarios" aria-label="Choose a logic scenario">
        {SOLVER_EXAMPLES.map((ex, i) => {
          const Icon = scenarioIcons[i];
          return (
            <button
              key={ex.name}
              className={
                "solver-scenario " + (activeScenario === i ? "selected" : "")
              }
              aria-label={ex.name}
              aria-pressed={activeScenario === i}
              disabled={busy}
              onClick={() => chooseScenario(i)}
            >
              <span className="scenario-icon">
                <Icon size={18} />
              </span>
              <strong>{ex.name}</strong>
              <span>{scenarioDescriptions[i]}</span>
            </button>
          );
        })}
      </div>
      <div className="lab-columns">
        <section className="panel lab-panel">
          <div className="panel-heading">
            <h2>Build your logic puzzle</h2>
            <span className="tag">Z3 + Jev</span>
          </div>
          <fieldset className="lab-fields" disabled={busy}>
            <div className="solver-question">
              <span className="eyebrow">THE QUESTION</span>
              <h3>
                {activeScenario >= 0
                  ? scenarioDescriptions[activeScenario]
                  : "Can all of these rules be true at once?"}
              </h3>
              <p>
                A constraint is a rule that must hold. Add one per line, then
                compare a fast prediction with an exact check.
              </p>
            </div>
            <label>
              Constraint type
              <select
                aria-label="Constraint type"
                value={type}
                onChange={(e) => {
                  setType(e.target.value as ConstraintType);
                  invalidate();
                }}
              >
                {CONSTRAINT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {typeNames[t]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="rules-editor-label">
                <span>Your rules</span>
                <span>
                  {parsed
                    ? parsed.constraints.length +
                      " rules · " +
                      parsed.variables.length +
                      " variables"
                    : "One rule per line"}
                </span>
              </span>
              <textarea
                aria-label="Constraints"
                rows={9}
                maxLength={12000}
                spellCheck={false}
                onKeyDown={(e) => {
                  if (
                    (e.metaKey || e.ctrlKey) &&
                    e.key === "Enter" &&
                    !busy &&
                    text.trim()
                  ) {
                    e.preventDefault();
                    void run();
                  }
                }}
                className="code-input"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  invalidate();
                }}
              />
            </label>
            <p className="field-hint">
              Use true / false or whole numbers. Up to 60 rules and 40
              variables. ⌘ / Ctrl + Enter runs the check.
            </p>
            <details className="solver-options">
              <summary>
                Check options{" "}
                <span className="tag">Exact verification always on</span>
              </summary>
              <div className="solver-option-fields">
                <label className="lab-checkbox">
                  <input
                    type="checkbox"
                    checked={decompose}
                    onChange={(e) => {
                      setDecompose(e.target.checked);
                      invalidate();
                    }}
                  />{" "}
                  Classify independent groups in parallel
                </label>
                <label className="lab-checkbox">
                  <input
                    type="checkbox"
                    checked={proof}
                    onChange={(e) => {
                      setProof(e.target.checked);
                      invalidate();
                    }}
                  />{" "}
                  Full exact check required
                </label>
              </div>
            </details>
            <details>
              <summary>Need help writing a rule?</summary>
              <p>
                Use =, ==, !=, &lt;, &lt;=, &gt;, &gt;=, +, -, multiplication by
                an integer, parentheses, !, &amp;&amp;, || and =&gt;.
              </p>
              <code>(a_end &lt;= b_start) || (b_end &lt;= a_start)</code>
              <p>
                This explicitly requires two meetings not to overlap.
                Availability flags alone do not create scheduling rules.
                Unsupported syntax is rejected; constraints are never executed
                as code.
              </p>
            </details>
          </fieldset>
          <ErrorNote message={error} />
          <div className="lab-actions">
            <RunButton
              busy={busy}
              onClick={() => run()}
              onCancel={() => abort.current?.abort()}
              disabled={!text.trim()}
            >
              Run Check
            </RunButton>
          </div>
          <p role="status" className="field-hint">
            {progress}
          </p>
          <p className="field-hint">
            Jev predicts; Z3 verifies every rule. Uncertain predictions stay
            uncertain until the exact check completes.
          </p>
        </section>
        <section
          id="solver-results"
          className="panel lab-panel lab-result-target"
        >
          <div className="panel-heading">
            <h2>Comparison</h2>
            <Export data={result} name="solver-comparison.json" />
          </div>
          {result ? (
            <div className="lab-result-stack">
              <div
                className={
                  "compact-verdict solver-verdict outcome-" +
                  result.exact.result
                }
              >
                <span className="eyebrow">EXACT SOLVER RESULT</span>
                <h2>{result.exact.result}</h2>
                <p className="solver-outcome-meaning">
                  {result.exact.result === "satisfiable"
                    ? "There is at least one way for every rule to hold."
                    : result.exact.result === "unsatisfiable"
                      ? "These rules cannot all be true at the same time."
                      : "The exact solver could not settle this problem."}
                </p>
                <strong>{result.routing.route}</strong>
                <p>{result.routing.detail}</p>
                {result.exact.reason && <p>{result.exact.reason}</p>}
                {result.routing.proofNote && <p>{result.routing.proofNote}</p>}
              </div>
              <div className="solver-metrics">
                <article className="compact-finding">
                  <span>Z3 · source of truth</span>
                  <h3>{result.exact.result}</h3>
                  <p>
                    {ms(result.exact.latencyMs)} server ·{" "}
                    {ms(result.exactRoundTripMs)} round trip
                  </p>
                </article>
                <article className="compact-finding">
                  <span>Jev · prediction</span>
                  <h3>{result.jev.prediction}</h3>
                  <p>
                    {percent(result.jev.confidence)} conservative score ·{" "}
                    {ms(result.jev.latencyMs)} round trip
                  </p>
                  {result.jev.rawPrediction &&
                    result.jev.rawPrediction !== result.jev.prediction && (
                      <p>
                        Raw choice: {result.jev.rawPrediction} → below
                        confidence gate
                      </p>
                    )}
                </article>
              </div>
              <div className="compact-finding">
                <strong>
                  Agreement:{" "}
                  {result.routing.agreement === null
                    ? "Not comparable"
                    : result.routing.agreement
                      ? "Yes"
                      : "No"}
                </strong>
                <p>{result.routing.priority}</p>
              </div>
              <section>
                <h3>Independent groups · {result.groups.length}</h3>
                <p className="field-hint">
                  Only variable-disjoint groups are separated. The combined
                  score is a minimum score, not a calibrated joint probability.
                </p>
                <div className="solver-groups">
                  {result.groups.map((g, i) => (
                    <details key={i} className="compact-finding solver-group">
                      <summary>
                        <span className="solver-group-title">
                          <strong>Group {i + 1}</strong>
                          <small>
                            {g.problem.constraints.length}{" "}
                            {g.problem.constraints.length === 1
                              ? "constraint"
                              : "constraints"}
                          </small>
                        </span>
                        <span className="solver-group-prediction">
                          <span className="tag">
                            {g.prediction.prediction.replaceAll("_", " ")}
                          </span>
                          <small>
                            Jev confidence · {percent(g.prediction.confidence)}
                          </small>
                        </span>
                      </summary>
                      <span className="solver-group-label">
                        Source constraints
                      </span>
                      <pre>{g.problem.constraints.join("\n")}</pre>
                      {g.prediction.error && (
                        <p className="error-note">{g.prediction.error}</p>
                      )}
                    </details>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className="solver-empty">
              <div className="solver-empty-flow">
                <span>
                  <Braces size={25} />
                  <small>Your rules</small>
                </span>
                <b>→</b>
                <span>
                  <ToggleLeft size={25} />
                  <small>Jev predicts</small>
                </span>
                <b>→</b>
                <span>
                  <Equal size={25} />
                  <small>Z3 verifies</small>
                </span>
              </div>
              <h3>One puzzle. Two approaches.</h3>
              <p>
                Choose a scenario or write your own rules. You’ll see whether
                they can coexist, how confident Jev was, and which method took
                longer.
              </p>
              <div className="solver-outcome-key">
                <span>
                  <i className="sat-dot" /> Satisfiable: a solution exists
                </span>
                <span>
                  <i className="unsat-dot" /> Unsatisfiable: the rules conflict
                </span>
                <span>
                  <i /> Unknown: more checking needed
                </span>
              </div>
            </div>
          )}
        </section>
      </div>
      <section
        id="solver-benchmark"
        className="panel lab-panel benchmark-panel lab-result-target"
      >
        <div className="panel-heading">
          <div>
            <h2>Seeded benchmark</h2>
            <p className="field-hint">
              Five measured cases · API calls use your configured key
            </p>
          </div>
          <button
            className="button"
            disabled={busy || quotaBlocked}
            onClick={() => run(true)}
          >
            Run benchmark
          </button>
        </div>
        <p className="field-hint">
          {bench.length
            ? `${agreements}/${eligible.length} comparable cases agree (${eligible.length ? Math.round((agreements / eligible.length) * 100) + "%" : "—"}); ${bench.length - eligible.length} abstentions or unknowns. ${bench.length}/5 cases completed.`
            : "No benchmark measurements yet."}{" "}
          Latency includes network and initialization; these examples are not a
          general accuracy claim.
        </p>
        <div className="table-scroll">
          <table className="solver-table">
            <thead>
              <tr>
                <th>Example</th>
                <th>Z3</th>
                <th>Jev</th>
                <th>Confidence</th>
                <th>Z3 server</th>
                <th>Jev round trip</th>
                <th>Agree</th>
              </tr>
            </thead>
            <tbody>
              {SOLVER_EXAMPLES.map((ex) => {
                const row = bench.find((b) => b.name === ex.name)?.run;
                return (
                  <tr key={ex.name}>
                    <td>{ex.name}</td>
                    <td>{row?.exact.result || "—"}</td>
                    <td>{row?.jev.prediction || "—"}</td>
                    <td>{percent(row?.jev.confidence)}</td>
                    <td>{row ? ms(row.exact.latencyMs) : "—"}</td>
                    <td>{row ? ms(row.jev.latencyMs) : "—"}</td>
                    <td>
                      {row?.routing.agreement == null
                        ? "—"
                        : row.routing.agreement
                          ? "Yes"
                          : "No"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
