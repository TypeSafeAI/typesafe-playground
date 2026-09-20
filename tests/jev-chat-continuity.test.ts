import test from "node:test";
import assert from "node:assert/strict";
import { respond } from "../lib/jev-chat/engine";
import { buildContext } from "../lib/jev-chat/knowledge";
import { validatePayload } from "../lib/api";
import { creativeLexicon, seededChoices } from "../lib/jev-chat/story";
import { storyControls } from "../lib/jev-chat/creative";
import {
  parseSavedResult,
  verifySavedResult,
} from "../lib/jev-chat/persistence";
import type {
  EngineInput,
  EngineResult,
  JevTransport,
} from "../lib/jev-chat/types";

const input = (text: string): EngineInput => ({
  messages: [{ role: "user", text }],
  topic: "creative",
  notes: "",
  mode: "demo",
  style: "balanced",
  seed: 42,
});
const follow = (first: EngineResult, text: string): EngineInput => ({
  ...input(text),
  messages: [
    {
      role: "assistant",
      text: first.text,
      story: first.story,
      options: first.options,
    },
    { role: "user", text },
  ],
});
test("polite ordinal references resolve only the complete reference and preserve extra requirements", async () => {
  const first = await respond({ ...input("What can you do?"), topic: "guide" });
  for (const text of [
    "The second one, please.",
    "Please, the second option!",
    "please 2",
    "2 please",
  ]) {
    const context = buildContext({ ...follow(first, text), topic: "guide" });
    assert.equal(context.question, first.options[1], text);
    assert.equal(context.originalQuestion, text);
    assert.equal(context.referenceUnresolved, false);
    assert.equal(context.state.latest_message, text);
  }
  for (const text of [
    "Do not choose the second one, please.",
    "The second one, please, but with three dragons.",
    "Please the second one and the third one.",
  ]) {
    const context = buildContext({ ...follow(first, text), topic: "guide" });
    assert.equal(context.question, text);
  }
  const missing = buildContext({
    ...input("The second one, please."),
    topic: "guide",
  });
  assert.equal(missing.referenceUnresolved, true);
  const stale = follow(first, "The second one, please.");
  stale.messages.splice(1, 0, {
    role: "assistant",
    text: "No options in this reply.",
  });
  assert.equal(buildContext(stale).referenceUnresolved, true);
  const liveResult = await respond(
    {
      ...follow(first, "The second one, please."),
      topic: "guide",
      mode: "live",
    },
    { transport: live() },
  );
  assert.equal(liveResult.intent, "create");
  assert.ok(liveResult.story);
  assert.equal(liveResult.trace.calls, 2);
});
test("demo revises tone, ending and detail while preserving the established story", async () => {
  const first = await respond(input("Write a short story about a lighthouse"));
  assert.ok(first.story);
  const tense = await respond(follow(first, "Make it more suspenseful"));
  assert.equal(tense.story?.tone, "suspenseful");
  assert.deepEqual(tense.story?.choices, first.story.choices);
  assert.equal(tense.story?.theme, first.story.theme);
  assert.equal(tense.story?.variant, first.story.variant);
  assert.notEqual(tense.text, first.text);
  const open = await respond(follow(tense, "Give it an open ending"));
  assert.equal(open.story?.ending, "open");
  assert.equal(open.story?.tone, "suspenseful");
  const short = await respond(follow(open, "Make it shorter"));
  assert.equal(short.story?.style, "concise");
  assert.equal(short.story?.ending, "open");
  assert.ok(short.text.length < open.text.length);
  assert.equal(await verifySavedResult(short, ""), true);
});
test("unsupported edits and edits without a current story clarify", async () => {
  const first = await respond(input("Write a short story"));
  for (const text of [
    "Make it more suspenseful and add three dragons",
    "Make it hopeful and suspenseful",
  ]) {
    const result = await respond(follow(first, text));
    assert.equal(result.status, "clarify", text);
    assert.equal(result.story, undefined);
  }
  assert.equal(
    (await respond(input("Make it more suspenseful"))).status,
    "clarify",
  );
  const stale = follow(first, "Make it more suspenseful");
  stale.messages.splice(1, 0, { role: "assistant", text: "Unrelated answer." });
  assert.equal((await respond(stale)).status, "clarify");
});
test("story metadata must match its response and survive allowlisted persistence", async () => {
  const result = await respond(input("Write a short story"));
  const saved = parseSavedResult(JSON.parse(JSON.stringify(result)))!;
  assert.deepEqual(saved.story, result.story);
  assert.equal(await verifySavedResult(saved, ""), true);
  const tampered = structuredClone(saved);
  tampered.story!.tone = "suspenseful";
  assert.equal(await verifySavedResult(tampered, ""), false);
  const stripped = structuredClone(saved);
  delete stripped.story;
  assert.equal(await verifySavedResult(stripped, ""), false);
  const bad = follow(result, "Make it shorter");
  bad.messages[0].text += " altered";
  await assert.rejects(() => respond(bad), /story frame/i);
});
const choice = (id: string, confidence = 0.95) => ({
  type: "choice",
  choice: id,
  confidence,
});
const score = (value: number) => ({
  type: "score",
  score: value,
  confidence: 0.3,
  probabilities: { "0": 1 - value, "1": value },
});
const vocabulary = { ...creativeLexicon, ...storyControls };
function accept(
  field: keyof typeof vocabulary,
  values: string[],
  level = 0.95,
) {
  return Object.fromEntries(
    Object.keys(vocabulary[field]).map((id) => [
      `story_allows_${field}_${id}`,
      { type: "noul", noul: values.includes(id) ? level : 0.05 },
    ]),
  );
}
const defaultAcceptance: Record<string, unknown> = Object.assign(
  {},
  ...Object.entries(vocabulary).map(([field, criteria]) =>
    accept(field as keyof typeof vocabulary, [Object.keys(criteria)[0]]),
  ),
);
function live(overrides: Record<string, unknown> = {}): JevTransport {
  return async (payload) => {
    validatePayload(payload);
    return {
      answers: Object.fromEntries(
        Object.entries(payload.questions).map(([id, q]) => [
          id,
          overrides[id] ??
            defaultAcceptance[id] ??
            (q.type === "noul"
              ? {
                  type: "noul",
                  noul: id === "conflict" ? 0.05 : 0.95,
                }
              : q.type === "score"
                ? score(0.5)
                : choice(
                    id === "intent"
                      ? "create"
                      : id.startsWith("story_mode_") &&
                          (id === "story_mode_style" ||
                            (
                              overrides.story_action as
                                { choice?: string } | undefined
                            )?.choice === "revise")
                        ? "preserved"
                        : Object.keys(q.criteria!)[0],
                  )),
        ]),
      ),
    };
  };
}
test("live revisions use gated typed edits and preserve unrequested slots within two calls", async () => {
  const first = await respond(input("Write a story about a lighthouse"));
  const request = {
    ...follow(first, "Make it more suspenseful"),
    mode: "live" as const,
  };
  const changes = {
    story_action: choice("revise"),
    ...accept("tone", ["suspenseful"]),
    story_mode_tone: choice("constrained"),
  };
  const result = await respond(request, { transport: live(changes) });
  assert.equal(result.story?.tone, "suspenseful");
  assert.deepEqual(result.story?.choices, first.story?.choices);
  assert.equal(result.trace.calls, 2);
  for (const override of [
    accept("tone", ["suspenseful"], 0.4),
    { story_mode_tone: choice("constrained", 0.5) },
    { story_supported: { type: "noul", noul: 0.4 } },
  ]) {
    const uncertain = await respond(request, {
      transport: live({ ...changes, ...override }),
    });
    assert.equal(uncertain.status, "clarify");
    assert.equal(uncertain.trace.calls, 1);
  }
  await assert.rejects(
    () =>
      respond(request, {
        transport: live({
          ...changes,
          story_allows_tone_suspenseful: { type: "noul", noul: 2 },
        }),
      }),
    /incomplete evidence judgment/i,
  );
});

test("new live stories require accepted constrained values; unused revision sets cannot change identity", async () => {
  const request = { ...input("Write a short story"), mode: "live" as const };
  const low = await respond(request, {
    transport: live(accept("character", ["keeper"], 0.3)),
  });
  assert.equal(low.status, "clarify");
  assert.equal(low.trace.calls, 1);
  const first = await respond(input("Write a short story"));
  const result = await respond(
    { ...follow(first, "Make it hopeful"), mode: "live" },
    {
      transport: live({
        story_action: choice("revise"),
        ...accept("tone", ["hopeful"]),
        story_mode_tone: choice("constrained"),
        ...accept("character", ["keeper"], 0.3),
      }),
    },
  );
  assert.equal(result.story?.tone, "hopeful");
  assert.deepEqual(result.story?.choices, first.story?.choices);
});

test("benchmark imports and offline replay retain the exact story context", async () => {
  const { createBenchmarkPlan, runLiveBenchmark, parseBenchmarkReport } =
    await import("../lib/jev-chat/benchmark");
  const first = await respond(input("Write a short story"));
  const { mode: _mode, ...request } = follow(first, "Make it hopeful");
  const fixtures = {
    version: "jev-chat-evaluation-v1",
    cases: [
      {
        id: "revise-story",
        category: "creative",
        input: request,
        expectations: {
          expectedIntent: "create",
          requiredSubstrings: ["fictional"],
        },
        evidenceNotes:
          "A synthetic revision case for frame replay, not a measure of creative quality.",
      },
    ],
  };
  const plan = await createBenchmarkPlan(fixtures, {
    caseIds: ["revise-story"],
    maxRequests: 2,
  });
  const altered = structuredClone(fixtures);
  altered.cases[0].input.messages[0].text += " altered";
  await assert.rejects(
    () =>
      createBenchmarkPlan(altered, {
        caseIds: ["revise-story"],
        maxRequests: 2,
      }),
    /story frame/i,
  );
  const wrongRole = structuredClone(fixtures);
  wrongRole.cases[0].input.messages[0].role = "user";
  await assert.rejects(
    () =>
      createBenchmarkPlan(wrongRole, {
        caseIds: ["revise-story"],
        maxRequests: 2,
      }),
    /story frame/i,
  );
  assert.deepEqual(plan.cases[0].fixture.input.messages[0].story, first.story);
  const report = await runLiveBenchmark(fixtures, {
    execution: "mocked",
    caseIds: ["revise-story"],
    maxRequests: 2,
    transport: live({
      story_action: choice("revise"),
      ...accept("tone", ["hopeful"]),
      story_mode_tone: choice("constrained"),
    }),
  });
  assert.equal(report.cases[0].result?.story?.tone, "hopeful");
  const imported = await parseBenchmarkReport(
    JSON.parse(JSON.stringify(report)),
  );
  assert.deepEqual(
    imported.cases[0].result?.story,
    report.cases[0].result?.story,
  );
});

test("engine refuses story accessors before sizing or serializing the conversation", async () => {
  const first = await respond(input("Write a short story"));
  let reads = 0;
  const request = follow(first, "Make it shorter");
  Object.defineProperty(request.messages[0].story, "tone", {
    enumerable: true,
    get() {
      reads++;
      return "reflective";
    },
  });
  await assert.rejects(() => respond(request), /story frame/i);
  assert.equal(reads, 0);
  const messageAccessor = follow(first, "Make it shorter");
  Object.defineProperty(messageAccessor.messages[0], "story", {
    enumerable: true,
    get() {
      reads++;
      return first.story;
    },
  });
  await assert.rejects(() => respond(messageAccessor), /story frame/i);
  assert.equal(reads, 0);
});

const freedom = () =>
  Object.fromEntries([
    ...["character", "setting", "obstacle", "resolution", "tone", "ending"].map(
      (field) => [`story_mode_${field}`, choice("delegated")],
    ),
    ["story_mode_style", choice("preserved")],
    ...Object.keys(vocabulary).flatMap((field) =>
      Object.entries(accept(field as keyof typeof vocabulary, [])),
    ),
  ]);
test("delegated creative freedom uses reproducible local choices and preserves response detail", async () => {
  const request = {
    ...input("Write a fictional scene. Surprise me."),
    mode: "live" as const,
    style: "detailed" as const,
  };
  const result = await respond(request, { transport: live(freedom()) });
  assert.equal(result.status, "answered");
  assert.deepEqual(result.story?.choices, seededChoices(42));
  assert.equal(result.story?.style, "detailed");
  assert.equal(result.trace.calls, 2);
  const changedPreferences = {
    ...freedom(),
    ...accept("character", ["archivist"]),
    ...accept("tone", ["hopeful"]),
  };
  const same = await respond(request, { transport: live(changedPreferences) });
  assert.equal(same.text, result.text);
  assert.equal(same.graph.root, result.graph.root);
});
test("mixed constrained and delegated fields retain explicit requirements and every existing gate", async () => {
  const request = {
    ...input("Write a story about a lighthouse keeper; invent the rest."),
    mode: "live" as const,
  };
  const selected = {
    ...freedom(),
    story_mode_character: choice("constrained"),
    ...accept("character", ["keeper"]),
  };
  const result = await respond(request, { transport: live(selected) });
  assert.equal(result.story?.choices.character, "keeper");
  assert.equal(result.story?.choices.setting, seededChoices(42).setting);
  for (const override of [
    accept("character", ["keeper"], 0.79),
    { story_mode_setting: choice("delegated", 0.79) },
    {
      story_mode_setting: {
        ...choice("delegated"),
        probabilities: { delegated: 0.79 },
      },
    },
    { story_supported: { type: "noul", noul: 0.79 } },
    { story_action: choice("new", 0.79) },
    { intent: choice("create", 0.79) },
    Object.fromEntries(
      [0, 1, 2].map((i) => [
        `supported_story_${i}`,
        { type: "noul", noul: 0.79 },
      ]),
    ),
  ]) {
    const rejected = await respond(request, {
      transport: live({ ...selected, ...override }),
    });
    assert.equal(rejected.status, "clarify", JSON.stringify(override));
    assert.equal(rejected.story, undefined);
  }
  for (const override of [
    { story_mode_setting: choice("invented") },
    { story_allows_setting_coast: { type: "noul", noul: 2 } },
    { story_mode_style: choice("delegated") },
  ])
    await assert.rejects(
      () => respond(request, { transport: live({ ...selected, ...override }) }),
      /invalid or incomplete choice|incomplete evidence judgment/i,
    );
});
test("delegated revisions change only the requested field and still replay after saving", async () => {
  const first = await respond(input("Write a short story"));
  const result = await respond(
    {
      ...follow(
        first,
        "Change the setting; surprise me and keep everything else.",
      ),
      mode: "live",
    },
    {
      transport: live({
        story_action: choice("revise"),
        story_mode_setting: choice("delegated"),
        ...accept("setting", []),
      }),
    },
  );
  assert.ok(result.story);
  assert.notEqual(result.story.choices.setting, first.story!.choices.setting);
  assert.deepEqual(
    { ...result.story.choices, setting: first.story!.choices.setting },
    first.story!.choices,
  );
  assert.equal(result.story.tone, first.story!.tone);
  assert.equal(result.story.ending, first.story!.ending);
  assert.equal(result.story.theme, first.story!.theme);
  assert.equal(
    await verifySavedResult(
      parseSavedResult(JSON.parse(JSON.stringify(result)))!,
      "",
    ),
    true,
  );
});

test("fiction ranks independently accepted candidates without demanding a unique preferred story", async () => {
  const request = {
    ...input("Write a fictional scene; surprise me."),
    mode: "live" as const,
  };
  const preferences = {
    ...freedom(),
    plan: {
      ...choice("story_0", 0.3),
      probabilities: {
        story_0: 0.34,
        story_1: 0.33,
        story_2: 0.32,
        none: 0.01,
      },
    },
    progression_story_0: score(0.6),
    progression_story_1: score(0.9),
    progression_story_2: score(0.7),
  };
  const result = await respond(request, { transport: live(preferences) });
  assert.equal(result.status, "answered");
  assert.equal(result.trace.selectedPlan, "story_1");
  assert.equal(result.trace.calls, 2);
  const rejectedWinner = await respond(request, {
    transport: live({
      ...preferences,
      supported_story_1: { type: "noul", noul: 0.79 },
    }),
  });
  assert.equal(rejectedWinner.trace.selectedPlan, "story_2");
  await assert.rejects(
    () =>
      respond(request, {
        transport: live({
          ...preferences,
          progression_story_1: { type: "score", score: 0.9 },
        }),
      }),
    /Invalid fiction assessment/i,
  );
});

test("fiction score snapshots replay and reject altered preferences or distributions", async () => {
  const { runLiveBenchmark, parseBenchmarkReport } =
    await import("../lib/jev-chat/benchmark");
  const { mode: _mode, ...request } = input(
    "Write a fictional scene; surprise me.",
  );
  const fixtures = {
    version: "jev-chat-evaluation-v1",
    cases: [
      {
        id: "creative-freedom",
        category: "creative",
        input: request,
        expectations: {
          expectedIntent: "create",
          requiredSubstrings: ["fictional"],
        },
        evidenceNotes:
          "Synthetic score replay; no artistic or live quality measurement.",
      },
    ],
  };
  const report = await runLiveBenchmark(fixtures, {
    execution: "mocked",
    caseIds: ["creative-freedom"],
    maxRequests: 2,
    transport: live({ ...freedom(), progression_story_1: score(0.9) }),
  });
  assert.equal(report.cases[0].result?.trace.selectedPlan, "story_1");
  const recorded = report.cases[0].requests[1].answers!;
  assert.deepEqual(recorded.progression_story_1, score(0.9));
  assert.equal(
    (await parseBenchmarkReport(JSON.parse(JSON.stringify(report)))).cases[0]
      .status,
    "completed",
  );
  const changed = structuredClone(report);
  changed.cases[0].requests[1].answers!.progression_story_1 = score(0.1);
  await assert.rejects(() => parseBenchmarkReport(changed), /replay/i);
  const malformed = structuredClone(report);
  malformed.cases[0].requests[1].answers!.progression_story_1 = {
    ...score(0.9),
    probabilities: { "0": 0.6, "1": 0.4 },
  };
  await assert.rejects(
    () => parseBenchmarkReport(malformed),
    /Invalid fiction assessment/i,
  );
});
