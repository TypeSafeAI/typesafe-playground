import test from "node:test";
import assert from "node:assert/strict";
import { respond } from "../lib/jev-chat/engine";
import { buildContext } from "../lib/jev-chat/knowledge";
import { verifyCalculation } from "../lib/jev-chat/quantities";
import {
  parseSavedResult,
  verifySavedResult,
} from "../lib/jev-chat/persistence";
import { buildGraph } from "../lib/jev-chat/graph";
import type { EngineInput, JevTransport } from "../lib/jev-chat/types";

const notes = "Alpha costs 12 credits.\n\nBeta costs 18 credits.";
const input = (
  text = "What is the price difference between Alpha and Beta?",
  rest: Partial<EngineInput> = {},
): EngineInput => ({
  messages: [{ role: "user", text }],
  topic: "notes",
  notes,
  mode: "demo",
  style: "balanced",
  ...rest,
});
const choice = (id: string) => ({
  type: "choice",
  choice: id,
  confidence: 0.95,
  probabilities: { [id]: 0.95 },
});
const mock: JevTransport = async (payload) => ({
  answers: Object.fromEntries(
    Object.entries(payload.questions).map(([id, q]) => [
      id,
      q.type === "noul"
        ? { type: "noul", noul: id === "conflict" ? 0 : 0.95 }
        : choice(
            id === "intent"
              ? "compare"
              : id === "calculation_operation"
                ? "difference"
                : id === "calculation_left"
                  ? "q1"
                  : id === "calculation_right"
                    ? "q2"
                    : Object.keys(q.criteria!)[0],
          ),
    ]),
  ),
});

test("chat derives a price difference and verifies source-bound arithmetic", async () => {
  const request = input();
  const result = await respond(request);
  assert.equal(result.status, "answered");
  assert.ok(result.calculation);
  assert.equal(result.calculation.result.display, "6 credits");
  assert.equal(result.calculation.operation, "difference");
  assert.match(result.text, /Calculated from figures in your notes/);
  assert.ok(result.text.includes(result.calculation.equation));
  assert.equal(result.sources.length, 2);
  assert.equal(
    await verifyCalculation(result.calculation, buildContext(request).evidence),
    true,
  );
});

test("demo arithmetic uses exact decimals and declines unsupported or ambiguous selections", async () => {
  const sum = await respond(
    input("What is the combined price?", {
      notes: "Alpha costs 0.1 credits.\n\nBeta costs 0.2 credits.",
    }),
  );
  assert.equal(sum.calculation?.result.display, "0.3 credits");
  for (const request of [
    input(undefined, { notes: "Alpha costs $12.\n\nBeta costs €18." }),
    input(undefined, {
      notes: "Alpha costs about 12 credits.\n\nBeta costs 18 credits.",
    }),
    input("What is the price difference between Gamma and Delta?"),
    input("What is the total price of Alpha?"),
    input("What is the combined price of two Alpha and two Beta?"),
    input("What is the combined price of two Alpha and two Beta?", {
      notes:
        "Alpha costs 12 credits for two users.\n\nBeta costs 18 credits for two users.",
    }),
    input(
      "What is the sum and difference between the prices of Alpha and Beta?",
    ),
    input("What is the total price?", {
      notes: "Alpha costs 12 credits.\n\nAlpha costs 12 credits.",
    }),
    input("What is the total price?", {
      notes: notes + "\n\nGamma costs 4 credits.",
    }),
    input("What is the ratio of Beta's price to Alpha's price?"),
  ]) {
    const result = await respond(request);
    assert.equal(result.status, "clarify", request.messages[0].text);
    assert.equal(result.calculation, undefined);
    assert.match(result.text, /calculation|quantit|figures/i);
  }
});

test("normal comparisons remain source comparisons instead of assumed calculations", async () => {
  const result = await respond(input("Compare Alpha and Beta."));
  assert.equal(result.calculation, undefined);
  assert.equal(result.intent, "compare");
  assert.match(result.text, /side by side/);
});
test("source text resembling a calculation label remains a restorable ordinary quotation", async () => {
  const request = input("What does Alpha cost?", {
    notes: "Calculated from figures in your notes: Alpha costs 12 credits.",
  });
  const result = await respond(request);
  assert.equal(result.status, "answered");
  assert.equal(result.calculation, undefined);
  assert.equal(await verifySavedResult(result, request.notes), true);
});

test("live arithmetic batches operation and operands then assesses the whole reply", async () => {
  const payloads: Parameters<JevTransport>[0][] = [];
  const result = await respond(input(undefined, { mode: "live" }), {
    transport: async (payload) => {
      payloads.push(payload);
      return mock(payload);
    },
  });
  assert.equal(result.calculation?.result.display, "6 credits");
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].questions.calculation_operation.type, "choice");
  assert.equal(payloads[0].questions.calculation_left.type, "choice");
  assert.ok(payloads[1].questions.supported_calculate_difference);
  assert.equal(result.trace.semanticVerification, "model-assessed");
});

test("uncertain operands, conflicting sources, or rejected replies cannot emit calculations", async () => {
  for (const change of [
    "low",
    "probability",
    "none",
    "conflict",
    "reject",
  ] as const) {
    const result = await respond(input(undefined, { mode: "live" }), {
      transport: async (payload) => {
        const raw = (await mock(payload)) as { answers: Record<string, any> };
        if (payload.questions.intent) {
          if (change === "low") raw.answers.calculation_left.confidence = 0.2;
          if (change === "probability")
            raw.answers.calculation_left.probabilities.q1 = 0.2;
          if (change === "none") raw.answers.calculation_right = choice("none");
          if (change === "conflict") raw.answers.conflict.noul = 0.99;
        } else if (change === "reject") raw.answers.plan = choice("none");
        return raw;
      },
    });
    assert.equal(result.status, "clarify", change);
    assert.equal(result.calculation, undefined);
  }
});

test("malformed arithmetic choices fail rather than downgrading to demo", async () => {
  await assert.rejects(
    () =>
      respond(input(undefined, { mode: "live" }), {
        transport: async (payload) => {
          const raw = (await mock(payload)) as {
            answers: Record<string, unknown>;
          };
          raw.answers.calculation_left = choice("q999");
          return raw;
        },
      }),
    /invalid|incomplete/,
  );
});

test("saved calculations replay full notes, reject tampering and bind the rendered answer", async () => {
  const request = input(undefined, {
    mode: "live",
    notes: "Gamma costs 7 credits.\n\n" + notes,
  });
  const result = await respond(request, {
    transport: async (payload) => {
      const raw = (await mock(payload)) as { answers: Record<string, unknown> };
      if (payload.questions.intent) {
        raw.answers.calculation_left = choice("q2");
        raw.answers.calculation_right = choice("q3");
      }
      return raw;
    },
  });
  const parsed = parseSavedResult(JSON.parse(JSON.stringify(result)))!;
  assert.ok(parsed.calculation);
  assert.equal(await verifySavedResult(parsed, request.notes), true);
  const changed = structuredClone(parsed);
  changed.calculation!.result.display = "999 credits";
  assert.equal(await verifySavedResult(changed, request.notes), false);
  assert.equal(
    await verifySavedResult(
      parsed,
      request.notes.replace("12 credits", "13 credits"),
    ),
    false,
  );
  const orphan = structuredClone(parsed);
  orphan.sections[0].text = "The result is 999 credits.";
  orphan.text = orphan.sections.map((s) => s.text).join("\n\n");
  orphan.graph = await buildGraph(orphan.sections, "\n\n");
  assert.equal(await verifySavedResult(orphan, request.notes), false);
  const stripped = structuredClone(parsed);
  delete stripped.calculation;
  assert.equal(await verifySavedResult(stripped, request.notes), false);
  const duplicated = structuredClone(parsed);
  duplicated.sources = [parsed.sources[0], parsed.sources[0]];
  const { calculationSections } = await import("../lib/jev-chat/reasoning");
  duplicated.sections = calculationSections(
    parsed.calculation!,
    duplicated.sources,
  );
  duplicated.text = duplicated.sections.map((s) => s.text).join("\n\n");
  duplicated.graph = await buildGraph(duplicated.sections, "\n\n");
  assert.equal(await verifySavedResult(duplicated, request.notes), false);
});
