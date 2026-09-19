"use client";
import { useEffect, useRef, useState } from "react";
import { Inbox, ShieldAlert } from "lucide-react";
import { errorMessage, runJev } from "../lib/client";
import {
  defaultThreshold,
  resolveTriage,
  sampleContext,
  sampleQuestion,
  sampleTranscript,
} from "../lib/classifyQuestionWithJev";
import { isQuestion, runBatches } from "../lib/batchTriage";
import { runDocsFirst, type DocsFirstResult } from "../lib/docsFirstTriage";
import type { DocsLookup } from "../lib/gateDocs";
import { splitDocs, toHistory } from "../lib/matchEvidence";
import { parseTranscript } from "../web/conversation";
import type { BatchRow, ChatMessage, JevResponse } from "../types/triage";
import { BatchTriageTable } from "./BatchTriageTable";
import { ContextInput } from "./ContextInput";
import { QuestionInput } from "./QuestionInput";
import { TriageResult } from "./TriageResult";
import { Empty, ErrorNote, Export, Heading, RunButton } from "./ui";
const historyLimit = 20;
export function AskGateLab() {
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [question, setQuestion] = useState(sampleQuestion);
  const [transcript, setTranscript] = useState(sampleContext);
  const [docs, setDocs] = useState("");
  const [format, setFormat] = useState("auto");
  const [model, setModel] = useState("jev-latest");
  const [threshold, setThreshold] = useState(
    Math.round(defaultThreshold * 100),
  );
  const [single, setSingle] = useState<DocsFirstResult | null>(null);
  const [documentation, setDocumentation] = useState<DocsLookup | null>(null);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  let history: ChatMessage[] = [];
  let parseError = "";
  let ignoredStageNotices = 0;
  try {
    if (transcript.trim()) {
      const parsed = parseTranscript(transcript, format);
      ignoredStageNotices = parsed.ignoredStageNotices;
      history = toHistory(
        parsed.messages,
        mode === "batch" ? 200 : historyLimit,
      );
    }
  } catch (e) {
    parseError = errorMessage(e);
  }
  const snippets = docs.trim() ? splitDocs(docs) : [];
  const signature = JSON.stringify([
    mode,
    question,
    transcript,
    docs,
    format,
    model,
    threshold,
  ]);
  const stale = !!snapshot && snapshot !== signature;
  const input = { question, transcript, docs, format, model, historyLimit };
  function loadExample() {
    setQuestion(sampleQuestion);
    setTranscript(mode === "batch" ? sampleTranscript : sampleContext);
    setDocs("");
    setDocumentation(null);
    setFormat("auto");
    setSingle(null);
    setRows([]);
  }
  function switchMode(next: "single" | "batch") {
    setMode(next);
    setSingle(null);
    setRows([]);
    setError("");
    setSnapshot("");
    setDocumentation(null);
    if (transcript === sampleContext && next === "batch")
      setTranscript(sampleTranscript);
    if (transcript === sampleTranscript && next === "single")
      setTranscript(sampleContext);
  }
  async function run() {
    setError("");
    setProgress("");
    setBusy(true);
    setSingle(null);
    setRows([]);
    setDocumentation(null);
    setSnapshot(signature);
    controller.current = new AbortController();
    const signal = controller.current.signal;
    try {
      const items = history
        .map((message, index) => ({ message, index }))
        .filter(({ message }) => isQuestion(message.content));
      const questions =
        mode === "single"
          ? [question]
          : items.map(({ message }) => message.content);
      if (!questions.length)
        throw Error("No questions found in this transcript.");
      setProgress("Reading official TypeSafe documentation…");
      const lookup = await fetch("/api/gate-docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions }),
        signal,
      });
      const sources = await lookup.json();
      if (!lookup.ok)
        throw Error(
          sources.error || "Official documentation could not be checked.",
        );
      if (signal.aborted) return;
      setDocumentation(sources);
      const classify = async (
        request: import("../types/triage").TriageRequest,
      ) => {
        if (signal.aborted) throw Error("Triage stopped.");
        return (await runJev(request.payload, signal)) as JevResponse;
      };
      setProgress("Checking documentation matches before community context…");
      if (mode === "single") {
        setSingle(
          await runDocsFirst(
            input,
            sources.snippets,
            classify,
            threshold / 100,
          ),
        );
      } else {
        const settled = await runBatches(
          items,
          async (item) => ({
            item,
            result: await runDocsFirst(
              { ...input, question: item.message.content },
              sources.snippets,
              classify,
              threshold / 100,
              history.slice(Math.max(0, item.index - historyLimit), item.index),
            ),
          }),
          {
            signal,
            onProgress: (p) => setProgress(`${p.completed} / ${p.total} gated`),
          },
        );
        setRows(
          settled.map((result, index): BatchRow =>
            result.status === "fulfilled"
              ? {
                  index: result.value.item.index,
                  message: result.value.item.message,
                  candidates: result.value.result.candidates,
                  response: result.value.result.response,
                }
              : {
                  index: items[index].index,
                  message: items[index].message,
                  candidates: [],
                  error: errorMessage(result.reason),
                },
          ),
        );
      }
    } catch (e) {
      setError(signal.aborted ? "Triage stopped." : errorMessage(e));
      setSnapshot("");
    } finally {
      setBusy(false);
    }
  }
  const decision = single
    ? resolveTriage(single.response, single.candidates, threshold / 100)
    : null;
  const ready =
    (mode === "batch" || !!question.trim()) &&
    (mode === "single" ||
      history.some((message) => isQuestion(message.content))) &&
    !parseError;
  return (
    <div className="workspace">
      <Heading
        eyebrow="Ask gate"
        title="Ask Jev, or ask a human?"
        description="Check official TypeSafe docs first. If they do not resolve it, check community context before asking a person."
      >
        <span className="pill">
          <ShieldAlert size={15} />
          Classification only · no answers written
        </span>
      </Heading>
      <div className="split">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <Inbox size={18} />
              <h2>What came in</h2>
            </div>
            <button
              className="button quiet"
              disabled={busy}
              onClick={loadExample}
            >
              Load example
            </button>
          </div>
          <div className="panel-content scroll">
            <fieldset disabled={busy}>
              <label htmlFor="gate-mode">Mode</label>
              <select
                id="gate-mode"
                value={mode}
                onChange={(event) =>
                  switchMode(event.target.value as "single" | "batch")
                }
              >
                <option value="single">One question</option>
                <option value="batch">Batch: gate a whole dump</option>
              </select>
            </fieldset>
            {mode === "single" && (
              <QuestionInput
                value={question}
                onChange={setQuestion}
                disabled={busy}
              />
            )}
            <div className="evidence-card">
              <strong>Official docs → community context → human</strong>
              <p className="field-hint">
                Every run reads{" "}
                <a
                  href="https://docs.typesafe.ai/llms-full.txt"
                  target="_blank"
                  rel="noreferrer"
                >
                  TypeSafe’s full documentation
                </a>{" "}
                first (cached for 10 minutes). If unavailable, it follows
                relevant pages from{" "}
                <a
                  href="https://docs.typesafe.ai/llms.txt"
                  target="_blank"
                  rel="noreferrer"
                >
                  the docs index
                </a>
                . No API key is needed to retrieve docs.
              </p>
              {documentation && (
                <p role="status" className="field-hint">
                  {documentation.snippets.length} passages retrieved from{" "}
                  {documentation.pages} pages ·{" "}
                  {documentation.mode === "full"
                    ? "Full feed searched"
                    : "Limited index fallback"}{" "}
                  · fetched{" "}
                  {new Date(documentation.fetchedAt).toLocaleTimeString()}
                </p>
              )}
            </div>
            <ContextInput
              transcript={transcript}
              onTranscript={setTranscript}
              format={format}
              onFormat={setFormat}
              docs={docs}
              onDocs={setDocs}
              history={history}
              snippets={snippets}
              parseError={parseError}
              ignoredStageNotices={ignoredStageNotices}
              disabled={busy}
              transcriptLabel={
                mode === "single" ? "Recent conversation" : "Chat dump"
              }
              transcriptHint={
                mode === "single"
                  ? `Only the last ${historyLimit} messages are sent as context.`
                  : "Every question in here is gated against the messages above it."
              }
            />
            <fieldset disabled={busy}>
              <details className="disclosure">
                <summary>Model</summary>
                <label>
                  Model
                  <input
                    value={model}
                    maxLength={100}
                    onChange={(event) => setModel(event.target.value)}
                  />
                </label>
              </details>
            </fieldset>
          </div>
          <div className="panel-bottom">
            <span className="muted">
              {mode === "single"
                ? "Docs first · up to 2 Jev requests"
                : "Docs first · 3 questions in parallel"}
            </span>
            <RunButton
              busy={busy}
              disabled={!ready}
              onClick={run}
              onCancel={() => controller.current?.abort()}
            >
              Run triage
            </RunButton>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>The gate</h2>
            <Export
              data={
                decision || rows.length
                  ? {
                      run: JSON.parse(snapshot || signature),
                      threshold: threshold / 100,
                      documentation,
                      ...(decision
                        ? { decision, response: single?.response }
                        : { rows }),
                    }
                  : null
              }
              name="ask-gate.json"
            />
          </div>
          <div className="panel-content scroll" aria-live="polite">
            <ErrorNote message={error} />
            {stale && (
              <p className="notice">
                Input changed. Run triage again for an up-to-date decision.
              </p>
            )}
            {busy && (
              <p role="status" className="muted">
                {progress || "Gating…"}
              </p>
            )}
            {single && documentation && (
              <p className="notice">
                Official docs checked first · {single.docsChecked} shortlisted
                passages.{" "}
                {single.stage === "no_match"
                  ? "No matching passages or community context available; human review required. No Jev call made."
                  : single.stage === "docs"
                    ? "Decision from the documentation pass."
                    : "No accepted docs match; community context checked next."}{" "}
                Retrieval is a shortlist, not proof that an answer is absent.
              </p>
            )}
            {decision ? (
              <TriageResult
                decision={decision}
                candidates={single!.candidates}
                response={
                  single!.stage === "no_match" ? undefined : single!.response
                }
              />
            ) : rows.length ? (
              <BatchTriageTable rows={rows} threshold={threshold / 100} />
            ) : (
              <Empty title="Does this really need a person?">
                Run triage to see whether the channel or the docs already
                answered it, with the exact line that proves it.
              </Empty>
            )}
            <div className="threshold">
              <label htmlFor="gate-threshold">
                Confidence needed to keep it from a human{" "}
                <strong>{threshold}%</strong>
              </label>
              <input
                id="gate-threshold"
                type="range"
                min={0}
                max={100}
                value={threshold}
                onChange={(event) => setThreshold(Number(event.target.value))}
              />
              <div className="input-meta">
                <span>Gate more questions</span>
                <span>Trust a person</span>
              </div>
            </div>
          </div>
          <p className="panel-footnote">
            Jev only picks one of four outcomes and one piece of evidence. Any
            weak or unsupported match falls back to a human.
          </p>
        </section>
      </div>
    </div>
  );
}
