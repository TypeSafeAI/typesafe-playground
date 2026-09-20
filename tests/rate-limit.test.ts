import { test } from "node:test";
import assert from "node:assert/strict";
import { ServerRateLimiter } from "../lib/serverRateLimit";
import { RequestQueue } from "../lib/requestRateLimit";
import {
  getUsage,
  recordUsage,
  releaseUsageBlock,
  usageContext,
  usageBlocked,
} from "../lib/logUsageEntry";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
test("server enforces rolling windows, concurrency and key isolation", () => {
  const limiter = new ServerRateLimiter();
  const first = limiter.acquire("a", 1000),
    second = limiter.acquire("a", 1000);
  assert.ok(first.allowed && second.allowed);
  assert.equal(limiter.acquire("a", 1000).allowed, false);
  assert.equal(limiter.acquire("b", 1000).allowed, true);
  first.release();
  first.release();
  second.release();
  for (let i = 2; i < 60; i++) {
    const p = limiter.acquire("a", 1000 + i);
    assert.ok(p.allowed);
    p.release();
  }
  const exhausted = limiter.acquire("a", 2000);
  assert.equal(exhausted.allowed, false);
  assert.equal(exhausted.report.remaining, 0);
  assert.equal(exhausted.report.retryAt, new Date(61000).toISOString());
  assert.equal(limiter.acquire("a", 61000).allowed, true);
});
test("queue spaces starts and cancels waiting work without executing it", async () => {
  const queue = new RequestQueue(() => {}, 30);
  const starts: number[] = [];
  const run = () =>
    queue.run(async () => {
      starts.push(Date.now());
    });
  const a = run();
  const controller = new AbortController();
  let called = false;
  const cancelled = queue.run(async () => {
    called = true;
  }, controller.signal);
  const rejected = assert.rejects(cancelled);
  controller.abort();
  const b = run();
  await Promise.all([a, b, rejected]);
  assert.equal(called, false);
  assert.ok(starts[1] - starts[0] >= 25);
});
test("queue bounds concurrency, rejects overflow and releases failed jobs", async () => {
  const queue = new RequestQueue(() => {}, 1);
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  const a = queue.run(() => held),
    b = queue.run(() => held);
  await wait(10);
  assert.equal(queue.status().active, 2);
  const controller = new AbortController();
  const waiting = Array.from({ length: 20 }, () =>
    queue.run(async () => {}, controller.signal),
  );
  const finished = Promise.allSettled(waiting);
  await assert.rejects(
    queue.run(async () => {}),
    /queue is full/,
  );
  controller.abort();
  await finished;
  release();
  await Promise.all([a, b]);
  await assert.rejects(
    queue.run(async () => {
      throw Error("failure");
    }),
    /failure/,
  );
  await queue.run(async () => {});
});
test("local refusal blocks transparently but does not add provider usage", () => {
  releaseUsageBlock();
  const before = getUsage().requests;
  const retryAt = new Date(Date.now() + 60000).toISOString();
  recordUsage(
    {},
    {
      attempted: false,
      status: 429,
      inputTokens: null,
      outputTokens: null,
      retryAt,
      rateLimit: {
        source: "playground_server",
        scope: "per_key_per_server_instance",
        limit: 60,
        windowSeconds: 60,
        remaining: 0,
        active: 0,
        retryAt,
      },
    },
    "failed",
    "/api/run",
    usageContext(),
    "doom",
  );
  assert.equal(getUsage().requests, before);
  assert.equal(usageBlocked(), true);
  assert.match(getUsage().block!.message, /No request was sent/);
  releaseUsageBlock();
});

test("server route rejects concurrent overflow before upstream and supplies Retry-After", async () => {
  const { POST } = await import("../app/api/run/route");
  const original = globalThis.fetch;
  let finish!: () => void;
  const pending = new Promise<void>((r) => {
    finish = r;
  });
  let sent = 0;
  globalThis.fetch = async () => {
    sent++;
    await pending;
    return Response.json({ answers: {} });
  };
  const request = () =>
    new Request("http://localhost/api/run", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-typesafe-api-key": "rate-route-test",
      },
      body: JSON.stringify({
        state: "test",
        questions: { answer: { type: "noul", instructions: "classify" } },
      }),
    });
  try {
    const first = POST(request()),
      second = POST(request());
    await wait(10);
    const rejected = await POST(request());
    assert.equal(rejected.status, 429);
    assert.ok(Number(rejected.headers.get("retry-after")) >= 1);
    assert.equal((await rejected.json())._playgroundUsage.attempted, false);
    assert.equal(sent, 2);
    finish();
    await Promise.all([first, second]);
    assert.equal((await POST(request())).status, 200);
  } finally {
    finish();
    globalThis.fetch = original;
  }
});
