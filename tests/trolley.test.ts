import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePayload } from "../lib/api";
import {
  TROLLEY_CASES,
  buildTrolleyPayload,
  resolveTrolleyChoice,
  type TrolleyDecision,
} from "../lib/trolley";
import {
  runTrolleyCases,
  TROLLEY_REQUEST_TIMEOUT_MS,
} from "../lib/trolley-runner";

const reply = (
  action = "pull",
  probabilities: unknown = { pull: 0.7, stay: 0.3 },
) => ({
  answers: {
    action: { type: "choice", choice: action, confidence: 0.9, probabilities },
  },
});
const noWait = async () => {};

test("all twelve scenarios use a bounded, closed choice contract without an answer key", () => {
  assert.equal(TROLLEY_CASES.length, 12);
  assert.equal(new Set(TROLLEY_CASES.map((item) => item.id)).size, 12);
  for (const scenario of TROLLEY_CASES) {
    const payload = validatePayload(buildTrolleyPayload(scenario.id));
    assert.equal(payload.model, "jev-latest");
    assert.deepEqual(Object.keys(payload.questions), ["action"]);
    assert.deepEqual(Object.keys(payload.questions.action.criteria!), [
      "pull",
      "stay",
    ]);
    assert.ok(JSON.stringify(payload).length < 4000);
    assert.ok(scenario.assumption);
    assert.ok(scenario.main.count >= 0 && scenario.main.count <= 5);
    assert.ok(scenario.side.count >= 0 && scenario.side.count <= 5);
    assert.ok(!Object.hasOwn(scenario, "expected"));
  }
  assert.throws(() => buildTrolleyPayload("invented"), /Unknown/);
});

test("human/robot assumptions and uncertainty remain explicit in Jev's actual input", () => {
  const robots = JSON.stringify(buildTrolleyPayload("robots-or-human"));
  assert.match(robots, /non-sentient/);
  assert.match(robots, /human dies/);
  const uncertain = JSON.stringify(buildTrolleyPayload("uncertain-switch"));
  assert.match(uncertain, /50% chance all six die/);
  assert.match(uncertain, /outcome remains unknown/);
  assert.match(
    JSON.stringify(buildTrolleyPayload("loop-track")),
    /no independent barrier/,
  );
});

test("Jev's selected action is preserved even if it is not the largest probability", () => {
  assert.deepEqual(resolveTrolleyChoice(reply("stay")), {
    action: "stay",
    confidence: 0.3,
    probabilities: { pull: 0.7, stay: 0.3 },
  });
});

test("malformed, incomplete and out-of-set responses never become choices", () => {
  const invalid = [
    null,
    {},
    { answers: {} },
    reply("stop"),
    reply("pull", { pull: 1 }),
    reply("pull", { pull: 0.7, stay: 0.3, stop: 0 }),
    reply("pull", { pull: 0.7, stay: 0.7 }),
    reply("pull", { pull: NaN, stay: 0.3 }),
    reply("pull", { pull: 1.1, stay: -0.1 }),
    reply("pull", { pull: "0.7", stay: 0.3 }),
    {
      answers: { action: { ...reply().answers.action, confidence: Infinity } },
    },
    { answers: { action: { ...reply().answers.action, type: "score" } } },
  ];
  for (const response of invalid)
    assert.throws(
      () => resolveTrolleyChoice(response),
      /No action was applied/,
    );
});

test("run all makes exactly twelve sequential real transport calls and receipts", async () => {
  const calls: string[] = [];
  const results: TrolleyDecision[] = [];
  let inFlight = 0;
  let selected = "";
  await runTrolleyCases({
    ids: TROLLEY_CASES.map((item) => item.id),
    signal: new AbortController().signal,
    transport: async (payload) => {
      assert.equal(inFlight++, 0);
      const id = (payload.state as { scenario_id: string }).scenario_id;
      assert.equal(selected, id);
      calls.push(id);
      await Promise.resolve();
      inFlight--;
      return reply();
    },
    assertCurrent() {},
    onCase(id) {
      selected = id;
    },
    onDecision(result) {
      results.push(result);
    },
    wait: noWait,
  });
  assert.deepEqual(
    calls,
    TROLLEY_CASES.map((item) => item.id),
  );
  assert.equal(results.length, 12);
  assert.ok(
    results.every(
      (result) =>
        result.source === "jev" &&
        result.latencyMs !== null &&
        result.action === "pull",
    ),
  );
});

test("invalid batches are rejected before any request", async () => {
  for (const ids of [
    [],
    ["classic-switch", "classic-switch"],
    ["invented"],
    Array.from({ length: 13 }, (_, i) => String(i)),
  ]) {
    let called = false;
    await assert.rejects(
      runTrolleyCases({
        ids,
        signal: new AbortController().signal,
        transport: async () => {
          called = true;
          return reply();
        },
        assertCurrent() {},
        onCase() {},
        onDecision() {},
        wait: noWait,
      }),
    );
    assert.equal(called, false);
  }
});

test("provider failure and invalid responses stop immediately without a fallback", async () => {
  for (const invalid of [false, true]) {
    let calls = 0;
    const results: TrolleyDecision[] = [];
    await assert.rejects(
      runTrolleyCases({
        ids: ["classic-switch", "equal-lives"],
        signal: new AbortController().signal,
        transport: async () => {
          calls++;
          if (invalid) return reply("stop");
          throw Error("provider unavailable");
        },
        assertCurrent() {},
        onCase() {},
        onDecision(result) {
          results.push(result);
        },
        wait: noWait,
      }),
    );
    assert.equal(calls, 1);
    assert.deepEqual(results, []);
  }
});

test("cancellation discards a late transport result even if the transport ignores abort", async () => {
  const controller = new AbortController();
  let resolve!: (value: unknown) => void;
  let child!: AbortSignal;
  const results: TrolleyDecision[] = [];
  const promise = runTrolleyCases({
    ids: ["classic-switch", "equal-lives"],
    signal: controller.signal,
    transport: async (_, signal) => {
      child = signal;
      return new Promise((done) => {
        resolve = done;
      });
    },
    assertCurrent() {},
    onCase() {},
    onDecision(result) {
      results.push(result);
    },
    wait: noWait,
  });
  controller.abort();
  await assert.rejects(promise);
  assert.equal(child.aborted, true);
  resolve(reply());
  await Promise.resolve();
  assert.deepEqual(results, []);
});

test("freshness is checked after the network returns", async () => {
  let current = true;
  let applied = false;
  await assert.rejects(
    runTrolleyCases({
      ids: ["classic-switch"],
      signal: new AbortController().signal,
      transport: async () => {
        current = false;
        return reply();
      },
      assertCurrent() {
        if (!current) throw Error("key changed");
      },
      onCase() {},
      onDecision() {
        applied = true;
      },
      wait: noWait,
    }),
    /key changed/,
  );
  assert.equal(applied, false);
});

test("cancelling the result hold prevents the next request", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    runTrolleyCases({
      ids: ["classic-switch", "equal-lives"],
      signal: controller.signal,
      transport: async () => {
        calls++;
        return reply();
      },
      assertCurrent() {},
      onCase() {},
      onDecision() {
        controller.abort();
      },
    }),
  );
  assert.equal(calls, 1);
});

test("a hanging request times out with no decision", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let signal!: AbortSignal;
  let applied = false;
  const promise = runTrolleyCases({
    ids: ["classic-switch"],
    signal: new AbortController().signal,
    transport: async (_, requestSignal) => {
      signal = requestSignal;
      return new Promise(() => {});
    },
    assertCurrent() {},
    onCase() {},
    onDecision() {
      applied = true;
    },
    wait: noWait,
  });
  const rejection = assert.rejects(promise, /timed out/);
  context.mock.timers.tick(TROLLEY_REQUEST_TIMEOUT_MS);
  await rejection;
  assert.equal(signal.aborted, true);
  assert.equal(applied, false);
});
