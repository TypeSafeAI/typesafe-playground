"use client";
import { useUsage, usageBlocked } from "../lib/logUsageEntry";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  GitBranch,
  Plus,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import * as workflow from "../web/workflow";
import { runJev, errorMessage, percent } from "../lib/client";
import { ErrorNote, Export, Heading } from "./ui";
import { WORKFLOW_EXAMPLES } from "../lib/workflow-examples";
type Turn = workflow.Turn & { decision?: workflow.Decision };
export function Workflow() {
  useUsage();
  const quotaBlocked = usageBlocked();
  const [exampleId, setExampleId] = useState("delivery");
  const example = WORKFLOW_EXAMPLES.find((e) => e.id === exampleId)!;
  const [rules, setRules] = useState(workflow.defaults);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    log.current?.scrollTo({
      top: turns.length ? log.current.scrollHeight : 0,
      behavior:
        turns.length && !matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "smooth"
          : "instant",
    });
  }, [turns, busy]);
  async function send(content = message) {
    if (!content.trim() || busy) return;
    setError("");
    const next: Turn[] = [...turns, { role: "user", content: content.trim() }];
    setBusy(true);
    controller.current = new AbortController();
    try {
      const payload = workflow.buildRequest(next, rules, example.question);
      setTurns(next);
      setMessage("");
      const result = workflow.resolve(
        await runJev(payload, controller.current.signal),
        rules,
        example.question,
      );
      setTurns([
        ...next,
        { role: "assistant", content: result.text, decision: result },
      ]);
    } catch (e) {
      setTurns(turns);
      setMessage(content);
      setError(
        controller.current.signal.aborted
          ? "Stopped. Your message is ready to retry."
          : errorMessage(e),
      );
    } finally {
      setBusy(false);
    }
  }
  function update(index: number, key: keyof workflow.Rule, value: string) {
    setRules(rules.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  }
  return (
    <div className="workspace">
      <Heading
        eyebrow="Workflow chat"
        title="A clear next step."
        description="Describe the case. Add the evidence. Apply your process."
      />
      <div className="split workflow-layout">
        <aside className="panel rules-panel">
          <div className="panel-heading">
            <div>
              <GitBranch size={17} />
              <h2>Your playbook</h2>
            </div>
            <span className="count">{rules.length}</span>
          </div>
          <div className="panel-content scroll">
            <label>
              Example playbook
              <select
                value={exampleId}
                disabled={busy || turns.length > 0}
                onChange={(e) => {
                  const selected = WORKFLOW_EXAMPLES.find(
                    (x) => x.id === e.target.value,
                  )!;
                  setExampleId(selected.id);
                  setRules(selected.rules.map((r) => ({ ...r })));
                  setMessage("");
                  setError("");
                }}
              >
                {WORKFLOW_EXAMPLES.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <h3>{example.name}</h3>
            <p className="muted">{example.description}</p>
            <p className="muted">
              Jev checks the facts against your rules before recommending an
              action.
            </p>
            <fieldset disabled={busy || turns.length > 0} className="rules">
              {rules.map((rule, i) => (
                <details className="rule" key={rule.id}>
                  <summary>
                    <span className="rule-number">0{i + 1}</span>
                    {rule.name}
                  </summary>
                  <div className="rule-edit">
                    <label>
                      Name
                      <input
                        value={rule.name}
                        onChange={(e) => update(i, "name", e.target.value)}
                      />
                    </label>
                    <label>
                      When
                      <textarea
                        value={rule.condition}
                        onChange={(e) => update(i, "condition", e.target.value)}
                        rows={3}
                      />
                    </label>
                    <label>
                      Then
                      <textarea
                        value={rule.action}
                        onChange={(e) => update(i, "action", e.target.value)}
                        rows={2}
                      />
                    </label>
                    <button
                      className="button quiet"
                      onClick={() => setRules(rules.filter((_, n) => i !== n))}
                    >
                      <Trash2 size={13} />
                      Remove rule
                    </button>
                  </div>
                </details>
              ))}
              <button
                className="button"
                disabled={rules.length >= 12}
                onClick={() =>
                  setRules([
                    ...rules,
                    {
                      id: `rule_${Date.now()}`,
                      name: "New rule",
                      condition: "",
                      action: "",
                    },
                  ])
                }
              >
                <Plus size={14} />
                Add rule
              </button>
            </fieldset>
            {turns.length > 0 && (
              <p className="muted">Start a new case to edit the playbook.</p>
            )}
          </div>
          <div className="panel-footnote">
            Recommendations only. No refunds, fines, or bans are executed.
          </div>
        </aside>
        <section className="panel chat-panel">
          <div className="panel-heading">
            <div>
              <span className="live-dot" />
              <h2>Case conversation</h2>
            </div>
            <div className="inline-actions">
              <Export
                data={turns.length ? { rules, turns } : null}
                name="workflow-case.json"
              />
              <button
                className="button quiet"
                disabled={busy || quotaBlocked}
                onClick={() => {
                  setTurns([]);
                  setError("");
                  setMessage("");
                }}
              >
                New case
              </button>
            </div>
          </div>
          <div
            className="chat-log"
            ref={log}
            role="log"
            aria-label="Case conversation"
          >
            {!turns.length ? (
              <div className="chat-welcome">
                <div className="welcome-symbol">
                  <GitBranch size={30} />
                </div>
                <h2>What happened?</h2>
                <p>
                  Start with what you know. We’ll work through the missing
                  details together.
                </p>
                <div className="suggestions">
                  {example.starters.map((starter) => (
                    <button
                      key={starter.label}
                      onClick={() => send(starter.text)}
                      disabled={busy || quotaBlocked}
                    >
                      {starter.label} <span>↗</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((turn, i) => (
                <div className={`chat-turn ${turn.role}`} key={i}>
                  <div className="avatar">
                    {turn.role === "user" ? (
                      <UserRound size={16} />
                    ) : (
                      <Sparkles size={16} />
                    )}
                  </div>
                  <div className="turn-body">
                    <div className="turn-label">
                      {turn.role === "user" ? "You" : "Workflow assistant"}
                    </div>
                    {turn.decision?.kind === "recommendation" ? (
                      <div className="recommendation">
                        <span className="eyebrow">Recommended action</span>
                        <h3>{turn.decision.name}</h3>
                        <p>{turn.decision.action}</p>
                        <span className="pill">
                          Evidence support {percent(turn.decision.probability)}
                        </span>
                      </div>
                    ) : (
                      <p>{turn.content}</p>
                    )}
                  </div>
                </div>
              ))
            )}
            {busy && (
              <div className="thinking" role="status">
                <span className="live-dot" />
                Checking your playbook…
              </div>
            )}
          </div>
          <div className="composer-area">
            <ErrorNote message={error} />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <div className="composer">
                <textarea
                  aria-label="Describe the case"
                  value={message}
                  maxLength={8000}
                  placeholder="Describe the case, or add a detail…"
                  rows={2}
                  disabled={busy || quotaBlocked}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                {busy ? (
                  <button
                    type="button"
                    className="button"
                    onClick={() => controller.current?.abort()}
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    className="send-button"
                    disabled={!message.trim() || quotaBlocked}
                    aria-label="Send message"
                  >
                    <ArrowUp size={19} />
                  </button>
                )}
              </div>
              <div className="composer-hint">
                <span>Enter to send · Shift + Enter for a new line</span>
                <span>Jev</span>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
