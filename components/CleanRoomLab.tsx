"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Download,
  Play,
  Layers,
  Search,
  Users,
  Send,
} from "lucide-react";
import { Heading, ErrorNote } from "./ui";
import {
  demoExamples,
  demoConfigs,
  type DemoId,
} from "../src/clean-room/examples";
import type { DemoJob } from "../src/clean-room/jobs";
const stages = [
  "capture",
  "endpoints",
  "layout",
  "generation",
  "wiring",
  "verification",
];
const stageLabels = [
  "Observe target",
  "Map endpoints",
  "Map screens",
  "Build components",
  "Wire actions",
  "Verify behavior",
];
const icons = [Search, Users, Send];
export function CleanRoomLab() {
  const [selected, setSelected] = useState<DemoId>("catalog"),
    [job, setJob] = useState<DemoJob | null>(null),
    [error, setError] = useState(""),
    [starting, setStarting] = useState(false);
  const example = demoExamples.find((d) => d.id === selected)!;
  const busy = starting || job?.status === "running";
  useEffect(() => {
    if (!job || job.status !== "running") return;
    let active = true;
    const controller = new AbortController();
    const timer = setInterval(() => {
      fetch(`/api/clean-room?id=${job.id}`, { signal: controller.signal })
        .then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw Error(data.error);
          if (active) {
            setJob(data);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 1500);
    return () => {
      active = false;
      clearInterval(timer);
      controller.abort();
    };
  }, [job?.id, job?.status]);
  async function run() {
    setStarting(true);
    setError("");
    try {
      if (job && job.status !== "running")
        await fetch(`/api/clean-room?id=${job.id}`, { method: "DELETE" });
      const response = await fetch("/api/clean-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demo: selected,
          mode: "mock",
          viewport: {
            width: Math.max(320, Math.min(2560, window.innerWidth)),
            height: Math.max(240, Math.min(1800, window.innerHeight)),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setJob(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not run demo");
    } finally {
      setStarting(false);
    }
  }
  return (
    <div className="workspace compact-lab clean-room-lab">
      <Heading
        eyebrow="OBSERVE → REBUILD → VERIFY"
        title="Clean-room rebuild"
        description="Turn observed screens and API contracts into a working app. Keep every decision and check the result."
      />
      <div className="cr-examples" aria-label="Rebuild examples">
        {demoExamples.map((demo, i) => {
          const Icon = icons[i];
          return (
            <button
              key={demo.id}
              className={`cr-example ${selected === demo.id ? "selected" : ""}`}
              aria-label={demo.title}
              aria-pressed={selected === demo.id}
              disabled={!!busy}
              onClick={() => {
                setSelected(demo.id);
              }}
            >
              <Icon size={22} />
              <strong>{demo.title}</strong>
              <span>{demo.description}</span>
              <small>
                {selected === demo.id ? "Selected example" : "Load example"}
              </small>
            </button>
          );
        })}
      </div>
      <section className="cr-workbench">
        <div className="cr-brief">
          <div className="eyebrow">PREFILLED CONTEXT</div>
          <h2>{example.title}</h2>
          <label htmlFor="cr-context">Rebuild context</label>
          <textarea id="cr-context" readOnly value={example.goal} rows={3} />
          <p className="cr-note">
            Local demo · simulated Jev choices · no API key required. Real
            browser capture, endpoint calls, component export, and verification.
          </p>
          <details>
            <summary>Inspect the target and interaction scenario</summary>
            <pre>{JSON.stringify(demoConfigs[selected], null, 2)}</pre>
          </details>
          <button className="button primary" disabled={!!busy} onClick={run}>
            <Play size={16} />
            {busy ? "Rebuilding…" : "Run local demo"}
          </button>
          <p className="cr-note">
            Run from localhost with Chromium installed. For a custom target or
            live Jev, use <code>pnpm clean-room</code>. Instructions are in{" "}
            <code>docs/clean-room/README.md</code>.
          </p>
        </div>
        <div className="cr-progress">
          <div className="eyebrow">INDEPENDENT EVIDENCE</div>
          <h2>Six stages. One checkable result.</h2>
          <ol>
            {stages.map((stage, i) => {
              const current = job?.stage === stage,
                done =
                  job?.stage === "complete" ||
                  (job && stages.indexOf(job.stage) > i);
              return (
                <li key={stage} data-current={!!current} data-done={!!done}>
                  <span>{done ? <Check size={15} /> : i + 1}</span>
                  <div>
                    {stageLabels[i]}
                    {current && job?.status === "running" && (
                      <small>Running</small>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <div role="status" className="cr-status">
            {!job
              ? "Choose an example to start."
              : job.status === "passed"
                ? "Verification passed"
                : job.status === "review-required"
                  ? "Review required: discrepancies found"
                  : job.status === "failed"
                    ? "Rebuild stopped"
                    : job.status === "closed"
                      ? "Demo servers closed"
                      : `Running: ${stageLabels[stages.indexOf(job.stage)] || "Starting browser"}`}
          </div>
        </div>
      </section>
      <ErrorNote message={error || job?.error || ""} />
      {job?.report && (
        <section className="cr-results">
          <div className="cr-result-heading">
            <div>
              <div className="eyebrow">
                {job.demo.toUpperCase()} ·{" "}
                {job.mode === "mock" ? "SIMULATED JEV" : "LIVE JEV"}
              </div>
              <h2>
                {job.report.checks.filter((c) => c.passed).length} /{" "}
                {job.report.checks.length} browser comparisons passed
              </h2>
            </div>
            <div className="cr-links">
              {job.url && (
                <a
                  className="button primary"
                  target="_blank"
                  rel="noreferrer"
                  href={job.url}
                >
                  Open rebuilt app <ArrowUpRight size={16} />
                </a>
              )}
              {job.targetUrl && (
                <a
                  className="button"
                  target="_blank"
                  rel="noreferrer"
                  href={job.targetUrl}
                >
                  Open original target <ArrowUpRight size={16} />
                </a>
              )}
            </div>
          </div>
          <ul className="cr-checks">
            {job.report.checks.map((check) => (
              <li key={check.id}>
                <strong>{check.id}</strong>
                <span>{check.passed ? "Passed" : "Review required"}</span>
                <small>
                  Visual difference:{" "}
                  {check.pixelDifference === null
                    ? "not measured"
                    : `${(check.pixelDifference * 100).toFixed(2)}%`}
                </small>
                {check.discrepancies.map((d, i) => (
                  <p key={i}>{d}</p>
                ))}
              </li>
            ))}
          </ul>
          {job.report.gaps.map((gap) => (
            <p key={gap}>{gap}</p>
          ))}
          <p>{job.report.scope}</p>
          <p>
            {job.cost?.jevCalls} classification calls ·{" "}
            {job.cost?.componentEmissions} local component emissions · no
            external generation model. Demo Jev choices are simulated; the $0.40
            live-cost benchmark is unverified.
          </p>
          <div className="cr-links">
            <a
              className="button"
              href={`/api/clean-room?id=${job.id}&artifact=bundle`}
            >
              <Download size={16} />
              Download app + evidence
            </a>
            <a
              className="button quiet"
              href={`/api/clean-room?id=${job.id}&artifact=verification.json`}
            >
              <Layers size={16} />
              Verification JSON
            </a>
            {job.status !== "closed" && (
              <button
                className="button quiet"
                onClick={async () => {
                  const r = await fetch(`/api/clean-room?id=${job.id}`, {
                    method: "DELETE",
                  });
                  const data = await r.json();
                  if (r.ok) setJob(data);
                  else setError(data.error);
                }}
              >
                Close demo servers
              </button>
            )}
          </div>
          <details>
            <summary>All pipeline artifacts</summary>
            <div className="cr-artifacts">
              {[
                "endpoints",
                "layouts",
                "decisions",
                "generation",
                "cost",
                "observations",
              ].map((name) => (
                <a
                  key={name}
                  href={`/api/clean-room?id=${job.id}&artifact=${name}.json`}
                >
                  {name}.json
                </a>
              ))}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
