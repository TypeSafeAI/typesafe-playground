import test from "node:test";
import assert from "node:assert/strict";
import { respond } from "../lib/jev-chat/engine";
import { validatePayload, type RunPayload } from "../lib/api";
import {
  verifySavedResult,
  parseSavedResult,
} from "../lib/jev-chat/persistence";
import type { EngineInput, JevTransport } from "../lib/jev-chat/types";
import {
  parseBenchmarkReport,
  runLiveBenchmark,
} from "../lib/jev-chat/benchmark";

const notes = Array.from(
  { length: 7 },
  (_, i) => `Passage ${i + 1} describes a synthetic warranty condition.`,
).join("\n\n");
const input = (rest: Partial<EngineInput> = {}): EngineInput => ({
  topic: "notes",
  mode: "live",
  style: "concise",
  notes,
  messages: [{ role: "user", text: "Describe the warranty conditions." }],
  ...rest,
});
const choice = (id: string) => ({
  type: "choice",
  choice: id,
  confidence: 0.95,
});
function mock(all = false, requests: RunPayload[] = []): JevTransport {
  return async (payload) => {
    validatePayload(payload);
    requests.push(payload);
    return {
      answers: Object.fromEntries(
        Object.entries(payload.questions).map(([id, q]) => [
          id,
          q.type === "noul"
            ? {
                type: "noul",
                noul:
                  id === "conflict"
                    ? 0
                    : id.startsWith("evidence_")
                      ? id === "evidence_note_7"
                        ? 0.99
                        : id.startsWith("evidence_note_")
                          ? 0.81
                          : 0.1
                      : 0.95,
              }
            : choice(
                id === "intent"
                  ? "answer"
                  : id === "plan"
                    ? all && Object.hasOwn(q.criteria!, "answer_all")
                      ? "answer_all"
                      : Object.keys(q.criteria!)[0]
                    : "none",
              ),
        ]),
      ),
    };
  };
}

test("strongest relevant source reaches the concise answer regardless of source position", async () => {
  const result = await respond(input(), { transport: mock() });
  assert.equal(result.sources[0].id, "note_7");
  assert.equal(result.sources[1].id, "note_1");
  assert.match(result.text, /Showing 2 of 7 selected passages/);
  assert.equal(await verifySavedResult(result, notes), true);
});

test("a complete source extract can answer a request beyond the five-passage style cap", async () => {
  const result = await respond(input(), { transport: mock(true) });
  assert.equal(result.trace.selectedPlan, "answer_all");
  assert.deepEqual(
    result.sources.map((s) => s.id),
    Array.from({ length: 7 }, (_, i) => `note_${i + 1}`),
  );
  assert.equal(result.text, notes);
  assert.equal(result.trace.calls, 2);
  assert.equal(
    await verifySavedResult(
      parseSavedResult(JSON.parse(JSON.stringify(result)))!,
      notes,
    ),
    true,
  );
});

test("complete extracts fit existing forty-paragraph and graph restoration bounds", async () => {
  const source = Array.from(
    { length: 40 },
    (_, i) => `Warranty condition ${i + 1} is recorded here.`,
  ).join("\n\n");
  const result = await respond(input({ notes: source }), {
    transport: mock(true),
  });
  assert.equal(result.sources.length, 40);
  assert.equal(result.sections.length, 40);
  assert.equal(result.text, source);
  assert.equal(
    await verifySavedResult(
      parseSavedResult(JSON.parse(JSON.stringify(result)))!,
      source,
    ),
    true,
  );
});

test("candidate budget drops alternatives without truncating source or conversation", async () => {
  const requests: RunPayload[] = [];
  const source = [
    "Alpha warranty applies. " +
      "Additional synthetic warranty detail. ".repeat(290),
    ...Array.from(
      { length: 6 },
      (_, i) => `Warranty condition ${i + 1} is recorded here.`,
    ),
  ].join("\n\n");
  const request = input({
    notes: source,
    messages: [
      { role: "assistant", text: "x".repeat(23900) },
      { role: "assistant", text: "y".repeat(23900) },
      { role: "user", text: "Describe all warranty conditions." },
    ],
  });
  const result = await respond(request, { transport: mock(true, requests) });
  assert.equal(requests.length, 2);
  assert.ok(requests.every((p) => JSON.stringify(p).length <= 100000));
  assert.ok(result.trace.candidates.length < 4);
  assert.equal(result.sources.length, 7);
  assert.equal(
    result.text,
    source
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .join("\n\n"),
  );
  assert.deepEqual(
    (requests[1].state as Record<string, unknown>).conversation,
    request.messages,
  );
  const { mode: _mode, ...fixtureInput } = request;
  const report = await runLiveBenchmark(
    {
      version: "jev-chat-evaluation-v1",
      cases: [
        {
          id: "bounded-evidence",
          category: "evidence",
          input: fixtureInput,
          expectations: { requiredSources: ["note_7"] },
          evidenceNotes:
            "Synthetic budget case; preserve all selected source text and conversation. No semantic quality claim.",
        },
      ],
    },
    {
      caseIds: ["bounded-evidence"],
      maxRequests: 2,
      execution: "mocked",
      transport: mock(true),
    },
  );
  const replayed = await parseBenchmarkReport(report);
  assert.equal(replayed.cases[0].result?.text, result.text);
});

test("a complete extract still requires a passing whole-response judgment", async () => {
  const transport = mock(true);
  const result = await respond(input(), {
    transport: async (payload) => {
      const raw = (await transport(payload)) as {
        answers: Record<string, unknown>;
      };
      if (payload.questions.plan)
        for (const id of Object.keys(payload.questions))
          if (id.startsWith("supported_"))
            raw.answers[id] = { type: "noul", noul: 0.1 };
      return raw;
    },
  });
  assert.equal(result.status, "clarify");
  assert.equal(result.trace.calls, 2);
});
test("JSON escaping can leave only the full extract without losing evidence", async () => {
  const source = [
    "Alpha warranty applies. " + "\\".repeat(9990),
    ...Array.from(
      { length: 6 },
      (_, i) => `Warranty condition ${i + 1} applies.`,
    ),
  ].join("\n\n");
  const requests: RunPayload[] = [];
  const result = await respond(
    input({
      notes: source,
      messages: [
        { role: "assistant", text: "x".repeat(23900) },
        { role: "assistant", text: "y".repeat(23900) },
        { role: "user", text: "Describe all warranty conditions." },
      ],
    }),
    { transport: mock(true, requests) },
  );
  assert.equal(result.trace.candidates.length, 1);
  assert.equal(result.trace.selectedPlan, "answer_all");
  assert.equal(result.text, source);
  assert.equal(result.trace.calls, 2);
  assert.ok(requests.every((p) => JSON.stringify(p).length <= 100000));
  assert.equal(await verifySavedResult(result, source), true);
});
