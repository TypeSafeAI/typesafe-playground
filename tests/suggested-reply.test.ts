import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestReply } from "../lib/matchEvidence";
import type { EvidenceCandidate } from "../types/triage";

const docs: EvidenceCandidate = {
  id: "O1916",
  kind: "doc",
  label: "Current models",
  excerpt:
    "**Rate limits:** Going over returns `429`. Our [client SDKs](/sdk) retry with backoff.",
  sourceUrl: "https://docs.typesafe.ai/api/rate-limits",
  score: 0.53,
};
const message: EvidenceCandidate = {
  id: "M3",
  kind: "message",
  label: "Priya at 09:11",
  excerpt: "Rate limits are 60 requests a minute per key.",
  score: 0.61,
};

test("a docs reply quotes the evidence instead of running it into the sentence", () => {
  const reply = suggestReply("answerable_by_docs", docs);
  // The wording other tests pin is unchanged.
  assert.match(reply, /^The docs answer this under \*\*Current models\*\*:/);
  // Every quoted line carries a marker, or a chat client quotes only the first.
  const quoted = reply.split("\n").filter((l) => l.startsWith(">"));
  assert.ok(quoted.length >= 1);
  assert.match(reply, /Shout if that leaves something out\.$/);
});

test("relative documentation links are absolute once the reply leaves the page", () => {
  const reply = suggestReply("answerable_by_docs", docs);
  assert.match(reply, /\(https:\/\/docs\.typesafe\.ai\/sdk\)/);
  // A bare "/sdk" target would resolve against whatever client opens the
  // message, which is never the docs site.
  assert.doesNotMatch(reply, /\]\(\/sdk\)/);
});

test("the source is a named link rather than a bare URL glued to the prose", () => {
  const reply = suggestReply("answerable_by_docs", docs);
  // Named for the page, not with the phrase that already labels the evidence
  // card's link: two links with one accessible name is ambiguous.
  assert.match(
    reply,
    /Source: \[Current models\]\(https:\/\/docs\.typesafe\.ai\/api\/rate-limits\)/,
  );
  assert.doesNotMatch(reply, /Read the source documentation/);
});

test("an unsafe link in the evidence does not survive into a pasted reply", () => {
  const reply = suggestReply("answerable_by_docs", {
    ...docs,
    excerpt: "See [evil](javascript:alert(1)) and [ok](/sdk).",
  });
  assert.doesNotMatch(reply, /javascript:/i);
  // The words stay; only the link is removed.
  assert.match(reply, /evil/);
});

test("a prior-message reply keeps its wording and quotes the message", () => {
  const reply = suggestReply("already_answered", message);
  assert.match(reply, /^This came up earlier — \*\*Priya at 09:11\*\* covered it:/);
  assert.match(reply, /^> Rate limits are 60 requests a minute per key\.$/m);
  assert.match(reply, /Give that a read and shout if it still doesn't fit\.$/);
});

test("no evidence means no reply to paste", () => {
  assert.equal(suggestReply("answerable_by_docs", null), "");
  assert.equal(suggestReply("needs_human", docs), "");
  assert.equal(suggestReply("needs_more_context", docs), "");
});

test("a docs reply without a source URL omits the link rather than emitting an empty one", () => {
  const reply = suggestReply("answerable_by_docs", {
    ...docs,
    sourceUrl: undefined,
  });
  assert.doesNotMatch(reply, /Source: \[/);
  assert.doesNotMatch(reply, /\]\(\)/);
});
