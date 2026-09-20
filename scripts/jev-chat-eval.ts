import { open, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_EVALUATION_BYTES,
  runOfflineEvaluation,
} from "../lib/jev-chat/evaluation";

const usage =
  "Usage: pnpm exec tsx scripts/jev-chat-eval.ts [--fixtures path.json] [--output path.json]\nOffline demo only. No credentials, live mode, provider calls, or model-quality scoring.";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(`${usage}\n`);
    return;
  }
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    const value = args[i + 1];
    if (
      !["--fixtures", "--output"].includes(name) ||
      !value ||
      value.startsWith("--") ||
      options.has(name)
    )
      throw Error(usage);
    options.set(name, value);
  }
  const fixturePath = options.get("--fixtures")
    ? resolve(options.get("--fixtures")!)
    : fileURLToPath(
        new URL("../tests/fixtures/jev-chat-evaluation.json", import.meta.url),
      );
  const file = await open(fixturePath, "r");
  let raw: string;
  try {
    if (!(await file.stat()).isFile())
      throw Error("Fixtures must be a regular JSON file.");
    // Bound the actual read, even if the file grows after stat.
    const buffer = Buffer.alloc(MAX_EVALUATION_BYTES + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        offset,
        buffer.length - offset,
        null,
      );
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > MAX_EVALUATION_BYTES)
      throw Error("Fixture file exceeds 2 MiB.");
    raw = buffer.subarray(0, offset).toString("utf8");
  } finally {
    await file.close();
  }
  let fixtures: unknown;
  try {
    fixtures = JSON.parse(raw);
  } catch {
    throw Error("Fixtures must contain valid JSON.");
  }
  const report = await runOfflineEvaluation(fixtures);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const output = options.get("--output");
  if (output) {
    const path = resolve(output);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, json, "utf8");
    process.stderr.write(
      `Wrote ${report.caseCount} offline cases to ${path}. Semantic quality, live Jev quality, and model comparison remain unmeasured.\n`,
    );
  } else {
    process.stdout.write(json);
  }
  // Assertion failures are diagnostic results, not harness execution failures.
  if (
    report.summary.baseline.failedCases ||
    report.summary.composition.failedCases
  )
    process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Offline evaluation failed."}\n`,
  );
  process.exitCode = 1;
});
