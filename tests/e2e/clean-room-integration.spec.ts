import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  demos,
  startDemoTarget,
  demoAdapters,
} from "../../src/clean-room/demos";
import { chromium, test } from "@playwright/test";
import { startApp } from "../../src/clean-room/emit";
import { verifyRebuild } from "../../src/clean-room/verify";
import { configSchema, flatten } from "../../src/clean-room/contracts";
import { runPipeline } from "../../src/clean-room/run";

for (const demo of ["catalog", "contacts", "support"] as const)
  test(`clean-room ${demo} demo rebuild works end to end`, async () => {
    test.setTimeout(120000);
    const target = await startDemoTarget();
    const output = await mkdtemp(path.join(os.tmpdir(), "clean-room-"));
    try {
      const result = await runPipeline(
        { ...demos[demo].config, target: target.url + "/" },
        { output, adapters: demoAdapters(), keepAlive: false },
      );
      assert.equal(
        result.report.status,
        "passed",
        JSON.stringify(result.report, null, 2),
      );
      assert.ok(result.report.checks.length >= 2);
      const decisions = JSON.parse(
        await readFile(path.join(output, "decisions.json"), "utf8"),
      );
      assert.ok(decisions.some((d: any) => d.stage === "generation-gate"));
      const generation = JSON.parse(
        await readFile(path.join(output, "generation.json"), "utf8"),
      );
      if (demo !== "support")
        assert.equal(
          generation.length,
          1,
          "one list item definition reused across identical rows",
        );
      const cost = JSON.parse(
        await readFile(path.join(output, "cost.json"), "utf8"),
      );
      assert.equal(cost.mode, "mock");
      assert.equal(cost.generationCalls, 0);
      assert.equal(cost.componentEmissions, generation.length);
      assert.ok(
        generation.every(
          (entry: any) => entry.output.implementation === "deterministic",
        ),
      );
      assert.equal(cost.totalCostUsd, null);
      assert.ok(
        (
          await readFile(path.join(output, "app", "server.mjs"), "utf8")
        ).includes("createServer"),
      );
      if (demo === "catalog") {
        const manifest = JSON.parse(
          await readFile(path.join(output, "app", "manifest.json"), "utf8"),
        );
        for (const n of flatten(manifest.screens[0].root))
          if (n.kind === "action") n.endpoint = "none";
        await writeFile(
          path.join(output, "app", "manifest.js"),
          `export const manifest = ${JSON.stringify(manifest)};`,
        );
        const app = await startApp(path.join(output, "app"));
        const browser = await chromium.launch();
        try {
          const capture = JSON.parse(
            await readFile(path.join(output, "observations.json"), "utf8"),
          );
          const report = await verifyRebuild(
            browser,
            configSchema.parse({
              ...demos.catalog.config,
              target: target.url,
            }),
            capture,
            manifest.endpoints,
            app.url,
            output,
          );
          assert.equal(report.status, "review-required");
          assert.ok(
            report.checks.some((c) =>
              c.discrepancies.some((d) => d.includes("network")),
            ),
            "a rendered but unwired search must fail independent verification",
          );
        } finally {
          await browser.close();
          app.close();
        }
      }
    } finally {
      await target.close();
      await rm(output, { recursive: true, force: true });
    }
  });
