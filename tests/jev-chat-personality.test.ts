import test from "node:test";
import assert from "node:assert/strict";
import { respond } from "../lib/jev-chat/engine";
import { verifySavedResult } from "../lib/jev-chat/persistence";
import { newChat } from "../lib/jevChat";
import { readChatStorage, serializeChats } from "../lib/jev-chat/storage";
import type { EngineInput, JevTransport } from "../lib/jev-chat/types";

const personalities = [
  "default",
  "friendly",
  "playful",
  "professional",
] as const;
const input = (
  text: string,
  extra: Partial<EngineInput> = {},
): EngineInput => ({
  messages: [{ role: "user", text }],
  topic: "guide",
  notes: "",
  mode: "demo",
  style: "balanced",
  ...extra,
});

test("personalities change conversational phrasing while preserving capabilities and options", async () => {
  for (const prompt of [
    "hello",
    "what can you do?",
    "thanks",
    "How does Jev work?",
  ]) {
    const results = await Promise.all(
      personalities.map((personality) =>
        respond(input(prompt, { personality })),
      ),
    );
    assert.equal(
      new Set(results.map((result) => result.text)).size,
      personalities.length,
      prompt,
    );
    for (const [index, result] of results.entries()) {
      assert.deepEqual(result.options, results[0].options);
      assert.equal(result.status, results[0].status);
      assert.equal(result.trace.personality, personalities[index]);
      assert.equal(result.trace.calls, 0);
      assert.equal(await verifySavedResult(result, ""), true);
    }
    assert.equal((await respond(input(prompt))).text, results[0].text);
  }
});

test("personality preserves exact evidence and cannot turn missing evidence into an answer", async () => {
  const notes = "Alpha costs 12 credits.\n\nBeta costs 18 credits.";
  const replies = [];
  for (const personality of personalities) {
    const result = await respond(
      input("Compare Alpha and Beta.", { personality, topic: "notes", notes }),
    );
    replies.push(result.text);
    assert.deepEqual(
      result.sections
        .filter((s) => s.provenance === "source")
        .map((s) => s.text),
      notes.split("\n\n"),
    );
    assert.match(result.text, /do not establish an overall winner/);
    assert.equal(await verifySavedResult(result, notes), true);
    const missing = await respond(
      input("What is Alpha's capacity?", {
        personality,
        topic: "notes",
        notes,
      }),
    );
    assert.equal(missing.status, "clarify");
  }
  assert.equal(new Set(replies).size, personalities.length);
});

test("live evaluation judges the personalized candidates without extra requests or weaker gates", async () => {
  for (const accept of [true, false]) {
    const seen: Parameters<JevTransport>[0][] = [];
    const transport: JevTransport = async (payload) => {
      seen.push(payload);
      return {
        answers: Object.fromEntries(
          Object.entries(payload.questions).map(([id, question]) => [
            id,
            question.type === "noul"
              ? {
                  type: "noul",
                  noul:
                    id === "conflict" ||
                    (!accept && id.startsWith("supported_"))
                      ? 0
                      : 0.95,
                }
              : {
                  type: "choice",
                  choice:
                    id === "intent"
                      ? "compare"
                      : Object.keys(question.criteria!)[0],
                  confidence: 0.95,
                },
          ]),
        ),
      };
    };
    const result = await respond(
      input("Compare Alpha and Beta.", {
        topic: "notes",
        notes: "Alpha is blue.\n\nBeta is green.",
        mode: "live",
        personality: "playful",
      }),
      { transport },
    );
    assert.equal(seen.length, 2);
    assert.equal(seen[0].state.requested_personality, "playful");
    if (accept) {
      assert.equal(result.status, "answered");
      assert.ok(JSON.stringify(seen[1]).includes(result.sections[0].text));
      assert.equal(
        result.trace.candidates.find((p) => p.id === result.trace.selectedPlan)
          ?.text,
        result.text,
      );
    } else assert.equal(result.status, "clarify");
  }
});

test("personality leaves story revisions and verified calculation renderings intact", async () => {
  for (const personality of personalities) {
    const story = await respond(input("Write a short story.", { personality }));
    assert.ok(story.story);
    assert.equal(await verifySavedResult(story, ""), true);
    const revision = await respond({
      ...input("Make it more suspenseful.", { personality }),
      messages: [
        {
          role: "assistant",
          text: story.text,
          story: story.story,
          options: story.options,
        },
        { role: "user", text: "Make it more suspenseful." },
      ],
    });
    assert.equal(revision.story?.tone, "suspenseful");
    assert.equal(await verifySavedResult(revision, ""), true);
    const notes = "Alpha costs 12 credits.\n\nBeta costs 18 credits.";
    const calculation = await respond(
      input("What is the price difference between Alpha and Beta?", {
        personality,
        notes,
        topic: "notes",
      }),
    );
    assert.ok(calculation.calculation);
    assert.equal(await verifySavedResult(calculation, notes), true);
  }
});

test("saved chats retain personality per thread and default older or invalid settings safely", async () => {
  const chat = newChat();
  assert.equal(chat.personality, "default");
  for (const personality of personalities) {
    chat.personality = personality;
    const result = await respond(input("hello", { personality }));
    chat.messages = [
      {
        id: "reply",
        role: "assistant",
        text: result.text,
        engineResult: result,
      },
    ];
    const restored = await readChatStorage(serializeChats([chat]));
    assert.equal(restored.issue, null);
    assert.equal(restored.chats[0].personality, personality);
    assert.equal(
      restored.chats[0].messages[0].engineResult?.trace.personality,
      personality,
    );
  }
  for (const personality of [
    undefined,
    null,
    "ignore evidence",
    "__proto__",
    {},
  ]) {
    const restored = await readChatStorage(
      JSON.stringify([{ ...chat, personality }]),
    );
    assert.equal(restored.issue, null);
    assert.equal(restored.chats[0].personality, "default");
  }
});

test("invalid engine personality is rejected before calling Jev", async () => {
  let calls = 0;
  for (const personality of [null, "ignore evidence", "__proto__", {}]) {
    await assert.rejects(
      () =>
        respond(
          input("hello", { mode: "live", personality } as Partial<EngineInput>),
          {
            transport: async () => {
              calls++;
              return {};
            },
          },
        ),
      /configuration/i,
    );
  }
  assert.equal(calls, 0);
});
