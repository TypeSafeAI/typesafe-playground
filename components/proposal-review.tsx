"use client";
import { useEffect, useRef, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { usageRequest } from "../lib/usageRequest";
import { errorMessage, percent } from "../lib/client";
import { revealResults } from "../lib/scroll";
import { API_KEY_EVENT, readApiKey } from "../lib/api-key";
import { Empty, ErrorNote, Export, Heading, RunButton } from "./ui";
import {
  JEV_MODEL,
  REVIEW_QUESTION_SET_VERSION,
  REVIEW_QUESTIONS,
} from "../lib/harness/review";
import { FAVORABLE, REVIEW_CONFIDENCE_THRESHOLD } from "../lib/harness/decide";
import { FIXTURE_CATEGORIES } from "../lib/harness/fixtures";
import {
  REVIEW_QUESTION_IDS,
  type Fixture,
  type FixtureCategory,
  type Receipt,
  type ReviewArm,
  type ReviewVerdict,
} from "../lib/harness/types";

/** What the browser sees: a fixture without its scripted mock probabilities. */
export type ClientFixture = Omit<Fixture, "mock">;
type Mode = "mock" | "live";
type Result = {
  receipt: Receipt;
  exchange: { payload: unknown; response: unknown } | null;
};

const CATEGORY_LABELS: Record<FixtureCategory, string> = {
  clean: "Clean fixes",
  off_scope: "Off-scope edits",
  missing_evidence: "Missing evidence",
  prompt_injection: "Prompt-injected repo content",
  ambiguous: "Ambiguous tasks",
};
const VERDICT_LABELS: Record<ReviewVerdict, string> = {
  permit: "Permit",
  proposal_only: "Proposal only",
  reject: "Reject",
  unavailable: "Unavailable",
};
const QUESTION_LABELS: Record<(typeof REVIEW_QUESTION_IDS)[number], string> = {
  addresses_task: "Addresses the stated task?",
  evidence_supports: "Evidence supports the claim?",
  unrelated_changes: "Introduces unrelated changes?",
  needs_clarification: "Should ask instead of act?",
};

export function ProposalReview({ fixtures }: { fixtures: ClientFixture[] }) {
  const [fixtureId, setFixtureId] = useState(fixtures[0]?.id ?? "");
  const [arm, setArm] = useState<ReviewArm>("good");
  const [mode, setMode] = useState<Mode>("mock");
  const [serverKey, setServerKey] = useState<boolean | null>(null);
  const [personalKey, setPersonalKey] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const sync = () => setPersonalKey(!!readApiKey());
    sync();
    window.addEventListener(API_KEY_EVENT, sync);
    window.addEventListener("storage", sync);
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setServerKey(!!d.configured))
      .catch(() => setServerKey(false));
    return () => {
      window.removeEventListener(API_KEY_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const liveAvailable = personalKey || serverKey === true;
  useEffect(() => {
    if (mode === "live" && !liveAvailable && serverKey !== null) setMode("mock");
  }, [mode, liveAvailable, serverKey]);
  const fixture = fixtures.find((f) => f.id === fixtureId) ?? fixtures[0];
  const proposal = fixture?.proposals[arm];
  function clear() {
    setResult(null);
    setError("");
  }
  async function run() {
    if (!fixture) return;
    setBusy(true);
    setError("");
    setResult(null);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const data = await usageRequest(
        "/api/proposal-review",
        { fixtureId: fixture.id, arm, mode },
        abort.signal,
        { mock: mode === "mock", example: "proposal-review" },
      );
      setResult({ receipt: data.receipt, exchange: data.exchange ?? null });
      revealResults("proposal-review-result");
    } catch (e) {
      setError(
        abort.signal.aborted
          ? "Stopped. No verdict was recorded and nothing was applied."
          : errorMessage(e),
      );
    } finally {
      setBusy(false);
    }
  }
  const receipt = result?.receipt;
  const source: "mock" | "jev" | "unavailable" | "none" = !receipt
    ? "none"
    : receipt.verdict === "unavailable"
      ? "unavailable"
      : receipt.jev?.source === "mock"
        ? "mock"
        : receipt.jev
          ? "jev"
          : "none";
  return (
    <div className="workspace compact-lab proposal-review-workspace">
      <Heading
        eyebrow="PROPOSAL REVIEW HARNESS"
        title="Propose. Review. Decide in code."
        description="An agent proposes one patch. Jev answers four yes/no questions about it. A fixed decision table turns those answers into a verdict, and every run leaves a receipt."
      />
      <div className="integration-flow" aria-label="Harness flow">
        <span>Propose</span>
        <span>→</span>
        <span>Validate</span>
        <span>→</span>
        <span>Four Jev questions</span>
        <span>→</span>
        <span>Code decides</span>
        <span>→</span>
        <span>Receipt</span>
      </div>
      <div className="lab-columns">
        <section className="panel lab-panel">
          <div className="panel-heading">
            <h2>Proposal</h2>
            <span className="tag">Synthetic fixtures only</span>
          </div>
          <fieldset disabled={busy} className="lab-fields">
            <label>
              Fixture
              <select
                aria-label="Fixture"
                value={fixture?.id ?? ""}
                onChange={(e) => {
                  setFixtureId(e.target.value);
                  clear();
                }}
              >
                {FIXTURE_CATEGORIES.map((category) => {
                  const group = fixtures.filter((f) => f.category === category);
                  return group.length ? (
                    <optgroup key={category} label={CATEGORY_LABELS[category]}>
                      {group.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.id}
                        </option>
                      ))}
                    </optgroup>
                  ) : null;
                })}
              </select>
            </label>
            <div className="review-toggle-row">
              <span className="field-label">Proposal arm</span>
              <div className="lab-actions" role="group" aria-label="Proposal arm">
                {(
                  [
                    ["good", "Good proposal"],
                    ["bad", "Bad proposal"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`button${arm === id ? " primary" : ""}`}
                    aria-pressed={arm === id}
                    onClick={() => {
                      setArm(id);
                      clear();
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="field-hint">
                Both arms are scripted in the fixture. The expected verdict for
                this arm is <code>{fixture?.expected[arm]}</code>; the receipt
                shows what the harness actually decided.
              </p>
            </div>
            <div className="review-toggle-row">
              <span className="field-label">Reviewer</span>
              <div className="lab-actions" role="group" aria-label="Reviewer mode">
                <button
                  type="button"
                  className={`button${mode === "mock" ? " primary" : ""}`}
                  aria-pressed={mode === "mock"}
                  onClick={() => {
                    setMode("mock");
                    clear();
                  }}
                >
                  Mock
                </button>
                <button
                  type="button"
                  className={`button${mode === "live" ? " primary" : ""}`}
                  aria-pressed={mode === "live"}
                  disabled={!liveAvailable}
                  title={
                    liveAvailable
                      ? undefined
                      : "Live Jev needs a server TYPESAFE_API_KEY or a personal key from the header."
                  }
                  onClick={() => {
                    setMode("live");
                    clear();
                  }}
                >
                  Live Jev
                </button>
              </div>
              <p className="field-hint">
                {mode === "mock"
                  ? "Mock returns the fixture's scripted probabilities and makes no request. It demonstrates the decision table, not Jev."
                  : `Live Jev sends this synthetic fixture to ${JEV_MODEL} (question set v${REVIEW_QUESTION_SET_VERSION}) and uses the configured key.`}
                {!liveAvailable && serverKey !== null && (
                  <>
                    {" "}
                    Live Jev is disabled: no server key is configured and no
                    personal key is set.
                  </>
                )}
              </p>
            </div>
          </fieldset>
          {fixture && proposal && (
            <div className="lab-result-stack review-fixture">
              <div>
                <h3>Task</h3>
                <p>{fixture.task}</p>
                <span className="tag">{CATEGORY_LABELS[fixture.category]}</span>
              </div>
              <div>
                <h3>Evidence supplied to the reviewer</h3>
                {fixture.evidence.length ? (
                  <ul className="review-evidence">
                    {fixture.evidence.map((line, i) => (
                      <li key={i}>
                        <code>{line}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">
                    None. The task arrived without supporting evidence.
                  </p>
                )}
              </div>
              <div>
                <h3>Files ({Object.keys(fixture.files).length})</h3>
                {Object.entries(fixture.files).map(([path, content]) => (
                  <details key={path} className="disclosure">
                    <summary>
                      <code>{path}</code>
                    </summary>
                    <pre
                      className="diff-evidence"
                      tabIndex={0}
                      aria-label={`Contents of ${path}`}
                    >
                      {content}
                    </pre>
                  </details>
                ))}
                <p className="field-hint">
                  Repository content is untrusted data. Instruction-like text
                  inside a file is something to judge, not a command to follow.
                </p>
              </div>
              <div>
                <h3>
                  Proposal · <code>{proposal.tool}</code> ·{" "}
                  <code>{proposal.path}</code>
                </h3>
                <p>{proposal.rationale}</p>
                {proposal.evidence.length > 0 && (
                  <ul className="review-evidence">
                    {proposal.evidence.map((line, i) => (
                      <li key={i}>
                        <code>{line}</code>
                      </li>
                    ))}
                  </ul>
                )}
                {proposal.patch ? (
                  <pre
                    className="diff-evidence"
                    tabIndex={0}
                    aria-label={`Proposed patch for ${proposal.path}`}
                  >
                    {proposal.patch.split("\n").map((line, i) => (
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
                ) : (
                  <p className="muted">
                    A read request. No patch is proposed; the agent wants to see
                    the file before acting.
                  </p>
                )}
              </div>
            </div>
          )}
          <ErrorNote message={error} />
          <div className="lab-actions">
            <RunButton
              busy={busy}
              usesJev={mode === "live"}
              disabled={!fixture}
              onClick={run}
              onCancel={() => controller.current?.abort()}
            >
              Review proposal
            </RunButton>
          </div>
          <p className="notice">
            Verdicts are evidence about a proposal, not permission or
            authorization. This workspace records patches as pending; it never
            applies them, runs proposed code, or writes anywhere.
          </p>
        </section>
        <section
          id="proposal-review-result"
          className="panel lab-panel lab-result-target"
        >
          <div className="panel-heading">
            <h2>Receipt</h2>
            <Export
              data={result}
              name={`proposal-review-${fixture?.id ?? "receipt"}-${arm}.json`}
            />
          </div>
          {receipt ? (
            <div className="lab-result-stack">
              <div
                className={`compact-verdict review-verdict verdict-${receipt.verdict} source-${source}`}
                role="status"
              >
                <div className="router-verdict-meta">
                  <span className="eyebrow">
                    {source === "mock"
                      ? "MOCK VERDICT"
                      : source === "jev"
                        ? "LIVE JEV VERDICT"
                        : source === "unavailable"
                          ? "REVIEW UNAVAILABLE"
                          : "VERDICT WITHOUT REVIEW"}
                  </span>
                  <span className={`tag source source-${source}`}>
                    {source === "mock"
                      ? "Mock · scripted probabilities, no request"
                      : source === "jev"
                        ? `Live Jev · ${receipt.jev?.model ?? JEV_MODEL}`
                        : source === "unavailable"
                          ? "Unavailable · no answers, never treated as safe"
                          : "Rejected before review · Jev not consulted"}
                  </span>
                </div>
                <h2>{VERDICT_LABELS[receipt.verdict]}</h2>
                <p>{receipt.reason}</p>
                <p className="muted">
                  {receipt.execution.note} Expected for this arm:{" "}
                  <code>{fixture?.expected[arm]}</code>.
                </p>
              </div>
              <dl className="routing-facts">
                <div>
                  <dt>Reviewer</dt>
                  <dd>
                    {receipt.jev
                      ? `${receipt.jev.source === "mock" ? "Mock" : "Live Jev"} · ${receipt.jev.model}`
                      : "Not consulted"}
                  </dd>
                </div>
                <div>
                  <dt>Review latency</dt>
                  <dd>{receipt.jev ? `${receipt.jev.latencyMs} ms` : "—"}</dd>
                </div>
                <div>
                  <dt>Validation</dt>
                  <dd>
                    {receipt.validation.ok
                      ? "Passed · path in root, single-file diff parses"
                      : `Failed · ${receipt.validation.errors.length} check${receipt.validation.errors.length === 1 ? "" : "s"}`}
                  </dd>
                </div>
                <div>
                  <dt>Execution</dt>
                  <dd>
                    {receipt.execution.status === "recorded_pending"
                      ? "Recorded as pending · nothing applied"
                      : "Withheld · nothing applied"}
                  </dd>
                </div>
              </dl>
              {!receipt.validation.ok && (
                <div>
                  <h3>Validation failures</h3>
                  <ul className="review-evidence">
                    {receipt.validation.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                  <p className="field-hint">
                    Deterministic checks run first. A failure here rejects the
                    proposal and Jev is never asked.
                  </p>
                </div>
              )}
              {receipt.jev && (
                <div>
                  <h3>
                    Four questions · threshold{" "}
                    {percent(REVIEW_CONFIDENCE_THRESHOLD)}
                  </h3>
                  {receipt.jev.answers ? (
                    <div className="decision-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Question</th>
                            <th>Answer</th>
                            <th>P(yes)</th>
                            <th>Confidence</th>
                            <th>Favorable</th>
                          </tr>
                        </thead>
                        <tbody>
                          {REVIEW_QUESTION_IDS.map((id) => {
                            const a = receipt.jev!.answers![id];
                            const favorable =
                              a.answer === FAVORABLE[id] &&
                              a.confidence >= REVIEW_CONFIDENCE_THRESHOLD;
                            return (
                              <tr key={id}>
                                <td>
                                  <strong>{QUESTION_LABELS[id]}</strong>
                                  <br />
                                  <code>{id}</code>
                                </td>
                                <td>{a.answer}</td>
                                <td>{percent(a.probability)}</td>
                                <td>{percent(a.confidence)}</td>
                                <td>
                                  {favorable
                                    ? "yes"
                                    : a.answer !== FAVORABLE[id]
                                      ? `no · wanted ${FAVORABLE[id]}`
                                      : "no · below threshold"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="error-note" role="alert">
                      {receipt.jev.error ?? "No answers were returned."}
                    </p>
                  )}
                  <p className="field-hint">
                    Confidence is the probability mass on the side that was
                    read, max(p, 1 − p). All four must be favorable at or above
                    the threshold to permit; the threshold is not yet
                    calibrated.
                  </p>
                </div>
              )}
              <details className="disclosure">
                <summary>Receipt JSON</summary>
                <pre className="diff-evidence" tabIndex={0}>
                  {JSON.stringify(receipt, null, 2)}
                </pre>
              </details>
              {result?.exchange && (
                <details className="disclosure">
                  <summary>Exact request and response</summary>
                  <pre className="diff-evidence" tabIndex={0}>
                    {JSON.stringify(result.exchange, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ) : (
            <Empty title="Pick a fixture and review it">
              The receipt shows the proposal, the validation result, Jev's four
              answers with confidence, the verdict, and why. Mock needs no key.
            </Empty>
          )}
        </section>
      </div>
      <section className="panel lab-panel">
        <div className="panel-heading">
          <div>
            <h2>The four questions, v{REVIEW_QUESTION_SET_VERSION}</h2>
            <p className="field-hint">
              Pinned to <code>{JEV_MODEL}</code>. Ids are stable; wording
              changes bump the version.
            </p>
          </div>
          <ClipboardCheck size={18} aria-hidden="true" />
        </div>
        <dl className="routing-facts">
          {REVIEW_QUESTION_IDS.map((id) => (
            <div key={id}>
              <dt>
                <code>{id}</code> · favorable = {FAVORABLE[id]}
              </dt>
              <dd>{REVIEW_QUESTIONS[id].instructions}</dd>
            </div>
          ))}
        </dl>
        <p className="field-hint">
          Independent community harness, not an official TypeSafe product or a
          production agent runtime. Only synthetic fixture content is sent to
          Jev.
        </p>
      </section>
    </div>
  );
}
