import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { demos, demoAdapters, startDemoTarget } from "./demos";
import { liveAdapters } from "./models";
import { runPipeline } from "./run";
import type { DemoId } from "./examples";
export type DemoJob = {
  id: string;
  demo: DemoId;
  mode: "mock" | "live";
  stage: string;
  status: "running" | "passed" | "review-required" | "failed" | "closed";
  output: string;
  url?: string;
  targetUrl?: string;
  error?: string;
  report?: Awaited<ReturnType<typeof runPipeline>>["report"];
  cost?: Awaited<ReturnType<typeof runPipeline>>["cost"];
  close?: () => Promise<void>;
};
const globalStore = globalThis as typeof globalThis & {
  cleanRoomJobs?: Map<string, DemoJob>;
};
const jobs = (globalStore.cleanRoomJobs ??= new Map<string, DemoJob>());
export async function startDemoJob(
  demo: DemoId,
  mode: "mock" | "live",
  viewport?: { width: number; height: number },
) {
  if ([...jobs.values()].filter((j) => j.status === "running").length >= 2)
    throw Error("Two rebuilds are already running. Wait for one to finish.");
  const job: DemoJob = {
    id: randomUUID(),
    demo,
    mode,
    stage: "starting",
    status: "running",
    output: "",
  };
  // Reserve synchronously before filesystem work yields to another POST.
  jobs.set(job.id, job);
  try {
    for (const [id, old] of jobs)
      if (jobs.size > 6 && old.status !== "running") {
        jobs.delete(id);
        await old.close?.();
        if (old.output) await rm(old.output, { recursive: true, force: true });
      }
    job.output = await mkdtemp(path.join(os.tmpdir(), "clean-room-"));
  } catch (error) {
    jobs.delete(job.id);
    throw error;
  }
  let target: Awaited<ReturnType<typeof startDemoTarget>> | undefined;
  let app: Awaited<ReturnType<typeof runPipeline>> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let closing: Promise<void> | undefined;
  job.close = () => {
    if (expiry) clearTimeout(expiry);
    job.status = "closed";
    job.url = undefined;
    job.targetUrl = undefined;
    return (closing ??= (async () => {
      app?.close();
      await target?.close();
    })());
  };
  void (async () => {
    try {
      target = await startDemoTarget();
      job.targetUrl = target.url + "/" + demo;
      const result = await runPipeline(
        {
          ...(demos[demo].config as object),
          target: target.url,
          ...(viewport ? { viewport } : {}),
        },
        {
          output: job.output,
          adapters: mode === "mock" ? demoAdapters() : liveAdapters(),
          keepAlive: true,
          onStage: (s) => {
            job.stage = s;
          },
        },
      );
      app = result;
      job.url = result.url + "/" + demo;
      job.report = result.report;
      job.cost = result.cost;
      job.status = result.report.status as DemoJob["status"];
      job.stage = "complete";
      expiry = setTimeout(
        () => {
          void job.close?.().catch((error) => {
            job.status = "failed";
            job.error = error instanceof Error ? error.message : "Close failed";
          });
        },
        20 * 60 * 1000,
      );
      expiry.unref();
    } catch (e) {
      await job.close?.();
      job.status = "failed";
      job.error = e instanceof Error ? e.message : "Rebuild failed";
    }
  })();
  return publicJob(job);
}
export function getDemoJob(id: string) {
  const job = jobs.get(id);
  if (!job) throw Error("Run not found. Start a new demo.");
  return job;
}
export function publicJob(job: DemoJob) {
  const { close: _, ...data } = job;
  return data;
}
export async function artifact(id: string, name: string) {
  const job = getDemoJob(id);
  const allowed = [
    "config.json",
    "endpoints.json",
    "layouts.json",
    "decisions.json",
    "generation.json",
    "verification.json",
    "cost.json",
    "observations.json",
  ];
  if (name === "bundle") {
    if (job.status === "running")
      throw Error("Wait for the run before exporting.");
    const temp = await mkdtemp(path.join(os.tmpdir(), "clean-room-download-"));
    try {
      const dest = path.join(temp, "bundle.tar.gz");
      await promisify(execFile)("tar", ["-czf", dest, "-C", job.output, "."]);
      return {
        body: await readFile(dest),
        type: "application/gzip",
        name: `clean-room-${job.demo}.tar.gz`,
      };
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }
  if (!allowed.includes(name)) throw Error("Unknown artifact.");
  return {
    body: await readFile(path.join(job.output, name)),
    type: "application/json",
    name,
  };
}
