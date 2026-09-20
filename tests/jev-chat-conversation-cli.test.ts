import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JevTransport } from "../lib/jev-chat/types";
import { hashValue } from "../lib/jev-chat/graph";

const fixture = {
  version: "jev-chat-conversation-v1",
  id: "synthetic-follow-up",
  category: "continuity",
  input: { topic: "guide", notes: "" },
  turns: [
    {
      id: "capabilities",
      question: "What can you do?",
      expectations: { expectedIntent: "capabilities" },
      evidenceNotes: "Synthetic capability check, not a quality judgment.",
    },
    {
      id: "thanks",
      question: "Thanks!",
      expectations: { expectedIntent: "acknowledge" },
      evidenceNotes: "Synthetic acknowledgement, not a quality judgment.",
    },
  ],
};
const cli = (...args: string[]) =>
  spawnSync("pnpm", ["exec", "tsx", "scripts/jev-chat-benchmark.ts", ...args], {
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, TYPESAFE_API_KEY: "synthetic-offline-unused-key" },
  });

const transport: JevTransport = async (payload) => ({
  answers: Object.fromEntries(
    Object.entries(payload.questions).map(([id, q]) => [
      id,
      q.type === "noul"
        ? { type: "noul", noul: id === "conflict" ? 0 : 0.95 }
        : {
            type: "choice",
            choice:
              id === "intent"
                ? String(
                    (payload.state as { resolved_question: string })
                      .resolved_question,
                  ) === "Thanks!"
                  ? "acknowledge"
                  : "capabilities"
                : Object.keys(q.criteria!)[0],
            confidence: 0.95,
          },
    ]),
  ),
});

test("conversation CLI plans offline, reserves private outputs and refuses overwrite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jev-conversation-cli-"));
  try {
    const source = join(directory, "fixture.json");
    const output = join(directory, "plan.json");
    await writeFile(source, JSON.stringify(fixture));
    const args = ["--conversation", source, "--max-requests", "4"];
    const stdout = cli(...args);
    assert.equal(stdout.status, 0, stdout.stderr);
    const plan = JSON.parse(stdout.stdout);
    assert.equal(plan.version, "jev-chat-conversation-plan-v1");
    assert.equal(plan.mode, "plan");
    assert.equal(plan.fixture.turns.length, 2);
    assert.ok(!stdout.stdout.includes("synthetic-offline-unused-key"));
    const saved = cli(...args, "--output", output);
    assert.equal(saved.status, 0, saved.stderr);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    const original = await readFile(output, "utf8");
    const repeated = cli(...args, "--output", output);
    assert.notEqual(repeated.status, 0);
    assert.equal(await readFile(output, "utf8"), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("conversation CLI rejects mixed modes and invalid limits before execution", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jev-conversation-cli-"));
  try {
    const source = join(directory, "fixture.json");
    const output = join(directory, "must-not-exist.json");
    await writeFile(source, JSON.stringify(fixture));
    for (const flags of [
      ["--cases", "capabilities"],
      ["--fixtures", source],
      ["--verify"],
      ["--report", source],
      ["--max-requests", "21"],
    ]) {
      const result = cli(
        "--conversation",
        source,
        "--max-requests",
        "4",
        ...flags,
        "--output",
        output,
      );
      assert.notEqual(result.status, 0, JSON.stringify(flags));
      await assert.rejects(() => stat(output), { code: "ENOENT" });
    }
    const missingOutput = cli(
      "--conversation",
      source,
      "--max-requests",
      "4",
      "--live",
    );
    assert.notEqual(missingOutput.status, 0);
    assert.match(missingOutput.stderr, /output path/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("conversation CLI replays reports offline and rejects a changed preceding reply", async () => {
  const { runConversationBenchmark } =
    await import("../lib/jev-chat/conversation-benchmark");
  const directory = await mkdtemp(join(tmpdir(), "jev-conversation-cli-"));
  try {
    const report = await runConversationBenchmark(fixture, {
      maxRequests: 4,
      execution: "mocked",
      transport,
    });
    const source = join(directory, "report.json");
    const output = join(directory, "verified.json");
    await writeFile(source, JSON.stringify(report));
    const verified = cli("--report", source, "--verify", "--output", output);
    assert.equal(verified.status, 0, verified.stderr);
    const summary = JSON.parse(verified.stdout);
    assert.equal(summary.verification, "internal-consistency");
    assert.equal(summary.status, "completed");
    assert.equal(summary.execution, "mocked");
    assert.equal(summary.summary.completed, 2);
    assert.equal(summary.summary.requests, 2);
    assert.equal(summary.quality.latestLlmParity, "unproven");
    assert.equal(summary.attribution, "unverified");
    const restored = JSON.parse(await readFile(output, "utf8"));
    assert.equal(
      restored.turns[1].benchmark.cases[0].fixture.input.messages[1].text,
      report.turns[0].benchmark!.cases[0].result!.text,
    );
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    const changed = structuredClone(report);
    const entry = changed.turns[1].benchmark!.cases[0];
    entry.fixture.input.messages[1].text += " Synthetic forged continuation.";
    entry.inputHash = await hashValue(entry.fixture.input);
    const invalid = join(directory, "changed.json");
    const rejectedOutput = join(directory, "rejected.json");
    await writeFile(invalid, JSON.stringify(changed));
    const rejected = cli(
      "--report",
      invalid,
      "--verify",
      "--output",
      rejectedOutput,
    );
    assert.notEqual(rejected.status, 0);
    await assert.rejects(() => stat(rejectedOutput), { code: "ENOENT" });
    const mixed = cli(
      "--report",
      source,
      "--verify",
      "--live",
      "--output",
      rejectedOutput,
    );
    assert.notEqual(mixed.status, 0);
    await assert.rejects(() => stat(rejectedOutput), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("offline verify retains independent-case benchmark support", async () => {
  const { runLiveBenchmark } = await import("../lib/jev-chat/benchmark");
  const directory = await mkdtemp(join(tmpdir(), "jev-conversation-cli-"));
  try {
    const report = await runLiveBenchmark(
      {
        version: "jev-chat-evaluation-v1",
        cases: [
          {
            id: fixture.turns[0].id,
            category: fixture.category,
            input: {
              ...fixture.input,
              messages: [{ role: "user", text: fixture.turns[0].question }],
            },
            expectations: fixture.turns[0].expectations,
            evidenceNotes: fixture.turns[0].evidenceNotes,
          },
        ],
      },
      {
        maxRequests: 2,
        caseIds: [fixture.turns[0].id],
        execution: "mocked",
        transport,
      },
    );
    const source = join(directory, "report.json");
    await writeFile(source, JSON.stringify(report));
    const result = cli("--report", source, "--verify");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).summary.completed, 1);
    assert.equal(JSON.parse(result.stdout).execution, "mocked");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
