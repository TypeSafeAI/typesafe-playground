import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readBoundedBody } from "../../lib/api";
import type { Browser } from "@playwright/test";
import { configSchema } from "./contracts";
import { chromium, captureTarget } from "./browser";
import { discoverEndpoints } from "./discovery";
import {
  AuditModels,
  liveAdapters,
  summarizeCost,
  type ModelAdapters,
} from "./models";
import { classifyEndpoints, generateComponents, mapScreens } from "./classify";
import { emitApp, startApp } from "./emit";
import { verifyRebuild } from "./verify";
import { compileComponents } from "./compile";
export type RunOptions = {
  output: string;
  adapters?: ModelAdapters;
  keepAlive?: boolean;
  onStage?: (stage: string) => void;
};
export async function runPipeline(input: unknown, options: RunOptions) {
  const config = configSchema.parse(input),
    output = path.resolve(options.output);
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length)
    throw Error(
      "Output directory must be empty; previous evidence is never overwritten.",
    );
  const save = (name: string, data: unknown) =>
    writeFile(path.join(output, name), JSON.stringify(data, null, 2) + "\n");
  const rates = {
    jevInput: rate("CLEAN_ROOM_JEV_INPUT_RATE") ?? 0.042,
    jevOutput: rate("CLEAN_ROOM_JEV_OUTPUT_RATE"),
  };
  const audit = new AuditModels(
    options.adapters ?? liveAdapters(),
    { maxCalls: config.maxCalls, minConfidence: config.minConfidence },
    async () => {
      await save("decisions.json", audit.decisions);
      await save("generation.json", audit.generations);
      await save("cost.json", summarizeCost(audit, rates));
    },
  );
  await save("config.json", config);
  await save("decisions.json", []);
  await save("generation.json", []);
  let stage = "capture";
  const phase = async (value: string) => {
    stage = value;
    options.onStage?.(stage);
    await save("status.json", {
      stage,
      status: "running",
      mode: audit.adapters.mode,
    });
  };
  let browser: Browser | undefined;
  let app: Awaited<ReturnType<typeof startApp>> | undefined;
  try {
    await phase("capture");
    browser = await chromium.launch({ headless: true });
    let openapi: unknown = null;
    if (config.openapi) {
      const response = await fetch(new URL(config.openapi, config.target), {
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw Error(`OpenAPI HTTP ${response.status}`);
      const text = await readBoundedBody(response.body, 2 * 1024 * 1024);
      if (Buffer.byteLength(text) > 2 * 1024 * 1024)
        throw Error("OpenAPI document exceeds 2 MB.");
      openapi = JSON.parse(text);
      await save("openapi.json", openapi);
    }
    const capture = await captureTarget(
      browser,
      config,
      path.join(output, "original"),
    );
    await save("observations.json", capture);
    const endpoints = discoverEndpoints(
      openapi,
      Object.values(capture.baselines).flatMap((o) => o.network),
    );
    if (!endpoints.length)
      throw Error(
        "No endpoints discovered. Supply OpenAPI or observable API interactions.",
      );
    await phase("endpoints");
    const edges = await classifyEndpoints(endpoints, audit);
    await save("endpoints.json", { endpoints, edges });
    await phase("layout");
    await mapScreens(capture.screens, endpoints, audit);
    await save("layouts.json", capture.screens);
    await phase("generation");
    const components = await generateComponents(capture.screens, audit);
    await save("layouts.json", capture.screens);
    await compileComponents(browser, capture.screens, components);
    await save("layouts.json", capture.screens);
    await phase("wiring");
    await emitApp(
      path.join(output, "app"),
      { target: config.target, endpoints, edges, screens: capture.screens },
      components,
    );
    app = await startApp(path.join(output, "app"));
    await phase("verification");
    const report = await verifyRebuild(
      browser,
      config,
      capture,
      endpoints,
      app.url,
      output,
    );
    await save("verification.json", report);
    const cost = summarizeCost(audit, rates, report.status === "passed");
    await save("cost.json", cost);
    await save("status.json", {
      stage: "complete",
      status: report.status,
      mode: audit.adapters.mode,
    });
    const url = app.url;
    if (!options.keepAlive) app.close();
    return {
      output,
      url,
      report,
      cost,
      close: () => app?.close(),
    };
  } catch (error) {
    app?.close();
    await save("verification.json", {
      status: "failed",
      stage,
      error: error instanceof Error ? error.message : "Pipeline failed",
      scope: "No completion claim; inspect persisted artifacts.",
    });
    await save("status.json", {
      status: "failed",
      stage,
      mode: audit.adapters.mode,
    });
    await save("cost.json", summarizeCost(audit, rates));
    throw error;
  } finally {
    await browser?.close();
  }
}
function rate(name: string) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0)
    throw Error(`Invalid price per million tokens: ${name}`);
  return value;
}
