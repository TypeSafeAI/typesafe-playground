import test from "node:test";
import assert from "node:assert/strict";
import { analysisPayload, respond } from "../lib/jev-chat/engine";
import { buildContext } from "../lib/jev-chat/knowledge";
import { validatePayload } from "../lib/api";
import type { RunPayload } from "../lib/api";
import type { EngineInput, JevTransport } from "../lib/jev-chat/types";

const request = (seed = 42): EngineInput => ({
  messages: [
    {
      role: "user",
      text: "Write a fictional scene with any character except the keeper; invent the rest.",
    },
  ],
  topic: "creative",
  notes: "",
  mode: "live",
  style: "balanced",
  seed,
});
const noul = (value: number) => ({ type: "noul", noul: value });
const choice = (value: string) => ({
  type: "choice",
  choice: value,
  confidence: 0.95,
});
function transport(
  overrides: Record<string, unknown> = {},
  calls: RunPayload[] = [],
): JevTransport {
  return async (payload) => {
    validatePayload(payload);
    calls.push(payload);
    const answers = Object.fromEntries(
      Object.entries(payload.questions).map(([id, q]) => {
        if (Object.hasOwn(overrides, id)) return [id, overrides[id]];
        if (q.type === "noul")
          return [
            id,
            noul(
              id === "conflict" || id === "story_allows_character_keeper"
                ? 0.05
                : 0.95,
            ),
          ];
        if (q.type === "score")
          return [
            id,
            {
              type: "score",
              score: 0.5,
              confidence: 0.1,
              probabilities: { "0": 0.5, "1": 0.5 },
            },
          ];
        return [
          id,
          choice(
            id === "intent"
              ? "create"
              : id === "story_mode_character"
                ? "constrained"
                : id === "story_mode_style"
                  ? "preserved"
                  : id.startsWith("story_mode_")
                    ? "delegated"
                    : Object.keys(q.criteria!)[0],
          ),
        ];
      }),
    );
    return { answers };
  };
}
const characters = [
  "keeper",
  "cartographer",
  "mechanic",
  "gardener",
  "courier",
  "archivist",
];
const characterScores = (score: number) =>
  Object.fromEntries(
    characters.map((id) => [`story_allows_character_${id}`, noul(score)]),
  );

test("partial constraints use independent acceptance sets and exclude rejected values", async () => {
  const calls: RunPayload[] = [];
  const found = new Set<string>();
  for (const seed of [0, 1, 2, 42, 0xffffffff]) {
    const result = await respond(request(seed), {
      transport: transport({}, calls),
    });
    assert.equal(result.status, "answered");
    assert.ok(result.story);
    assert.notEqual(result.story.choices.character, "keeper");
    found.add(result.story.choices.character);
    assert.equal(result.trace.calls, 2);
  }
  assert.ok(
    found.size > 1,
    "permitted alternatives should retain seeded diversity",
  );
  const q = calls[0].questions;
  assert.equal(q.creative_character, undefined);
  assert.equal(q.story_tone, undefined);
  assert.equal(
    Object.keys(q).filter((id) => id.startsWith("story_allows_")).length,
    32,
  );
  assert.equal(q.story_allows_character_keeper.type, "noul");
});

test("singleton acceptance keeps exact requirements and the 0.8 boundary", async () => {
  const accepted = {
    ...characterScores(0.79),
    story_allows_character_mechanic: noul(0.8),
    story_mode_style: choice("constrained"),
    story_allows_style_concise: noul(0.8),
    story_allows_style_balanced: noul(0.79),
    story_allows_style_detailed: noul(0),
  };
  const result = await respond(request(), { transport: transport(accepted) });
  assert.equal(result.story?.choices.character, "mechanic");
  assert.equal(result.story?.style, "concise");
  const empty = await respond(request(), {
    transport: transport({
      ...accepted,
      story_allows_character_mechanic: noul(0.799999),
    }),
  });
  assert.equal(empty.status, "clarify");
  assert.equal(empty.story, undefined);
  assert.equal(empty.trace.calls, 1);
});

test("every acceptance answer is validated even for delegated fields", async () => {
  for (const invalid of [
    undefined,
    null,
    {},
    { type: "choice", choice: "coast" },
    noul(-1),
    noul(1.01),
    noul(NaN),
    { type: "noul", noul: "0.95" },
  ]) {
    await assert.rejects(
      () =>
        respond(request(), {
          transport: transport({
            story_allows_setting_coast: invalid,
          }),
        }),
      /incomplete evidence judgment/i,
    );
  }
});

test("whole-response acceptance still rejects incompatible combinations of individually accepted values", async () => {
  const rejected = await respond(request(), {
    transport: transport({
      supported_story_0: noul(0.79),
      supported_story_1: noul(0),
      supported_story_2: noul(0.4),
    }),
  });
  assert.equal(rejected.status, "clarify");
  assert.equal(rejected.story, undefined);
  assert.equal(rejected.trace.calls, 2);
});

test("maximum evidence and creative acceptance questions fit the unchanged request schema", () => {
  const input = request();
  input.topic = "support";
  input.notes = Array.from({ length: 40 }, (_, i) =>
    i < 32
      ? `Item ${String.fromCharCode(65 + (i % 26))} costs ${i + 1} credits.`
      : `Reference ${String.fromCharCode(65 + (i % 26))} has no numerical fact.`,
  ).join("\n\n");
  const payload = analysisPayload(buildContext(input));
  assert.equal(
    Object.keys(payload.questions.calculation_left.criteria!).length,
    33,
  );
  assert.equal(
    Object.keys(payload.questions).filter((id) =>
      id.startsWith("story_allows_"),
    ).length,
    32,
  );
  assert.ok(Object.keys(payload.questions).length <= 100);
  assert.ok(JSON.stringify(payload).length <= 100_000);
  assert.doesNotThrow(() => validatePayload(payload));
});

test("benchmark replay retains acceptance sets and rejects changes that alter the scene", async () => {
  const { runLiveBenchmark, parseBenchmarkReport } =
    await import("../lib/jev-chat/benchmark");
  const { mode: _mode, ...input } = request();
  const fixtures = {
    version: "jev-chat-evaluation-v1",
    cases: [
      {
        id: "partial-creative-constraint",
        category: "creative",
        input,
        expectations: {
          expectedIntent: "create",
          requiredSubstrings: ["fictional"],
        },
        evidenceNotes:
          "Mocked acceptance-set replay, not a live semantic evaluation.",
      },
    ],
  };
  const report = await runLiveBenchmark(fixtures, {
    execution: "mocked",
    caseIds: ["partial-creative-constraint"],
    maxRequests: 2,
    transport: transport({
      ...characterScores(0),
      story_allows_character_mechanic: noul(0.95),
    }),
  });
  assert.equal(report.cases[0].result?.story?.choices.character, "mechanic");
  const imported = await parseBenchmarkReport(
    JSON.parse(JSON.stringify(report)),
  );
  assert.equal(imported.cases[0].status, "completed");
  const changed = structuredClone(report);
  changed.cases[0].requests[0].answers!.story_allows_character_mechanic =
    noul(0);
  changed.cases[0].requests[0].answers!.story_allows_character_courier =
    noul(0.95);
  await assert.rejects(() => parseBenchmarkReport(changed), /replay/i);
});
