import test from "node:test";
import assert from "node:assert/strict";
import { respond } from "../lib/jev-chat/engine";
import { buildGraph, verifyGraph } from "../lib/jev-chat/graph";
import {
  parseSavedResult,
  verifySavedResult,
} from "../lib/jev-chat/persistence";
import { validatePayload, type RunPayload } from "../lib/api";
import type { SourceExcerpt } from "../lib/jev-chat/source-excerpts";
import type { EngineInput, JevTransport } from "../lib/jev-chat/types";

const answer = "Atlas serves 30 teams.";
const notes = `The Atlas project is a private pilot. ${answer} The budget remains undecided.`;
const input = (overrides: Partial<EngineInput> = {}): EngineInput => ({
  topic: "notes",
  mode: "live",
  style: "concise",
  notes,
  messages: [{ role: "user", text: "How many teams does Atlas serve?" }],
  ...overrides,
});
function mock(
  options: {
    calls?: RunPayload[];
    parent?: number;
    excerptSupport?: number;
    invalidExcerpt?: boolean;
    all?: boolean;
  } = {},
): JevTransport {
  return async (payload) => {
    validatePayload(payload);
    options.calls?.push(payload);
    const proposals =
      (payload.state as { source_excerpts?: SourceExcerpt[] })
        .source_excerpts ?? [];
    return {
      answers: Object.fromEntries(
        Object.entries(payload.questions).map(([id, q]) => {
          if (q.type === "noul") {
            const excerpt = proposals.find((e) => `excerpt_${e.id}` === id);
            if (excerpt && options.invalidExcerpt)
              return [id, { type: "noul", noul: "0.95" }];
            return [
              id,
              {
                type: "noul",
                noul:
                  id === "conflict"
                    ? 0.05
                    : id === "evidence_note_1"
                      ? (options.parent ?? 0.95)
                      : id.startsWith("evidence_")
                        ? 0.05
                        : excerpt
                          ? options.all || excerpt.text === answer
                            ? 0.95
                            : 0.05
                          : id === "supported_answer_excerpts"
                            ? (options.excerptSupport ?? 0.95)
                            : 0.95,
              },
            ];
          }
          return [
            id,
            {
              type: "choice",
              choice:
                id === "intent"
                  ? "answer"
                  : id === "plan"
                    ? Object.hasOwn(q.criteria!, "answer_excerpts")
                      ? "answer_excerpts"
                      : Object.keys(q.criteria!)[0]
                    : "none",
              confidence: 0.95,
            },
          ];
        }),
      ),
    };
  };
}

test("focused factual candidates quote an exact sentence and retain its complete parent citation", async () => {
  const calls: RunPayload[] = [];
  const result = await respond(input(), { transport: mock({ calls }) });
  assert.equal(result.trace.selectedPlan, "answer_excerpts");
  assert.ok(result.text.includes(answer));
  assert.ok(!result.text.includes("budget remains"));
  assert.equal(result.sources[0].text, notes);
  const quote = result.sections.find(
    (section) => section.provenance === "source",
  )!;
  assert.deepEqual(quote.excerpt, {
    start: notes.indexOf(answer),
    end: notes.indexOf(answer) + answer.length,
  });
  assert.equal(
    quote.text,
    notes.slice(quote.excerpt!.start, quote.excerpt!.end),
  );
  assert.equal(result.trace.calls, 2);
  assert.equal(
    (calls[1].state as { source_excerpts?: unknown }).source_excerpts,
    undefined,
  );
  assert.equal(
    await verifySavedResult(
      parseSavedResult(JSON.parse(JSON.stringify(result)))!,
      notes,
    ),
    true,
  );
});

test("a relevant excerpt needs parent relevance and a complete-response acceptance check", async () => {
  const unrelated = await respond(input(), {
    transport: mock({ parent: 0.79 }),
  });
  assert.equal(unrelated.status, "clarify");
  const omittedCondition = await respond(input(), {
    transport: mock({ excerptSupport: 0.79 }),
  });
  assert.equal(omittedCondition.status, "clarify");
  assert.equal(omittedCondition.trace.calls, 2);
  await assert.rejects(
    () => respond(input(), { transport: mock({ invalidExcerpt: true }) }),
    /incomplete evidence judgment/i,
  );
});

test("source offsets are hashed and rechecked after an attacker recomputes graph hashes", async () => {
  const result = await respond(input(), { transport: mock() });
  const original = result.sections.find((section) => section.excerpt)!;
  assert.ok(original);
  const shifted = structuredClone(result);
  const quote = shifted.sections.find((section) => section.excerpt)!;
  quote.excerpt!.start++;
  quote.excerpt!.end++;
  shifted.graph = await buildGraph(shifted.sections);
  assert.notEqual(shifted.graph.root, result.graph.root);
  assert.equal((await verifyGraph(shifted.graph)).valid, true);
  assert.equal(await verifySavedResult(shifted, notes), false);
  const stripped = structuredClone(result);
  for (const section of stripped.sections) delete section.excerpt;
  stripped.graph = await buildGraph(stripped.sections);
  assert.equal(await verifySavedResult(stripped, notes), false);
  for (const excerpt of [
    { start: -1, end: 2 },
    { start: 1, end: 1 },
    { start: 0.5, end: 2.5 },
    { start: 0, end: 2, extra: true },
  ]) {
    await assert.rejects(
      () =>
        buildGraph([
          { text: "xx", provenance: "source", source: "test", excerpt },
        ]),
      /excerpt|unknown field/i,
    );
  }
  await assert.rejects(
    () =>
      buildGraph([
        { text: "xx", provenance: "authored", excerpt: { start: 0, end: 2 } },
      ]),
    /Only source text/i,
  );
});

test("optional excerpt questions yield to the request budget without losing source or conversation", async () => {
  const source = Array.from(
    { length: 32 },
    (_, i) =>
      `Field ${String.fromCharCode(65 + (i % 26))} ${'"'.repeat(330)} applies.`,
  ).join(" ");
  const request = input({
    notes: source,
    messages: [
      { role: "assistant", text: "x".repeat(23900) },
      { role: "assistant", text: "y".repeat(23900) },
      { role: "user", text: "Quote one field from these notes." },
    ],
  });
  const calls: RunPayload[] = [];
  await respond(request, { transport: mock({ calls, all: true }) });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((payload) => JSON.stringify(payload).length <= 100000));
  assert.ok(
    Object.keys(calls[0].questions).filter((id) => id.startsWith("excerpt_"))
      .length < 32,
  );
  assert.equal(
    (calls[0].state as { excerpt_candidates_omitted: boolean })
      .excerpt_candidates_omitted,
    true,
  );
  for (const payload of calls) {
    const state = payload.state as {
      conversation: unknown;
      evidence: { id: string; text: string }[];
    };
    assert.deepEqual(state.conversation, request.messages);
    assert.equal(
      state.evidence.find((source) => source.id === "note_1")!.text,
      source,
    );
  }
});

test("excerpt decisions and source bindings survive benchmark snapshot replay", async () => {
  const { runLiveBenchmark, parseBenchmarkReport } =
    await import("../lib/jev-chat/benchmark");
  const { mode: _mode, ...request } = input();
  const fixture = {
    version: "jev-chat-evaluation-v1",
    cases: [
      {
        id: "focused-source-answer",
        category: "source",
        input: request,
        expectations: {
          expectedIntent: "answer",
          requiredSubstrings: [answer],
        },
        evidenceNotes:
          "Synthetic exact-excerpt fixture, not a live entailment measurement.",
      },
    ],
  };
  const report = await runLiveBenchmark(fixture, {
    execution: "mocked",
    caseIds: ["focused-source-answer"],
    maxRequests: 2,
    transport: mock(),
  });
  assert.equal(report.cases[0].result!.trace.selectedPlan, "answer_excerpts");
  const restored = await parseBenchmarkReport(
    JSON.parse(JSON.stringify(report)),
  );
  assert.equal(restored.cases[0].status, "completed");
  const altered = structuredClone(report);
  const key = Object.keys(altered.cases[0].requests[0].answers!).find(
    (id) =>
      id.startsWith("excerpt_") &&
      (altered.cases[0].requests[0].answers![id] as { noul: number }).noul ===
        0.95,
  )!;
  altered.cases[0].requests[0].answers![key] = { type: "noul", noul: 0.05 };
  await assert.rejects(() => parseBenchmarkReport(altered), /replay/i);
});
