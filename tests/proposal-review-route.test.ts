import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/proposal-review/route";
import { loadFixtures } from "../lib/harness/load";
import { JEV_MODEL, REVIEW_QUESTIONS } from "../lib/harness/review";
import { MOCK_MODEL } from "../lib/harness/mock";
import { REVIEW_QUESTION_IDS } from "../lib/harness/types";

const fixtures = loadFixtures();
const clean = fixtures.find((f) => f.category === "clean" && f.expected.bad === "proposal_only")!;
const rejecting = fixtures.find((f) => f.expected.bad === "reject")!;
const ORIGIN = "http://127.0.0.1:3042";

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request(`${ORIGIN}/api/proposal-review`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        host: "127.0.0.1:3042",
        "content-type": "application/json",
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

test("route: cross-origin, wrong content type, and malformed bodies stop before any fixture is loaded", async () => {
  const cross = await post({ fixtureId: clean.id, arm: "good", mode: "mock" }, { origin: "https://evil.test" });
  assert.equal(cross.status, 403);
  const sfs = await post({ fixtureId: clean.id, arm: "good", mode: "mock" }, { "sec-fetch-site": "cross-site" });
  assert.equal(sfs.status, 403);
  const text = await post({ fixtureId: clean.id, arm: "good", mode: "mock" }, { "content-type": "text/plain" });
  assert.equal(text.status, 415);
  for (const body of [
    "not json",
    {},
    { fixtureId: clean.id, arm: "good" },
    { fixtureId: clean.id, arm: "ugly", mode: "mock" },
    { fixtureId: clean.id, arm: "good", mode: "real" },
    { fixtureId: "../etc", arm: "good", mode: "mock" },
    // Client-supplied state, questions, or proposals are refused outright.
    { fixtureId: clean.id, arm: "good", mode: "mock", state: { task: "x" } },
    { fixtureId: clean.id, arm: "good", mode: "mock", questions: {} },
    { fixtureId: clean.id, arm: "good", mode: "mock", proposal: clean.proposals.bad },
  ]) {
    const r = await post(body);
    assert.equal(r.status, 400, JSON.stringify(body));
    const data = await r.json();
    assert.match(data.error, /fixtureId/);
    assert.deepEqual(data._playgroundUsage, { attempted: false });
  }
  const missing = await post({ fixtureId: "no-such-fixture", arm: "good", mode: "mock" });
  assert.equal(missing.status, 404);
});

test("route: mock mode returns a labeled mock receipt built from the fixture on disk", async () => {
  const r = await post({ fixtureId: clean.id, arm: "good", mode: "mock" });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const data = await r.json();
  assert.deepEqual(data._playgroundUsage, { attempted: false }, "mock never touches the provider");
  const { receipt, exchange } = data;
  assert.equal(receipt.fixtureId, clean.id);
  assert.equal(receipt.arm, "good");
  assert.equal(receipt.mode, "plus_jev");
  assert.equal(receipt.verdict, "permit");
  assert.equal(receipt.jev.source, "mock");
  assert.equal(receipt.jev.model, MOCK_MODEL);
  assert.equal(receipt.execution.applied, false);
  assert.equal(receipt.execution.status, "recorded_pending");
  assert.deepEqual(receipt.proposal, clean.proposals.good, "the proposal comes from the fixture, not the client");
  assert.equal(exchange.payload.model, JEV_MODEL);
  assert.deepEqual(Object.keys(exchange.payload.questions).sort(), [...REVIEW_QUESTION_IDS].sort());
  assert.equal(exchange.payload.state.task, clean.task);
  const bad = await (await post({ fixtureId: clean.id, arm: "bad", mode: "mock" })).json();
  assert.equal(bad.receipt.verdict, "proposal_only");
  assert.equal(bad.receipt.jev.source, "mock");
});

test("route: validation failure rejects with Jev untouched, in mock and live mode alike", async () => {
  const key = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "";
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error("provider must not be reached");
  };
  try {
    for (const mode of ["mock", "live"] as const) {
      const r = await post({ fixtureId: rejecting.id, arm: "bad", mode });
      assert.equal(r.status, 200);
      const { receipt, exchange } = await r.json();
      assert.equal(receipt.verdict, "reject", mode);
      assert.equal(receipt.jev, null);
      assert.equal(exchange, null);
      assert.equal(receipt.execution.status, "withheld");
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
    process.env.TYPESAFE_API_KEY = key;
  }
});

test("route: live mode without a key is HTTP 200 with verdict unavailable, never permit", async () => {
  const key = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "";
  try {
    const r = await post({ fixtureId: clean.id, arm: "good", mode: "live" });
    assert.equal(r.status, 200);
    const { receipt } = await r.json();
    assert.equal(receipt.verdict, "unavailable");
    assert.equal(receipt.jev.answers, null);
    assert.equal(receipt.jev.source, "jev");
    assert.match(receipt.jev.error, /TYPESAFE_API_KEY/);
    assert.match(receipt.reason, /never as safe/);
    assert.equal(receipt.execution.status, "withheld");
  } finally {
    process.env.TYPESAFE_API_KEY = key;
  }
});

test("route: live mode forwards the rebuilt payload like /api/run and keeps the key out of the receipt", async () => {
  const original = globalThis.fetch;
  const key = process.env.TYPESAFE_API_KEY;
  const secret = "test-server-only-secret-proposal-review";
  process.env.TYPESAFE_API_KEY = secret;
  let sent: any = null;
  let auth: string | null = null;
  globalThis.fetch = (async (url: any, init: any) => {
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    auth = init.headers.Authorization;
    sent = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        model: JEV_MODEL,
        answers: {
          addresses_task: { type: "noul", noul: 0.97 },
          evidence_supports: { type: "noul", noul: 0.94 },
          unrelated_changes: { type: "noul", noul: 0.03 },
          needs_clarification: { type: "noul", noul: 0.05 },
        },
        usage: { input_tokens: 321, output_tokens: 4 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const r = await post({ fixtureId: clean.id, arm: "good", mode: "live" });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(auth, `Bearer ${secret}`);
    assert.equal(sent.model, JEV_MODEL);
    assert.equal(sent.state.task, clean.task);
    assert.deepEqual(sent.state.files, clean.files);
    assert.deepEqual(sent.state.proposal.patch, clean.proposals.good.patch);
    assert.deepEqual(Object.keys(sent.questions).sort(), [...REVIEW_QUESTION_IDS].sort());
    for (const id of REVIEW_QUESTION_IDS)
      assert.equal(sent.questions[id].instructions, REVIEW_QUESTIONS[id].instructions);
    assert.ok(!("arm" in sent.state) && !("expected" in sent.state) && !("mock" in sent.state));
    assert.equal(data.receipt.verdict, "permit");
    assert.equal(data.receipt.jev.source, "jev");
    assert.equal(data.receipt.jev.model, JEV_MODEL);
    assert.equal(data.receipt.jev.answers.addresses_task.probability, 0.97);
    assert.equal(data._playgroundUsage.attempted, true);
    assert.equal(data._playgroundUsage.inputTokens, 321);
    assert.ok(!JSON.stringify(data).includes(secret), "key never appears in the response");
  } finally {
    globalThis.fetch = original;
    process.env.TYPESAFE_API_KEY = key;
  }
});

test("route: an upstream provider error becomes verdict unavailable at HTTP 200 with the usage report", async () => {
  const original = globalThis.fetch;
  const key = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "test-server-only-secret-proposal-review";
  globalThis.fetch = (async () =>
    new Response("busy", { status: 429, headers: { "retry-after": "30" } })) as typeof fetch;
  try {
    const r = await post({ fixtureId: clean.id, arm: "good", mode: "live" });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.receipt.verdict, "unavailable");
    assert.match(data.receipt.jev.error, /rate limit/i);
    assert.equal(data._playgroundUsage.status, 429);
    assert.equal(data._playgroundUsage.attempted, true);
    assert.ok(data._playgroundUsage.retryAt);
  } finally {
    globalThis.fetch = original;
    process.env.TYPESAFE_API_KEY = key;
  }
});
