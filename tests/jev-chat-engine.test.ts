import test from "node:test";
import assert from "node:assert/strict";
import { respond, analysisPayload } from "../lib/jev-chat/engine";
import { buildContext } from "../lib/jev-chat/knowledge";
import type { EngineInput, JevTransport } from "../lib/jev-chat/types";
import { validatePayload } from "../lib/api";

const input = (text: string, rest: Partial<EngineInput> = {}): EngineInput => ({
  messages: [{ role: "user", text }],
  topic: "guide",
  notes: "",
  mode: "demo",
  style: "balanced",
  ...rest,
});
const selected = (choice: string) => ({
  type: "choice",
  choice,
  confidence: 0.95,
});
const live: JevTransport = async (payload) => ({
  answers: Object.fromEntries(
    Object.entries(payload.questions).map(([id, q]) => [
      id,
      id === "intent"
        ? selected("capabilities")
        : id === "style"
          ? selected("balanced")
          : id === "plan"
            ? selected(Object.keys(q.criteria!)[0])
            : q.type === "noul"
              ? { type: "noul", noul: id === "conflict" ? 0.05 : 0.95 }
              : q.type === "score"
                ? {
                    type: "score",
                    score: 0.5,
                    confidence: 0.3,
                    probabilities: { "0": 0.5, "1": 0.5 },
                  }
                : selected(Object.keys(q.criteria!)[0]),
    ]),
  ),
});

test("capabilities are available across topics and retain authored provenance", async () => {
  for (const topic of ["guide", "notes", "support", "creative"] as const) {
    const result = await respond(input("what can you do?", { topic }));
    assert.equal(result.intent, "capabilities");
    assert.equal(result.status, "answered");
    assert.match(result.text, /notes/);
    assert.match(result.text, /fiction|stories/);
    assert.equal(result.trace.calls, 0);
    assert.equal(result.signal.confidence, null);
    assert.ok(result.graph.root);
  }
});
test("every shipped starter and composed-story follow-up reaches a supported demo operation", async () => {
  const { spaces, sampleNotes } = await import("../lib/jevChat");
  for (const [topic, space] of Object.entries(spaces)) {
    for (const prompt of space.prompts) {
      const result = await respond(
        input(prompt, {
          topic: topic as EngineInput["topic"],
          notes: topic === "notes" ? sampleNotes : "",
        }),
      );
      assert.equal(result.status, "answered", `${topic}: ${prompt}`);
    }
  }
  for (const prompt of [
    "What are your capabilities?",
    "Tell me your capabilities.",
    "Explain how this story was composed",
  ]) {
    assert.equal((await respond(input(prompt))).status, "answered", prompt);
  }
});
test("overall deadline interrupts even a hanging transport and propagates cancellation", async () => {
  let clock = 0;
  let transportSignal: AbortSignal | undefined;
  const response = respond(input("hello", { mode: "live" }), {
    now: () => clock,
    onProgress: (event) => {
      if (event.stage === "interpret") clock = 59995;
    },
    transport: (_payload, signal) => {
      transportSignal = signal;
      return new Promise(() => {});
    },
  });
  let guard: ReturnType<typeof setTimeout>;
  const timeout = new Promise((_, reject) => {
    guard = setTimeout(
      () => reject(Error("test watchdog: engine did not settle")),
      500,
    );
  });
  try {
    await assert.rejects(
      () => Promise.race([response, timeout]),
      /deadline exceeded/i,
    );
    assert.equal(transportSignal?.aborted, true);
  } finally {
    clearTimeout(guard!);
  }
});
test("live question batch uses semantic intent and never returns provider prose", async () => {
  const result = await respond(input("what can you do?", { mode: "live" }), {
    transport: live,
  });
  assert.equal(result.provenance, "live");
  assert.equal(result.intent, "capabilities");
  assert.ok(result.trace.calls <= 2);
  const payload = analysisPayload(buildContext(input("hello")));
  assert.equal(payload.questions.intent.type, "choice");
  assert.match(payload.questions.intent.instructions, /capabilit/);
  assert.match(payload.questions.intent.instructions, /untrusted/);
});
test("live note requests with zero or one numerical candidate satisfy the actual API contract", async () => {
  for (const notes of [
    "The archive opens on Tuesday.",
    "Alpha costs 12 credits.",
    "Alpha costs about 12 credits.",
  ]) {
    const request = input("What can you do?", {
      topic: "notes",
      notes,
      mode: "live",
    });
    assert.doesNotThrow(
      () => validatePayload(analysisPayload(buildContext(request))),
      notes,
    );
    const result = await respond(request, {
      transport: async (payload) => {
        validatePayload(payload);
        return live(payload);
      },
    });
    assert.equal(result.status, "answered");
  }
});
test("notes can form a cited multi-passage extract without inventing facts", async () => {
  const notes =
    "Alpha costs 12 credits and supports offline work.\n\nBeta costs 18 credits and supports shared editing.";
  const result = await respond(
    input("Compare Alpha and Beta.", { topic: "notes", notes }),
  );
  assert.equal(result.intent, "compare");
  assert.ok(result.sources.length === 2);
  assert.match(result.text, /12 credits/);
  assert.match(result.text, /18 credits/);
  for (const source of result.sources) assert.ok(notes.includes(source.text));
});
test("demo source answers require the requested attribute, not just the subject", async () => {
  const question = "What is the vessel's capacity in liters?";
  const missing = await respond(
    input(question, {
      topic: "notes",
      notes: "The synthetic glass vessel is blue.",
    }),
  );
  assert.equal(missing.status, "clarify");
  const supported = await respond(
    input(question, {
      topic: "notes",
      notes: "The vessel has a capacity of 4 liters.",
    }),
  );
  assert.equal(supported.status, "answered");
  assert.match(supported.text, /4 liters/);
  const unrelated = await respond(
    input("What is the vessel's mass?", {
      topic: "notes",
      notes: "The vessel has a capacity of 4 liters.",
    }),
  );
  assert.equal(unrelated.status, "clarify");
});
test("demo detects conflicting literal values without conflating entities or conditions", async () => {
  const fact = "The archive access window closes at 16:00.";
  const result = await respond(
    input("When does the archive access window close?", {
      topic: "notes",
      notes: `${fact}\n\nThe archive access window closes at 18:00.`,
    }),
  );
  assert.equal(result.status, "clarify");
  assert.match(result.text, /conflict/);
  assert.equal(result.sources.length, 2);
  for (const notes of [
    `${fact}\n\n${fact}`,
    `${fact}\n\nThe museum access window closes at 18:00.`,
    "The archive closes at 16:00 on Monday.\n\nThe archive closes at 18:00 on Friday.",
  ]) {
    const distinct = await respond(
      input("Summarize these notes.", { topic: "notes", notes }),
    );
    assert.equal(distinct.status, "answered");
  }
});
test("a free-form authored factual plan still needs a complete response assessment", async () => {
  let calls = 0;
  const result = await respond(
    input("Explain the model's typed-question workflow", { mode: "live" }),
    {
      transport: async (p) => {
        calls++;
        const raw = (await live(p)) as { answers: Record<string, unknown> };
        if (p.questions.intent) {
          raw.answers.intent = selected("explain");
          for (const id of Object.keys(raw.answers)) {
            if (id.startsWith("evidence_"))
              raw.answers[id] = {
                type: "noul",
                noul: id === "evidence_mechanism" ? 0.95 : 0.05,
              };
          }
        } else raw.answers.plan = selected("none");
        return raw;
      },
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.status, "clarify");
  assert.equal(result.trace.semanticVerification, "model-assessed");
});
test("malformed offered options fail before hashing or any provider request", async () => {
  for (const options of [
    "not an array",
    [3],
    Array(11).fill("option"),
    ["x".repeat(2001)],
  ]) {
    await assert.rejects(
      () =>
        respond(
          input("the second one", {
            messages: [
              {
                role: "assistant",
                text: "Choose an option",
                options: options as string[],
              },
              { role: "user", text: "the second one" },
            ],
          }),
        ),
      /option/i,
    );
  }
});
test("elliptical follow-ups resolve the offered option rather than guessing", async () => {
  const result = await respond(
    input("the second one", {
      messages: [
        { role: "user", text: "what can you do?" },
        {
          role: "assistant",
          text: "Which would you like to try?",
          options: ["Explain Jev", "Write a short story"],
        },
        { role: "user", text: "the second one" },
      ],
    }),
  );
  assert.equal(result.intent, "create");
  const ambiguous = await respond(input("the second one"));
  assert.equal(ambiguous.status, "clarify");
  assert.match(ambiguous.text, /second|option|reference/);
});
test("creative compositions are seeded, novel combinations and explicitly fictional", async () => {
  const a = await respond(
    input("Write a story about a lighthouse.", { topic: "creative", seed: 42 }),
  );
  const b = await respond(
    input("Write a story about a lighthouse.", { topic: "creative", seed: 42 }),
  );
  const c = await respond(
    input("Write a story about a lighthouse.", { topic: "creative", seed: 43 }),
  );
  assert.equal(a.intent, "create");
  assert.equal(a.text, b.text);
  assert.notEqual(a.text, c.text);
  assert.ok(a.sections.some((s) => s.provenance === "hypothetical"));
  assert.match(a.text, /lighthouse/);
});
test("low intent confidence clarifies, malformed provider decisions fail, no demo fallback", async () => {
  const uncertain = await respond(input("hello", { mode: "live" }), {
    transport: async (p) => {
      const r = await live(p);
      (r as any).answers.intent.confidence = 0.3;
      return r;
    },
  });
  assert.equal(uncertain.status, "clarify");
  await assert.rejects(
    () =>
      respond(input("hello", { mode: "live" }), {
        transport: async () => ({
          answers: { intent: selected("execute_anything") },
        }),
      }),
    /invalid|incomplete/i,
  );
  await assert.rejects(
    () =>
      respond(input("hello", { mode: "live" }), {
        transport: async () => {
          throw Error("provider unavailable");
        },
      }),
    /provider unavailable/,
  );
});
test("cancellation and limits prevent work and preserve unknowns", async () => {
  const ac = new AbortController();
  ac.abort();
  let calls = 0;
  await assert.rejects(
    () =>
      respond(input("hello", { mode: "live" }), {
        signal: ac.signal,
        transport: async (p) => {
          calls++;
          return live(p);
        },
      }),
    /abort/i,
  );
  assert.equal(calls, 0);
  await assert.rejects(() => respond(input("x".repeat(2001))), /2,000/);
  await assert.rejects(
    () => respond(input("hello", { notes: "x".repeat(12001) })),
    /12,000/,
  );
  const unknown = await respond(
    input("What was the exact rainfall on Mars yesterday?"),
  );
  assert.equal(unknown.status, "unsupported");
});

test("composed history survives verified restoration and discards tampered responses", async () => {
  const { newChat, restoreChatsVerified } = await import("../lib/jevChat");
  const result = await respond(input("what can you do?"));
  const chat = newChat();
  chat.messages = [
    { id: "u", role: "user", text: "what can you do?" },
    { id: "a", role: "assistant", text: result.text, engineResult: result },
  ];
  const restored = await restoreChatsVerified(JSON.stringify([chat]));
  assert.equal(restored[0].messages[1].text, result.text);
  assert.equal(restored[0].engine, "compose");
  const leaf = Object.values(result.graph.nodes).find(
    (n) => n.kind === "text",
  )!;
  leaf.text = "Tampered";
  const damaged = await restoreChatsVerified(JSON.stringify([chat]));
  assert.equal(damaged[0].messages.length, 1);
  assert.equal(damaged[0].messages[0].role, "user");
});
