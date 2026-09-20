import { readFile } from "node:fs/promises";
import path from "node:path";
import { demoAdapters, demos, startDemoTarget } from "../src/clean-room/demos";
import { liveAdapters } from "../src/clean-room/models";
import { runPipeline } from "../src/clean-room/run";
import { parseArgs } from "node:util";
async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {}
  const { values } = parseArgs({
    options: {
      demo: { type: "string" },
      config: { type: "string" },
      output: { type: "string" },
      live: { type: "boolean" },
      serve: { type: "boolean" },
      help: { type: "boolean" },
    },
    strict: true,
  });
  if (values.help || (!values.demo && !values.config)) {
    console.log(
      "pnpm clean-room --demo catalog|contacts|support [--live] [--serve] [--output directory]\npnpm clean-room --config target.json [--serve] [--output directory]\nDemo mode simulates Jev choices unless --live is supplied. Custom targets use live Jev. All component generation is local and deterministic; no other model is used.",
    );
    return;
  }
  if (values.demo && values.config)
    throw Error("Choose either --demo or --config.");
  if (values.demo && !Object.hasOwn(demos, values.demo))
    throw Error("Unknown demo. Choose catalog, contacts, or support.");
  const target = values.demo ? await startDemoTarget() : null;
  const config = values.demo
    ? {
        ...demos[values.demo as keyof typeof demos].config,
        target: target!.url,
      }
    : JSON.parse(await readFile(values.config!, "utf8"));
  const output = path.resolve(
    values.output || `.clean-room/${values.demo || "custom"}-${Date.now()}`,
  );
  try {
    const result = await runPipeline(config, {
      output,
      adapters: values.demo && !values.live ? demoAdapters() : liveAdapters(),
      keepAlive: values.serve,
      onStage: (stage) => console.log(`Stage: ${stage}`),
    });
    console.log(
      JSON.stringify(
        {
          status: result.report.status,
          output,
          checks: result.report.checks.map(
            ({ id, passed, discrepancies, pixelDifference }) => ({
              id,
              passed,
              discrepancies,
              pixelDifference,
            }),
          ),
          cost: result.cost,
          ...(values.serve ? { url: result.url, target: target?.url } : {}),
        },
        null,
        2,
      ),
    );
    if (result.report.status !== "passed") process.exitCode = 1;
    if (values.serve) {
      const close = () => {
        result.close();
        void target?.close();
      };
      process.once("SIGINT", close);
      process.once("SIGTERM", close);
      console.log("Demo servers remain available until Ctrl-C.");
    } else await target?.close();
  } catch (e) {
    await target?.close();
    throw e;
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Pipeline failed");
  process.exitCode = 1;
});
