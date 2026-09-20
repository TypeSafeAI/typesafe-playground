import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverEndpoints, matchEndpoint } from "../src/clean-room/discovery";
import { configSchema } from "../src/clean-room/contracts";
import { AuditModels, summarizeCost } from "../src/clean-room/models";
import { compareObservations } from "../src/clean-room/verify";

const spec = {
  openapi: "3.0.3",
  components: {
    schemas: {
      Item: {
        type: "object",
        properties: { id: { type: "string" }, title: { type: "string" } },
      },
    },
  },
  paths: {
    "/items/{id}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      get: {
        security: [{ bearer: [] }],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Item" },
              },
            },
          },
        },
      },
    },
  },
};

test("discovery resolves local refs, preserves variables and auth evidence", () => {
  const [endpoint] = discoverEndpoints(spec, []);
  assert.equal(endpoint.path, "/items/{id}");
  assert.equal(endpoint.parameters[0].name, "id");
  assert.deepEqual(endpoint.responseSchema, {
    type: "object",
    properties: { id: { type: "string" }, title: { type: "string" } },
  });
  assert.equal(endpoint.authEvidence, "required");
  assert.equal(matchEndpoint("GET", "/items/42", [endpoint])?.id, endpoint.id);
  assert.equal(matchEndpoint("POST", "/items/42", [endpoint]), undefined);
});
test("network-only discovery merges query parameters and never retains auth headers", () => {
  const endpoints = discoverEndpoints(null, [
    {
      method: "GET",
      url: "http://localhost/api/items?q=test",
      status: 200,
      request: null,
      response: [{ id: 1, title: "A" }],
    },
  ]);
  assert.equal(endpoints[0].parameters[0].name, "q");
  assert.equal(endpoints[0].responseSchema.type, "array");
  assert.equal(endpoints[0].authEvidence, "unknown");
});
test("config rejects ambiguous targets, duplicate screens, and unsafe relative paths", () => {
  const base = {
    target: "http://localhost:4000",
    screens: [{ id: "home", path: "/" }],
  };
  assert.equal(configSchema.safeParse(base).success, true);
  assert.equal(
    configSchema.safeParse({ ...base, target: "file:///etc/passwd" }).success,
    false,
  );
  assert.equal(
    configSchema.safeParse({
      ...base,
      screens: [{ id: "home", path: "//evil.test" }],
    }).success,
    false,
  );
  assert.equal(
    configSchema.safeParse({
      ...base,
      screens: [base.screens[0], base.screens[0]],
    }).success,
    false,
  );
});
test("Jev decisions reject out-of-set answers and log failures and unknown tokens", async () => {
  const audit = new AuditModels({
    mode: "mock",
    jev: async () => ({
      answers: { choice: { type: "choice", choice: "invented" } },
    }),
  });
  await assert.rejects(
    audit.choose(
      "endpoints",
      { e: 1 },
      { choice: { instructions: "Choose", criteria: { a: "A", b: "B" } } },
    ),
    /choice/,
  );
  assert.equal(audit.decisions.length, 1);
  assert.equal(audit.decisions[0].status, "failed");
  assert.equal(summarizeCost(audit).complete, false);
});
test("Jev context bound rejects before calling transport", async () => {
  let calls = 0;
  const audit = new AuditModels({
    mode: "mock",
    jev: async () => {
      calls++;
      return { answers: {} };
    },
  });
  await assert.rejects(
    audit.choose(
      "endpoints",
      { text: "a".repeat(33000) },
      { choice: { instructions: "Choose", criteria: { a: "A", b: "B" } } },
    ),
    /context/,
  );
  assert.equal(calls, 0);
});
test("independent comparison catches missing calls, error statuses and changed behavior", () => {
  const before = {
    text: "Items\nA",
    elements: [{ role: "button", label: "Add", value: "" }],
    network: [
      {
        method: "POST",
        url: "http://original/api/items",
        status: 201,
        request: { title: "A" },
        response: { id: 1, title: "A" },
      },
    ],
    errors: [],
  };
  assert.deepEqual(
    compareObservations(before, {
      ...before,
      network: before.network.map((n) => ({
        ...n,
        url: "http://clone/api/items",
      })),
    }),
    [],
  );
  assert.ok(
    compareObservations(before, { ...before, network: [] }).some((x) =>
      x.includes("network"),
    ),
  );
  assert.ok(
    compareObservations(before, { ...before, text: "Items" }).some((x) =>
      x.includes("text"),
    ),
  );
  assert.ok(
    compareObservations(before, {
      ...before,
      network: [{ ...before.network[0], status: 500 }],
    }).length,
  );
});

test("component generation is gated and equivalent nodes never generate twice", async () => {
  const { generateComponents } = await import("../src/clean-room/classify");
  const node = (id: string) => ({
    id,
    tag: "li",
    role: "listitem",
    label: "",
    text: "",
    value: "",
    attrs: {},
    style: { display: "flex" },
    children: [],
  });
  const screens = [
    {
      id: "x",
      path: "/",
      title: "X",
      network: [],
      root: {
        ...node("root"),
        tag: "ul",
        role: "list",
        children: [node("one"), node("two")],
      },
    },
  ];
  const audit = new AuditModels({
    mode: "mock",
    jev: async (p) => {
      const s = p.state as any;
      const choice =
        s.node.role === "list"
          ? "BUILTIN"
          : s.existingComponent
            ? "REUSE"
            : "EMIT_TEMPLATE";
      return {
        answers: { decision: { type: "choice", choice, confidence: 1 } },
        usage: { input_tokens: 10, output_tokens: 1 },
      };
    },
  });
  const components = await generateComponents(screens, audit);
  assert.equal(Object.keys(components).length, 1);
  assert.equal(audit.generations.length, 1);
  assert.equal(
    (screens[0].root.children[0] as any).component,
    (screens[0].root.children[1] as any).component,
  );
  assert.equal(
    Object.hasOwn(audit.generations[0].input as object, "endpoints"),
    false,
  );
});
test("cost report refuses a complete benchmark with unknown prices or usage", () => {
  const audit = new AuditModels({
    mode: "live",
    jev: async () => ({}),
  });
  audit.decisions.push({
    stage: "endpoints",
    input: {},
    output: {},
    status: "ok",
    durationMs: 10,
    usage: { inputTokens: 1000, outputTokens: 2 },
  });
  assert.equal(summarizeCost(audit).referenceStatus, "unverified");
  const report = summarizeCost(audit, {
    jevInput: 0.042,
    jevOutput: 0,
  });
  assert.equal(report.complete, true);
  assert.equal(report.totalCostUsd, 0.000042);
  assert.equal(report.referenceStatus, "unverified");
  assert.equal(
    summarizeCost(audit, { jevInput: 0.042, jevOutput: 0 }, true)
      .referenceStatus,
    "under",
  );
  assert.deepEqual(report.costDrivers, ["endpoints"]);
});

test("endpoint relationships can connect differently named fields", async () => {
  const { classifyEndpoints } = await import("../src/clean-room/classify");
  const endpoints = discoverEndpoints(
    {
      paths: {
        "/users": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { id: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
        "/tasks": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { ownerId: { type: "string" } },
                  },
                },
              },
            },
            responses: { "200": {} },
          },
        },
      },
    },
    [],
  );
  const audit = new AuditModels({
    mode: "mock",
    jev: async (p) => ({
      answers: Object.fromEntries(
        Object.entries(p.questions).map(([id, q]) => [
          id,
          {
            type: "choice",
            choice:
              (p.state as any).task === "relationship"
                ? Object.keys(q.criteria!).find((k) => k !== "none")
                : Object.keys(q.criteria!)[0],
            confidence: 1,
          },
        ]),
      ),
    }),
  });
  const edges = await classifyEndpoints(endpoints, audit);
  assert.ok(edges.some((e) => e.output === "id" && e.input === "ownerId"));
});

test("live component emission needs no model, credentials, network, or call budget", async (t) => {
  const { liveAdapters } = await import("../src/clean-room/models");
  const { demoAdapters } = await import("../src/clean-room/demos");
  t.mock.method(globalThis, "fetch", async () => {
    assert.fail("Component emission must never call a provider");
  });
  const audit = new AuditModels(liveAdapters(), {
    maxCalls: 0,
    minConfidence: 0.7,
  });
  const node = {
    tag: "li",
    attrs: {},
    text: "Observed item",
    style: { display: "flex" },
  };
  const code = await audit.generate(node);
  const demo = new AuditModels(demoAdapters());
  assert.equal(code, await demo.generate(node));
  assert.match(code, /export function render/);
  assert.equal(audit.decisions.length, 0);
  assert.equal(audit.generations[0].status, "ok");
  assert.equal(
    (audit.generations[0].output as any).implementation,
    "deterministic",
  );
  assert.deepEqual(audit.generations[0].usage, {
    inputTokens: 0,
    outputTokens: 0,
  });
  const cost = summarizeCost(audit);
  assert.equal(cost.generationCalls, 0);
  assert.equal(cost.componentEmissions, 1);
  assert.equal(cost.knownCostUsd, 0);
  assert.equal(cost.totalCostUsd, null);
  assert.equal(cost.referenceStatus, "unverified");
  assert.equal(Object.hasOwn(liveAdapters(), "generate"), false);
});

test("local API accepts Next canonical URLs while checking the actual loopback Host and Origin", async () => {
  const { requireLocalRebuild } = await import("../src/clean-room/local-only");
  assert.doesNotThrow(() =>
    requireLocalRebuild(
      new Request("http://localhost:3108/api/clean-room", {
        headers: { host: "127.0.0.1:3108", origin: "http://127.0.0.1:3108" },
      }),
    ),
  );
  assert.throws(() =>
    requireLocalRebuild(
      new Request("http://localhost:3108/api/clean-room", {
        headers: { host: "127.0.0.1:3108", origin: "https://evil.test" },
      }),
    ),
  );
  assert.throws(() =>
    requireLocalRebuild(
      new Request("http://localhost:3108/api/clean-room", {
        headers: { host: "evil.test", origin: "http://evil.test" },
      }),
    ),
  );
});

test("deterministic wiring supplies request-body fields from classified endpoint relationships", async () => {
  const { buildRequest } = await import("../src/clean-room/request.js");
  const endpoint = {
    id: "create",
    method: "POST",
    path: "/tasks",
    parameters: [],
    requestSchema: {
      type: "object",
      properties: { ownerId: { type: "string" }, title: { type: "string" } },
      required: ["ownerId", "title"],
    },
  };
  const nodes = [{ id: "title", field: "req:create:title", value: "New task" }];
  const request = buildRequest(
    endpoint,
    nodes,
    new Map(),
    new Map([["user", { id: "u1" }]]),
    [{ from: "user", to: "create", output: "id", input: "ownerId" }],
    [],
  );
  assert.deepEqual(JSON.parse(request.body), {
    ownerId: "u1",
    title: "New task",
  });
  assert.throws(
    () => buildRequest(endpoint, nodes, new Map(), new Map(), [], []),
    /ownerId/,
  );
});

test("wrapped response fields resolve against the current list row", async () => {
  const { readField } = await import("../src/clean-room/request.js");
  assert.equal(
    readField({ name: "Second" }, "items[].name", "items[]"),
    "Second",
  );
  assert.equal(readField({ name: "Second" }, "[].name", "[]"), "Second");
});

test("radio bindings submit the selected option value, not a boolean", async () => {
  const { buildRequest } = await import("../src/clean-room/request.js");
  const endpoint = {
    id: "e",
    method: "POST",
    path: "/choice",
    parameters: [],
    requestSchema: {
      type: "object",
      properties: { owner: { type: "string" } },
      required: ["owner"],
    },
  };
  const nodes = [
    {
      id: "a",
      field: "req:e:owner",
      attrs: { type: "radio" },
      value: "42",
      checked: false,
    },
    {
      id: "b",
      field: "req:e:owner",
      attrs: { type: "radio" },
      value: "67",
      checked: true,
    },
  ];
  assert.deepEqual(
    JSON.parse(
      buildRequest(endpoint, nodes, new Map(), new Map(), [], []).body,
    ),
    { owner: "67" },
  );
});
test("coverage distinguishes repeated controls by their nth occurrence", async () => {
  const { unexercisedControls } = await import("../src/clean-room/verify");
  const button = (id: string) => ({
    id,
    tag: "button",
    role: "button",
    label: "Delete",
    text: "Delete",
    value: "",
    attrs: {},
    style: {},
    children: [],
  });
  const screen = {
    id: "list",
    path: "/",
    title: "List",
    network: [],
    root: {
      ...button("root"),
      role: "generic",
      children: [button("a"), button("b")],
    },
  };
  const gaps = unexercisedControls(screen, [
    { kind: "click", role: "button", name: "Delete", nth: 0 },
  ]);
  assert.equal(gaps.length, 1);
  assert.ok(gaps[0].includes("[1]"));
});

test("exported navigation stays in the clone without rewriting external links or observation evidence", async () => {
  const { emitApp } = await import("../src/clean-room/emit");
  const { mkdtemp, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const link = (id: string, href: string) => ({
    id,
    tag: "a",
    role: "link",
    label: "Open",
    text: "Open",
    value: "",
    attrs: { href },
    style: {},
    children: [],
    presentation: { tag: "a", attrs: { href }, style: {}, text: "Open" },
  });
  const root = {
    ...link("root", "/"),
    tag: "main",
    role: "main",
    children: [
      link("local", "https://target.test/support?tab=help"),
      link("external", "https://docs.test/help"),
    ],
  };
  const manifest = {
    target: "https://target.test",
    endpoints: [],
    edges: [],
    screens: [
      { id: "home", path: "/", title: "Home", root, network: [] },
      {
        id: "support",
        path: "/support?tab=help",
        title: "Support",
        root: link("support", "/"),
        network: [],
      },
    ],
  };
  const dir = await mkdtemp(path.join(tmpdir(), "clean-room-navigation-"));
  try {
    await emitApp(dir, manifest, {});
    const emitted = JSON.parse(
      await readFile(path.join(dir, "manifest.json"), "utf8"),
    );
    assert.equal(
      emitted.screens[0].root.children[0].attrs.href,
      "/support?tab=help",
    );
    assert.equal(
      emitted.screens[0].root.children[0].presentation.attrs.href,
      "/support?tab=help",
    );
    assert.equal(
      emitted.screens[0].root.children[1].attrs.href,
      "https://docs.test/help",
    );
    assert.equal(
      root.children[0].attrs.href,
      "https://target.test/support?tab=help",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("target origins canonicalize trailing slashes, host case, and default ports", () => {
  const screens = [{ id: "home", path: "/" }];
  for (const target of [
    "http://EXAMPLE.test:80/",
    "http://example.test",
    "http://example.test/",
  ])
    assert.equal(
      configSchema.parse({ target, screens }).target,
      "http://example.test",
    );
});
