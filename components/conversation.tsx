"use client";
import { useEffect, useRef, useState } from "react";
import { MessageSquare, ArrowUpRight } from "lucide-react";
import { ConversationRanking } from "./ConversationRanking";
import { candidateMessage } from "../lib/conversation-ranking";
import * as lab from "../web/conversation";
import { runJev, percent, errorMessage } from "../lib/client";
import { Empty, ErrorNote, Export, Heading, RunButton } from "./ui";
const sample =
  "Val — 11:31\nDo they have a desktop app?\nTyler — 11:34\nCan you prototype the codebase search flow? I need exact context, line-by-line search, and AST support.\nMorgan — 11:35\nThat sounds great 👀";
export function Conversation() {
  const [text, setText] = useState(sample);
  const [format, setFormat] = useState("auto");
  const [policy, setPolicy] = useState(
    "Respond to substantive questions and requests where your help would be useful. Stay quiet for casual chat, acknowledgments, and already answered questions.",
  );
  const [mode, setMode] = useState("contest");
  const [model, setModel] = useState("jev-latest");
  const [threshold, setThreshold] = useState(70);
  const [expected, setExpected] = useState("");
  const [history, setHistory] = useState<lab.Row[]>([]);
  const [rows, setRows] = useState<lab.Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  let messages: lab.Message[] = [];
  let parseError = "";
  let ignoredStageNotices = 0;
  try {
    const parsed = lab.parseTranscript(text, format);
    messages = parsed.messages;
    ignoredStageNotices = parsed.ignoredStageNotices;
  } catch (e) {
    parseError = errorMessage(e);
  }
  const signature = JSON.stringify([
    text,
    format,
    policy,
    mode,
    model,
    expected,
  ]);
  const stale = !!snapshot && snapshot !== signature;
  const winners = lab.pickWinners(rows, threshold / 100);
  async function run() {
    setError("");
    setBusy(true);
    setRows([]);
    setSnapshot(signature);
    controller.current = new AbortController();
    try {
      const input = { transcript: text, format, policy, model };
      const candidates: lab.Candidate[] =
        mode === "contest"
          ? lab.buildCandidates(input)
          : [
              { variant: "context", payload: lab.buildRequest(input, true) },
              ...(mode === "compare"
                ? [
                    {
                      variant: "latest",
                      payload: lab.buildRequest(input, false),
                    },
                  ]
                : []),
            ];
      const settled = await lab.runBatches(
        candidates,
        async (c) => ({
          ...c,
          response: await runJev(c.payload, controller.current!.signal),
        }),
        {
          signal: controller.current.signal,
          onProgress: (p) =>
            setProgress(`${p.completed} / ${p.total} evaluated`),
        },
      );
      const next = settled.map((r, i): lab.Row =>
        r.status === "fulfilled"
          ? {
              ...r.value,
              message: candidateMessage(candidates[i]),
              expected: mode === "contest" ? "" : expected,
              predicted: r.value.response.answers?.frame?.choice,
            }
          : {
              variant: candidates[i].variant,
              message: candidateMessage(candidates[i]),
              speaker: candidates[i].speaker,
              error: errorMessage(r.reason),
            },
      );
      setRows(next);
      setHistory((h) => [
        ...h,
        ...next.filter((r) => r.expected && r.predicted),
      ]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workspace conversation-workspace">
      <Heading
        eyebrow="Conversation lab"
        title="Give the right message a reply."
        description="Paste a conversation and see where a response would matter most."
      >
        <span className="pill">Preview only · no messages sent</span>
      </Heading>
      <div className="split">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <MessageSquare size={17} />
              <h2>Your conversation</h2>
            </div>
            <button
              className="button quiet"
              disabled={busy}
              onClick={() => {
                setText(sample);
                setExpected("");
              }}
            >
              Load example
            </button>
          </div>
          <div className="panel-content scroll">
            <fieldset disabled={busy}>
              <label htmlFor="experiment">Experiment</label>
              <select
                id="experiment"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="contest">Who gets the reply?</option>
                <option value="compare">Compare context (A/B)</option>
                <option value="single">Evaluate final message</option>
              </select>
              <label htmlFor="transcript">Raw conversation</label>
              <textarea
                id="transcript"
                className="transcript"
                value={text}
                maxLength={40000}
                onChange={(e) => {
                  setText(e.target.value);
                  setExpected("");
                }}
                spellCheck={false}
              />
              <p className="muted">Paste from Discord, or use Name: message.</p>
              {ignoredStageNotices > 0 && (
                <p className="muted" role="status">
                  Ignored {ignoredStageNotices} Discord stage notice
                  {ignoredStageNotices === 1 ? "" : "s"}. The original
                  transcript is unchanged.
                </p>
              )}
              <details className="disclosure">
                <summary>
                  Parsed messages <span>{messages.length}</span>
                </summary>
                <label>
                  Paste format
                  <select
                    value={format}
                    onChange={(e) => {
                      setFormat(e.target.value);
                      setExpected("");
                    }}
                  >
                    <option value="auto">Auto-detect</option>
                    <option value="discord">Discord</option>
                    <option value="labeled">Name: message</option>
                    <option value="plain">Plain text</option>
                  </select>
                </label>
                <ErrorNote message={parseError} />
                {messages.map((m, i) => (
                  <div className="parsed-message" key={i}>
                    <strong>{m.speaker || "Unknown speaker"}</strong>
                    <time>{m.timestamp}</time>
                    <p>{m.content}</p>
                  </div>
                ))}
              </details>
              <details className="disclosure">
                <summary>Policy & evaluation</summary>
                <label>
                  When should the bot reply?
                  <textarea
                    value={policy}
                    onChange={(e) => setPolicy(e.target.value)}
                    rows={4}
                    maxLength={8000}
                  />
                </label>
                <label>
                  Model
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                </label>
                <label>
                  Expected frame
                  <select
                    value={expected}
                    onChange={(e) => setExpected(e.target.value)}
                  >
                    <option value="">Unlabeled</option>
                    {Object.keys(lab.frames).map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
                <p className="muted">
                  Labels are scored in A/B and final-message modes.
                </p>
              </details>
            </fieldset>
          </div>
          <div className="panel-bottom">
            <span className="muted">Up to 3 requests in parallel</span>
            <RunButton
              busy={busy}
              disabled={!text.trim()}
              onClick={run}
              onCancel={() => controller.current?.abort()}
            >
              {mode === "contest" ? "Pick a recipient" : "Evaluate"}
            </RunButton>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>The reply decision</h2>
            </div>
            <Export
              data={
                rows.length
                  ? {
                      run: JSON.parse(snapshot),
                      threshold: threshold / 100,
                      selection: winners,
                      rows,
                    }
                  : null
              }
              name="conversation-results.json"
            />
          </div>
          <div className="panel-content scroll" aria-live="polite">
            <ErrorNote message={error} />
            {stale && (
              <p className="notice">
                Input changed. Run again to update the decision.
              </p>
            )}
            {busy && (
              <p role="status" className="muted">
                {progress || "Evaluating messages…"}
              </p>
            )}
            {!rows.length ? (
              <Empty title="Who deserves the next reply?">
                Run the conversation to compare reply probabilities and identify
                a recipient.
              </Empty>
            ) : (
              <ConversationRanking
                rows={rows}
                threshold={threshold}
                contest={mode === "contest"}
                stale={stale}
              />
            )}
            <div className="threshold">
              <label htmlFor="threshold">
                Minimum reply probability <strong>{threshold}%</strong>
              </label>
              <input
                id="threshold"
                type="range"
                min={0}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
              <div className="input-meta">
                <span>More replies</span>
                <span>More selective</span>
              </div>
            </div>
            <details className="disclosure">
              <summary>
                Frame evaluation <ArrowUpRight size={14} />
              </summary>
              <p className="muted">
                Valid labeled runs in this tab. Repeated runs count again; this
                is not a benchmark.
              </p>
              {["context", "latest"].map((variant) => {
                const stats = lab.summarize(history, variant);
                return (
                  <div key={variant}>
                    <h3>
                      {variant === "context"
                        ? "With context"
                        : "Latest message only"}
                      : {stats.correct}/{stats.total}
                    </h3>
                    {stats.total > 0 && (
                      <div className="table-wrap">
                        <table>
                          <caption>Rows: expected · columns: predicted</caption>
                          <thead>
                            <tr>
                              <th>Frame</th>
                              {Object.keys(lab.frames).map((f) => (
                                <th key={f}>{f}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(stats.matrix).map(([f, values]) => (
                              <tr key={f}>
                                <th>{f}</th>
                                {Object.entries(values).map(([k, v]) => (
                                  <td key={k}>{v}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
              <button className="button" onClick={() => setHistory([])}>
                Clear evaluation
              </button>
            </details>
          </div>
        </section>
      </div>
    </div>
  );
}
