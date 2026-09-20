import { open, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  assessComparisons,
  createBenchmarkPlan,
  parseBenchmarkReport,
  runLiveBenchmark,
} from "../lib/jev-chat/benchmark";
import {
  createConversationPlan,
  parseConversationReport,
  runConversationBenchmark,
} from "../lib/jev-chat/conversation-benchmark";

const help = `Plan (no network): pnpm exec tsx scripts/jev-chat-benchmark.ts --fixtures cases.json --cases id1,id2 --max-requests 4
Conversation plan (no network): use --conversation conversation.json --max-requests 8 instead of --fixtures/--cases.
Run: add --live --output report.json; uses TYPESAFE_API_KEY from the environment.
Review (no network): pnpm exec tsx scripts/jev-chat-benchmark.ts --report report.json --comparisons outputs.json --reviews reviews.json --output assessment.json
Verify/replay (no network): use --report report.json --verify; optional --output saves the revalidated report.
Limits: 10 selected cases or conversation turns, 20 requests, 2 calls/turn, no automatic retries. Output paths must be new.`;
async function readJson(
  path: string,
  limit = 2 * 1024 * 1024,
): Promise<unknown> {
  const file = await open(resolve(path), "r");
  try {
    if (!(await file.stat()).isFile())
      throw Error("Input must be a regular JSON file.");
    const buffer = Buffer.alloc(limit + 1);
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
    if (offset > limit) throw Error("Input file exceeds its size limit.");
    try {
      return JSON.parse(buffer.subarray(0, offset).toString("utf8"));
    } catch {
      throw Error("Input must contain valid JSON.");
    }
  } finally {
    await file.close();
  }
}
async function reserve(path: string) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify({ status: "initializing" }) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  return async (value: unknown) => {
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", {
        flag: "wx",
        mode: 0o600,
      });
      await rename(temporary, target);
    } finally {
      await unlink(temporary).catch(() => {});
    }
  };
}
async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean" },
      live: { type: "boolean" },
      fixtures: { type: "string" },
      conversation: { type: "string" },
      cases: { type: "string" },
      "max-requests": { type: "string" },
      output: { type: "string" },
      report: { type: "string" },
      comparisons: { type: "string" },
      reviews: { type: "string" },
      verify: { type: "boolean" },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    process.stdout.write(help + "\n");
    return;
  }
  if (values.report !== undefined) {
    if (
      values.live ||
      values.fixtures !== undefined ||
      values.conversation !== undefined ||
      values.cases !== undefined ||
      values["max-requests"] !== undefined ||
      (values.verify
        ? values.comparisons || values.reviews
        : !values.output || (!values.comparisons && !values.reviews))
    )
      throw Error(help);
    const raw = await readJson(values.report, 16 * 1024 * 1024);
    if (values.verify) {
      const report =
        raw &&
        typeof raw === "object" &&
        "version" in raw &&
        raw.version === "jev-chat-conversation-benchmark-v1"
          ? await parseConversationReport(raw)
          : await parseBenchmarkReport(raw);
      if (values.output) await (await reserve(values.output))(report);
      process.stdout.write(
        JSON.stringify({
          verification: "internal-consistency",
          status: report.status,
          execution: report.execution,
          summary: report.summary,
          quality: report.quality,
          attribution: "unverified",
        }) + "\n",
      );
      return;
    }
    const report = await parseBenchmarkReport(raw);
    const assessment = await assessComparisons(
      report,
      values.comparisons ? await readJson(values.comparisons) : undefined,
      values.reviews ? await readJson(values.reviews) : undefined,
    );
    await (
      await reserve(values.output!)
    )(assessment);
    process.stdout.write(
      "Imported assessment saved. Model/reviewer attribution is unverified; LLM parity remains unproven.\n",
    );
    return;
  }
  if (
    (values.conversation !== undefined
      ? values.fixtures !== undefined || values.cases !== undefined
      : !values.fixtures || !values.cases) ||
    !/^(?:[1-9]|1\d|20)$/.test(values["max-requests"] ?? "") ||
    values.comparisons ||
    values.reviews ||
    values.verify
  )
    throw Error(help);
  const fixtures = await readJson(values.conversation ?? values.fixtures!);
  const limits = {
    caseIds: values.cases?.split(",").map((id) => id.trim()) ?? [],
    maxRequests: Number(values["max-requests"]),
  };
  const plan =
    values.conversation !== undefined
      ? await createConversationPlan(fixtures, {
          maxRequests: limits.maxRequests,
        })
      : await createBenchmarkPlan(fixtures, limits);
  if (!values.live) {
    if (values.output) await (await reserve(values.output))(plan);
    else process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
    return;
  }
  if (!values.output)
    throw Error("Live execution requires an explicit new --output path.");
  if (!process.env.TYPESAFE_API_KEY?.trim())
    throw Error(
      "Set TYPESAFE_API_KEY in the environment for explicit live execution. No .env file is loaded automatically.",
    );
  const save = await reserve(values.output);
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    // Imported only after explicit live flags, bounds, output reservation and credential presence checks.
    const { serverJevTransport } = await import("../lib/serverJev");
    const common = {
      maxRequests: limits.maxRequests,
      execution: "live" as const,
      transport: serverJevTransport,
      signal: abort.signal,
      onUpdate: save,
    };
    const report =
      values.conversation !== undefined
        ? await runConversationBenchmark(fixtures, common)
        : await runLiveBenchmark(fixtures, {
            ...common,
            caseIds: limits.caseIds,
          });
    process.stdout.write(
      JSON.stringify({
        status: report.status,
        stopReason: report.stopReason,
        summary: report.summary,
        quality: report.quality,
      }) + "\n",
    );
    if (report.status !== "completed" || report.summary.failed)
      process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Benchmark failed."}\n`,
  );
  process.exitCode = 1;
});
