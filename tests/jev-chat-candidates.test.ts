import test from "node:test";
import assert from "node:assert/strict";
import { respond } from "../lib/jev-chat/engine";
import { renderStory, type StoryFrame } from "../lib/jev-chat/story";
import {
  parseSavedResult,
  verifySavedResult,
} from "../lib/jev-chat/persistence";
import { validatePayload, type RunPayload } from "../lib/api";
import type { EngineInput, JevTransport } from "../lib/jev-chat/types";
type Candidate = { id: string; text: string; story: StoryFrame };

const request = (): EngineInput => ({
  messages: [
    {
      role: "user",
      text: "Write a scene with either a keeper on the coast or a mechanic in the library; use the silent bell and listening, a reflective tone and a resolved ending.",
    },
  ],
  topic: "creative",
  notes: "",
  mode: "live",
  style: "balanced",
  seed: 0,
});
const previous = (): StoryFrame => ({
  version: "jev-story-v1",
  choices: {
    character: "keeper",
    setting: "coast",
    obstacle: "silence",
    resolution: "listen",
  },
  theme: "shared work",
  tone: "hopeful",
  ending: "open",
  style: "balanced",
  variant: 2,
});
const revision = (story: StoryFrame): EngineInput => ({
  ...request(),
  messages: [
    {
      role: "assistant",
      story,
      text: renderStory(story)
        .map((section) => section.text)
        .join("\n\n"),
    },
    {
      role: "user",
      text: "Change the character and setting to either a keeper on the coast or a mechanic in the library; keep everything else.",
    },
  ],
});
const compatible = (story: StoryFrame) =>
  (story.choices.character === "keeper" && story.choices.setting === "coast") ||
  (story.choices.character === "mechanic" &&
    story.choices.setting === "library");
const allowed = new Set([
  "character_keeper",
  "character_mechanic",
  "setting_coast",
  "setting_library",
  "obstacle_silence",
  "resolution_listen",
  "tone_reflective",
  "ending_resolved",
  "style_balanced",
]);
const score = {
  type: "score",
  score: 0.5,
  confidence: 0.2,
  probabilities: { "0": 0.5, "1": 0.5 },
};
function transport(
  options: {
    revise?: boolean;
    modes?: Record<string, string>;
    accepted?: Set<string>;
    support?: (story: StoryFrame) => boolean;
    overrides?: Record<string, unknown>;
    calls?: RunPayload[];
  } = {},
): JevTransport {
  return async (payload) => {
    validatePayload(payload);
    options.calls?.push(payload);
    const candidates =
      (payload.state as { candidates?: Candidate[] }).candidates ?? [];
    return {
      answers: Object.fromEntries(
        Object.entries(payload.questions).map(([id, q]) => {
          if (Object.hasOwn(options.overrides ?? {}, id))
            return [id, options.overrides![id]];
          if (q.type === "score") return [id, score];
          if (q.type === "noul") {
            const plan = candidates.find(
              (candidate) => id === `supported_${candidate.id}`,
            );
            const accepted = plan
              ? (options.support ?? compatible)(plan.story!)
              : id.startsWith("story_allows_")
                ? (options.accepted ?? allowed).has(
                    id.slice("story_allows_".length),
                  )
                : id !== "conflict";
            return [id, { type: "noul", noul: accepted ? 0.95 : 0.05 }];
          }
          let selected = Object.keys(q.criteria!)[0];
          if (id === "intent") selected = "create";
          else if (id === "story_action")
            selected = options.revise ? "revise" : "new";
          else if (id.startsWith("story_mode_")) {
            const field = id.slice("story_mode_".length);
            selected =
              options.modes?.[field] ??
              (field === "style" ||
              (options.revise && !["character", "setting"].includes(field))
                ? "preserved"
                : "constrained");
          }
          return [id, { type: "choice", choice: selected, confidence: 0.95 }];
        }),
      ),
    };
  };
}

test("distinct complete candidates can satisfy a correlation the primary assignment misses", async () => {
  const calls: RunPayload[] = [];
  const result = await respond(request(), { transport: transport({ calls }) });
  const candidates = (calls[1].state as { candidates: Candidate[] }).candidates;
  assert.equal(
    compatible(candidates[0].story!),
    false,
    "regression requires a rejected primary assignment",
  );
  assert.equal(
    new Set(candidates.map((plan) => JSON.stringify(plan.story!.choices))).size,
    3,
  );
  assert.equal(result.status, "answered");
  assert.ok(result.story && compatible(result.story));
  assert.notEqual(result.trace.selectedPlan, candidates[0].id);
  assert.equal(result.trace.calls, 2);
  assert.equal(await verifySavedResult(result, ""), true);
});

test("alternate revisions preserve original wording and untouched fields through storage and the next turn", async () => {
  const prior = previous();
  const calls: RunPayload[] = [];
  const result = await respond(revision(prior), {
    transport: transport({ revise: true, calls }),
  });
  assert.ok(result.story && compatible(result.story));
  assert.match(result.trace.selectedPlan, /^story_2_alt_[12]$/);
  const candidates = (calls[1].state as { candidates: Candidate[] }).candidates;
  assert.equal(candidates.length, 3);
  for (const { story } of candidates)
    assert.deepEqual(
      {
        ...story,
        choices: {
          ...story!.choices,
          character: prior.choices.character,
          setting: prior.choices.setting,
        },
      },
      prior,
    );
  const saved = parseSavedResult(JSON.parse(JSON.stringify(result)))!;
  assert.ok(saved);
  assert.equal(await verifySavedResult(saved, ""), true);
  for (const id of [
    "story_0_alt_1",
    "story_2_alt_0",
    "story_2_alt_3",
    "story_2_alt_01",
    ...candidates
      .map((candidate) => candidate.id)
      .filter((id) => id !== saved.trace.selectedPlan),
  ]) {
    assert.equal(
      await verifySavedResult(
        { ...saved, trace: { ...saved.trace, selectedPlan: id } },
        "",
      ),
      false,
      id,
    );
  }
  const selectedCandidate = saved.trace.candidates.find(
    (candidate) => candidate.id === saved.trace.selectedPlan,
  )!;
  for (const candidates of [
    [],
    [...saved.trace.candidates, { ...selectedCandidate }],
    saved.trace.candidates.map((candidate) =>
      candidate.id === selectedCandidate.id
        ? { ...candidate, text: candidate.text + " altered" }
        : candidate,
    ),
  ])
    assert.equal(
      await verifySavedResult(
        { ...saved, trace: { ...saved.trace, candidates } },
        "",
      ),
      false,
    );
  const next = revision(saved.story!);
  next.messages[1].text = "Make it shorter.";
  const nextCalls: RunPayload[] = [];
  const concise = await respond(next, {
    transport: transport({
      revise: true,
      modes: {
        character: "preserved",
        setting: "preserved",
        style: "constrained",
      },
      accepted: new Set(["style_concise"]),
      calls: nextCalls,
    }),
  });
  assert.deepEqual(concise.story, { ...saved.story, style: "concise" });
  assert.deepEqual(Object.keys(nextCalls[1].questions), ["supported_story_2"]);
  assert.equal(await verifySavedResult(concise, ""), true);
});

test("singleton new-scene assignments retain three wording alternatives and legacy plan IDs", async () => {
  const singleton = new Set(
    [...allowed].filter(
      (id) => !["character_mechanic", "setting_library"].includes(id),
    ),
  );
  const calls: RunPayload[] = [];
  const result = await respond(request(), {
    transport: transport({ accepted: singleton, calls }),
  });
  assert.equal(result.status, "answered");
  const candidates = (calls[1].state as { candidates: Candidate[] }).candidates;
  assert.deepEqual(
    candidates.map((plan) => plan.id),
    ["story_0", "story_1", "story_2"],
  );
  assert.equal(
    new Set(candidates.map((plan) => JSON.stringify(plan.story!.choices))).size,
    1,
  );
  assert.equal(new Set(candidates.map((plan) => plan.text)).size, 3);
});

test("candidate diversity cannot override rejection or malformed assessments", async () => {
  const refused = await respond(request(), {
    transport: transport({ support: () => false }),
  });
  assert.equal(refused.status, "clarify");
  assert.equal(refused.trace.calls, 2);
  await assert.rejects(
    () =>
      respond(revision(previous()), {
        transport: transport({
          revise: true,
          overrides: { progression_story_2_alt_1: { type: "score", score: 1 } },
        }),
      }),
    /Invalid fiction assessment/i,
  );
});

test("benchmark replay binds a selected alternate revision to its candidate decisions", async () => {
  const { runLiveBenchmark, parseBenchmarkReport } =
    await import("../lib/jev-chat/benchmark");
  const { mode: _mode, ...input } = revision(previous());
  const fixtures = {
    version: "jev-chat-evaluation-v1",
    cases: [
      {
        id: "correlated-story-revision",
        category: "creative",
        input,
        expectations: {
          expectedIntent: "create",
          requiredSubstrings: ["fictional"],
        },
        evidenceNotes:
          "Mocked known relation between story fields; no live semantic measurement.",
      },
    ],
  };
  const report = await runLiveBenchmark(fixtures, {
    execution: "mocked",
    caseIds: ["correlated-story-revision"],
    maxRequests: 2,
    transport: transport({ revise: true }),
  });
  assert.match(report.cases[0].result!.trace.selectedPlan, /_alt_[12]$/);
  const imported = await parseBenchmarkReport(
    JSON.parse(JSON.stringify(report)),
  );
  assert.equal(imported.cases[0].status, "completed");
  const changed = structuredClone(report);
  const selected = changed.cases[0].result!.trace.selectedPlan;
  changed.cases[0].requests[1].answers![`supported_${selected}`] = {
    type: "noul",
    noul: 0.05,
  };
  await assert.rejects(() => parseBenchmarkReport(changed), /replay/i);
});
