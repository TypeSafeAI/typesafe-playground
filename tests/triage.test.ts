import { test } from "node:test";
import assert from "node:assert/strict";
import { docExcerpt, rankEvidence, splitDocs, toHistory } from "../lib/matchEvidence";
import {
  buildTriagePayload,
  buildTriageRequest,
  resolveTriage,
  sampleContext,
  sampleDocs,
  sampleTranscript,
} from "../lib/classifyQuestionWithJev";
import { buildBatch, isQuestion, tally } from "../lib/batchTriage";
import { triageOutcomes, type JevResponse } from "../types/triage";
const history = toHistory([
  {
    speaker: "Val",
    timestamp: "09:02",
    content: "The API key stays server-side. Never ship it to the browser.",
  },
  {
    speaker: "Priya",
    timestamp: "09:11",
    content:
      "Rate limits are 60 requests a minute per key and you get HTTP 429 over that.",
  },
]);
const snippets = splitDocs(sampleDocs);
const answered = (
  choice: string,
  probability: number,
  evidence?: string,
): JevResponse => ({
  answers: {
    decision: {
      type: "choice",
      choice,
      probabilities: { [choice]: probability },
    },
    ...(evidence ? { evidence: { type: "choice", choice: evidence } } : {}),
  },
});
test("splits docs into citable markdown blocks under their heading", () => {
  const docs = `# Guide
- first item
- second item

\`\`\`python
print("hi")
\`\`\`

Paragraph one.
line two.`;
  const blocks = splitDocs(docs);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].title, "Guide");
  assert.equal(blocks[0].content, "- first item\n- second item");
  assert.equal(blocks[1].content, '```python\nprint("hi")\n```');
  assert.equal(blocks[2].content, "Paragraph one.\nline two.");
  assert.ok(blocks.every((s) => !s.content.startsWith("#")));
});

test("closes an opened fence when a long excerpt truncates mid-block", () => {
  const excerpt = docExcerpt(
    `\`\`\`python
def first():
    return 1

def second():
    return 2
\`\`\`
tail`,
    42,
  );
  assert.match(excerpt, /…\n```$/);
});

test("splits sample docs under their heading", () => {
  assert.equal(snippets[0].id, "D1");
  assert.equal(snippets[0].title, "Questions");
  assert.match(snippets[0].content, /at least two named candidates/);
  assert.equal(snippets.at(-1)!.title, "Models");
  assert.ok(snippets.every((s) => !s.content.startsWith("#")));
});
test("shortlists the messages and doc lines that share rare words", () => {
  const ranked = rankEvidence(
    "what happens if I send too many requests at once?",
    history,
    snippets,
  );
  assert.match(ranked[0].excerpt, /requests/);
  assert.deepEqual(
    [...ranked].sort((a, b) => b.score - a.score).map((c) => c.id),
    ranked.map((c) => c.id),
  );
  const rateLimit = ranked.find((c) => c.id === "M2")!;
  assert.equal(rateLimit.kind, "message");
  assert.ok(rateLimit.score > 0);
  assert.ok(ranked.some((c) => c.kind === "doc" && /429/.test(c.excerpt)));
  assert.ok(
    !ranked.some(
      (c) =>
        /never ship it to the browser/i.test(c.excerpt) &&
        c.score > rateLimit.score,
    ),
  );
});
test("never leaves Jev without something to cite", () => {
  const ranked = rankEvidence("zzzz qqqq", history, []);
  assert.ok(ranked.length > 0);
  assert.ok(ranked.every((c) => c.score === 0));
});
test("asks only for a closed outcome and one piece of evidence", () => {
  const { payload, candidates } = buildTriagePayload(
    "where does the key go?",
    history,
    snippets,
    "",
  );
  assert.deepEqual(Object.keys(payload.questions).sort(), [
    "decision",
    "evidence",
  ]);
  assert.deepEqual(
    Object.keys(payload.questions.decision.criteria!).sort(),
    Object.keys(triageOutcomes).sort(),
  );
  const evidence = Object.keys(payload.questions.evidence.criteria!);
  assert.ok(evidence.includes("none"));
  assert.deepEqual(
    evidence.slice(1),
    candidates.map((c) => c.id),
  );
  assert.equal(payload.model, "jev-latest");
});
test("refuses to build a request with nothing to check against", () => {
  assert.throws(
    () =>
      buildTriageRequest({
        question: "hi?",
        transcript: "",
        docs: "",
        format: "auto",
        model: "",
        historyLimit: 20,
      }),
    /chat history, documentation, or both/,
  );
});
test("keeps a confident, message-backed duplicate out of a human's inbox", () => {
  const candidates = rankEvidence("too many requests?", history, snippets);
  const decision = resolveTriage(
    answered("already_answered", 0.93, "M2"),
    candidates,
    0.7,
  );
  assert.equal(decision.outcome, "already_answered");
  assert.equal(decision.overridden, false);
  assert.equal(decision.evidence?.id, "M2");
  assert.match(decision.suggestedReply, /Priya at 09:11/);
  assert.match(decision.suggestedReply, /429/);
});
test("falls back to a human on a weak signal", () => {
  const candidates = rankEvidence("too many requests?", history, snippets);
  const decision = resolveTriage(
    answered("already_answered", 0.44, "M2"),
    candidates,
    0.7,
  );
  assert.equal(decision.outcome, "needs_human");
  assert.equal(decision.proposed, "already_answered");
  assert.ok(decision.overridden);
  assert.match(decision.reason, /under the 70% gate/);
  assert.equal(decision.suggestedReply, "");
});
test("reports the outcome its citation actually supports", () => {
  const candidates = rankEvidence("too many requests?", history, snippets);
  const cited = candidates.find((c) => c.kind === "doc")!;
  const realigned = resolveTriage(
    answered("already_answered", 0.98, cited.id),
    candidates,
    0.7,
  );
  assert.equal(realigned.outcome, "answerable_by_docs");
  assert.equal(realigned.proposed, "already_answered");
  assert.ok(realigned.overridden);
  assert.equal(realigned.evidence?.id, cited.id);
  assert.match(realigned.suggestedReply, /The docs answer this/);
  const fromChat = resolveTriage(
    answered("answerable_by_docs", 0.98, "M2"),
    candidates,
    0.7,
  );
  assert.equal(fromChat.outcome, "already_answered");
  assert.ok(fromChat.overridden);
});

test("falls back to a human when nothing was cited at all", () => {
  const candidates = rankEvidence("too many requests?", history, snippets);
  const uncited = resolveTriage(
    answered("answerable_by_docs", 0.98, "none"),
    candidates,
    0.7,
  );
  assert.equal(uncited.outcome, "needs_human");
  assert.ok(uncited.overridden);
  assert.match(uncited.reason, /nothing to audit/);
  assert.equal(uncited.suggestedReply, "");
});
test("falls back to a human when Jev answers outside the closed set", () => {
  const decision = resolveTriage(answered("ask_the_bot", 0.99), [], 0.7);
  assert.equal(decision.outcome, "needs_human");
  assert.equal(decision.proposed, null);
  assert.ok(decision.overridden);
});
test("does not treat a low-confidence needs_human as an override", () => {
  const decision = resolveTriage(answered("needs_human", 0.31), [], 0.7);
  assert.equal(decision.outcome, "needs_human");
  assert.equal(decision.overridden, false);
});
test("recognizes questions and skips statements", () => {
  assert.ok(isQuestion("where do I put my api key?"));
  assert.ok(isQuestion("any idea why mine still isn't working?"));
  assert.ok(!isQuestion("Rate limits are 60 requests a minute per key."));
  assert.ok(!isQuestion("   "));
});
test("gates every question in a dump against only what came before it", () => {
  const items = buildBatch({
    transcript: sampleTranscript,
    docs: sampleDocs,
    format: "auto",
    model: "",
    historyLimit: 20,
  });
  assert.equal(items.length, 6);
  assert.equal(items[0].message.speaker, "Tyler");
  const first = items[0].request.history;
  assert.ok(first.every((m) => m.speaker !== "Tyler"));
  assert.match(first[0].content, /stays server-side/);
  assert.ok(items.at(-1)!.request.history.some((m) => m.speaker === "Casey"));
});
test("reports the questions that reading up would have prevented", () => {
  const candidates = rankEvidence("too many requests?", history, snippets);
  const docLine = candidates.find((c) => c.kind === "doc")!;
  const meter = tally([
    resolveTriage(answered("already_answered", 0.95, "M2"), candidates),
    resolveTriage(answered("answerable_by_docs", 0.91, docLine.id), candidates),
    resolveTriage(answered("needs_human", 0.9), candidates),
    resolveTriage(answered("needs_more_context", 0.88), candidates),
    undefined,
  ]);
  assert.deepEqual(
    {
      total: meter.total,
      avoidable: meter.avoidable,
      needsHuman: meter.needsHuman,
      unclear: meter.unclear,
    },
    { total: 4, avoidable: 2, needsHuman: 1, unclear: 1 },
  );
  assert.equal(meter.ratio, 0.5);
  assert.equal(meter.label, "The answer was right there.");
});
test("the single-question sample parses into usable context", () => {
  const request = buildTriageRequest({
    question: "what happens if I send too many requests at once?",
    transcript: sampleContext,
    docs: sampleDocs,
    format: "auto",
    model: "",
    historyLimit: 20,
  });
  assert.equal(request.history.length, 4);
  assert.ok(request.candidates.length > 1);
});
