import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildGraph,
  canonical,
  hashValue,
  verifyGraph,
  type GraphNode,
  type ResponseGraph,
} from "../lib/jev-chat/graph";

const leaf = (text: string): GraphNode => ({
  kind: "text",
  text,
  children: [],
  provenance: "authored",
});

async function graphWithRoot(
  root: GraphNode,
  nodes: Record<string, GraphNode>,
): Promise<ResponseGraph> {
  const id = await hashValue(root);
  return { version: "jev-graph-v1", root: id, nodes: { ...nodes, [id]: root } };
}

async function invalid(value: unknown, pattern?: RegExp) {
  const result = await verifyGraph(value);
  assert.equal(result.valid, false);
  assert.equal(
    result.text,
    "",
    "failed verification must not expose partial text",
  );
  assert.ok(result.error);
  if (pattern) assert.match(result.error, pattern);
}

test("canonical JSON sorts object keys recursively and preserves array order", () => {
  assert.equal(
    canonical({ z: [2, { b: true, a: null }], a: "é\n🦆" }),
    '{"a":"é\\n🦆","z":[2,{"a":null,"b":true}]}',
  );
  assert.equal(canonical({ "2": 2, "10": 10 }), '{"10":10,"2":2}');
  assert.notEqual(canonical([1, 2]), canonical([2, 1]));
  const shared = { value: 1 };
  assert.equal(canonical([shared, shared]), '[{"value":1},{"value":1}]');
});

test("canonical JSON rejects values JSON would drop, coerce, or execute", () => {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  let getterRead = false;
  const accessor = Object.defineProperty({}, "secret", {
    enumerable: true,
    get() {
      getterRead = true;
      return "do not read";
    },
  });
  const arrayWithProperty = Object.assign([1], { hidden: "discarded" });
  const values: unknown[] = [
    undefined,
    NaN,
    Infinity,
    -Infinity,
    1n,
    Symbol("x"),
    () => 1,
    { missing: undefined },
    [undefined],
    new Array(1),
    new Date(),
    new Map(),
    new Set(),
    new Uint8Array([1]),
    new Number(1),
    { [Symbol("x")]: 1 },
    accessor,
    arrayWithProperty,
    cycle,
    Object.defineProperty({}, "hidden", { value: 1 }),
  ];
  for (const value of values) assert.throws(() => canonical(value));
  assert.equal(getterRead, false);
});

test("hashing is asynchronous UTF-8 SHA-256 over canonical JSON", async () => {
  const pending = hashValue({ b: 2, a: 1 });
  assert.ok(pending instanceof Promise);
  assert.equal(
    await pending,
    "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
  );
  const value = { text: "Café 🦆 e\u0301 \ud800", nested: [null, 0, false] };
  assert.equal(
    await hashValue(value),
    createHash("sha256").update(canonical(value), "utf8").digest("hex"),
  );
  assert.equal(await hashValue({ a: 1, b: 2 }), await pending);
  await assert.rejects(hashValue(undefined));
});

test("the root renders exact ordered text with declared separators and shared leaves", async () => {
  const parts = [
    { text: "Hello 🦆", provenance: "authored" as const },
    {
      text: "Returns take 14 days.",
      provenance: "source" as const,
      source: "note_1",
    },
    { text: "Hello 🦆", provenance: "authored" as const },
    { text: "Suppose a moon were green.", provenance: "hypothetical" as const },
  ];
  const pending = buildGraph(parts, "\n—\n");
  assert.ok(pending instanceof Promise);
  const graph = await pending;
  const root = graph.nodes[graph.root];
  assert.equal(root.kind, "sequence");
  assert.equal(root.provenance, "composed");
  assert.equal(root.separator, "\n—\n");
  assert.equal(root.children[0], root.children[2]);
  assert.equal(Object.keys(graph.nodes).length, 4);
  for (const [id, node] of Object.entries(graph.nodes)) {
    assert.equal(id, await hashValue(node));
  }
  assert.deepEqual(await verifyGraph(graph), {
    valid: true,
    text: parts.map((part) => part.text).join("\n—\n"),
  });
  assert.equal(canonical(graph), canonical(await buildGraph(parts, "\n—\n")));
});

test("empty text and an empty graph remain explicit integrity-valid documents", async () => {
  assert.deepEqual(await verifyGraph(await buildGraph([])), {
    valid: true,
    text: "",
  });
  assert.deepEqual(
    await verifyGraph(await buildGraph([{ text: "", provenance: "authored" }])),
    { valid: true, text: "" },
  );
});

test("leaf, provenance, root, child order, and separator mutations fail integrity", async () => {
  const original = await buildGraph(
    [
      { text: "First", provenance: "authored" },
      { text: "Second", provenance: "hypothetical" },
    ],
    " ",
  );
  for (const mutate of [
    (g: ResponseGraph) => {
      g.nodes[g.nodes[g.root].children[0]].text = "Altered";
    },
    (g: ResponseGraph) => {
      g.nodes[g.nodes[g.root].children[0]].provenance = "hypothetical";
    },
    (g: ResponseGraph) => {
      g.nodes[g.root].children.reverse();
    },
    (g: ResponseGraph) => {
      g.nodes[g.root].separator = "";
    },
    (g: ResponseGraph) => {
      g.root = "0".repeat(64);
    },
    (g: ResponseGraph) => {
      g.root = g.nodes[g.root].children[0];
    },
  ]) {
    const graph = structuredClone(original);
    mutate(graph);
    await invalid(graph);
  }
});

test("rehashing edited text proves internal consistency, not authorship or factual truth", async () => {
  const graph = await buildGraph([
    { text: "The moon is made of cheese.", provenance: "authored" },
  ]);
  assert.equal((await verifyGraph(graph)).valid, true);
});

test("unknown references, cycles, extra roots, and unreachable nodes are rejected", async () => {
  const graph = await buildGraph([{ text: "First", provenance: "authored" }]);
  const orphan = leaf("orphan");
  await invalid(
    { ...graph, nodes: { ...graph.nodes, [await hashValue(orphan)]: orphan } },
    /unreachable/i,
  );
  await invalid({ ...graph, roots: [graph.root] }, /field/i);
  await invalid(
    await graphWithRoot(
      { ...graph.nodes[graph.root], children: ["0".repeat(64)] },
      {},
    ),
    /reference|child/i,
  );
  const cycle = structuredClone(graph);
  cycle.nodes[cycle.root].children = [cycle.root];
  await invalid(cycle, /cycle/i);
});

test("unknown fields, malformed node kinds, and invalid provenance are rejected even if hashed", async () => {
  const original = await buildGraph([
    { text: "First", provenance: "authored" },
  ]);
  const child = original.nodes[original.root].children[0];
  for (const node of [
    { ...leaf("First"), extra: true },
    { ...leaf("First"), kind: "code" },
    { ...leaf("First"), children: [child] },
    { ...leaf("First"), separator: " " },
    { ...leaf("First"), provenance: "composed" },
    { ...leaf("First"), provenance: "source" },
    { ...leaf("First"), provenance: "source", source: "  " },
    { ...leaf("First"), source: "forged" },
    { ...leaf("First"), text: 3 },
  ]) {
    const id = await hashValue(node);
    await invalid(
      await graphWithRoot(
        {
          kind: "sequence",
          provenance: "composed",
          separator: "",
          children: [id],
        },
        { [id]: node as GraphNode },
      ),
    );
  }
  for (const root of [
    { ...original.nodes[original.root], text: "hidden text" },
    { ...original.nodes[original.root], source: "forged" },
    { ...original.nodes[original.root], provenance: "authored" },
    { kind: "sequence", provenance: "composed", children: [child] },
  ])
    await invalid(
      await graphWithRoot(root as GraphNode, {
        [child]: original.nodes[child],
      }),
    );
  await invalid({ ...original, extra: "secret" });
  await invalid({ ...original, version: "future" });
  await invalid(null);
  await invalid(JSON.stringify(original));
});

test("build rejects invalid source attribution and oversize text without truncation", async () => {
  await assert.rejects(buildGraph([{ text: "source", provenance: "source" }]));
  await assert.rejects(
    buildGraph([{ text: "text", provenance: "authored", source: "forged" }]),
  );
  await assert.rejects(
    buildGraph([{ text: "x".repeat(24001), provenance: "authored" }]),
    /24,000|24000/,
  );
  const exact = await buildGraph([
    { text: "x".repeat(24000), provenance: "authored" },
  ]);
  assert.equal((await verifyGraph(exact)).text.length, 24000);
});

for (const count of [0, 1]) {
  test(`an oversized separator with ${count} parts rejects before hashing`, async (context) => {
    const digest = context.mock.method(globalThis.crypto.subtle, "digest");
    await assert.rejects(
      buildGraph(
        Array.from({ length: count }, () => ({
          text: "Example",
          provenance: "authored" as const,
        })),
        "x".repeat(1_000_000),
      ),
    );
    assert.equal(digest.mock.callCount(), 0);
  });
}

test("render bounds count repeated subgraphs and separators before expanding", async () => {
  const node = leaf("x".repeat(12000));
  const id = await hashValue(node);
  await invalid(
    await graphWithRoot(
      {
        kind: "sequence",
        children: [id, id],
        separator: "!",
        provenance: "composed",
      },
      { [id]: node },
    ),
    /24,000|24000/,
  );
  await assert.rejects(
    buildGraph(
      [
        { text: "x".repeat(12000), provenance: "authored" },
        { text: "x".repeat(12000), provenance: "authored" },
      ],
      "!",
    ),
    /24,000|24000/,
  );
});

test("verification enforces 128 nodes and depth eight including the root", async () => {
  const graph = await buildGraph(
    Array.from({ length: 127 }, (_, i) => ({
      text: `${i}`,
      provenance: "authored" as const,
    })),
  );
  assert.equal(Object.keys(graph.nodes).length, 128);
  assert.equal((await verifyGraph(graph)).valid, true);
  await assert.rejects(
    buildGraph(
      Array.from({ length: 128 }, (_, i) => ({
        text: `${i}`,
        provenance: "authored" as const,
      })),
    ),
    /128/,
  );
  const nodes: Record<string, GraphNode> = {};
  let node = leaf("deep");
  let root = await hashValue(node);
  nodes[root] = node;
  for (let depth = 2; depth <= 9; depth++) {
    node = {
      kind: "sequence",
      children: [root],
      separator: "",
      provenance: "composed",
    };
    root = await hashValue(node);
    nodes[root] = node;
    const result = await verifyGraph({ version: "jev-graph-v1", root, nodes });
    assert.equal(result.valid, depth <= 8);
    if (depth === 9) assert.match(result.error!, /depth|eight|8/i);
  }
});

test("a shared subtree cached on a shallow path still rejects a later path beyond depth eight", async () => {
  const node = leaf("shared");
  const id = await hashValue(node);
  const shared: GraphNode = {
    kind: "sequence",
    children: [id],
    separator: "",
    provenance: "composed",
  };
  const sharedId = await hashValue(shared);
  const nodes: Record<string, GraphNode> = { [id]: node, [sharedId]: shared };
  let child = sharedId;
  for (let wrappers = 1; wrappers <= 6; wrappers++) {
    const wrapper: GraphNode = {
      kind: "sequence",
      children: [child],
      separator: "",
      provenance: "composed",
    };
    child = await hashValue(wrapper);
    nodes[child] = wrapper;
    if (wrappers < 5) continue;
    const graph = await graphWithRoot(
      { ...shared, children: [sharedId, child] },
      nodes,
    );
    if (wrappers === 5) {
      assert.deepEqual(await verifyGraph(graph), {
        valid: true,
        text: "sharedshared",
      });
    } else {
      await invalid(graph, /depth 8/i);
    }
  }
});

test("serialized graph input is bounded in UTF-8 bytes", async () => {
  const graph = await buildGraph([
    { text: "é", provenance: "source", source: "note_1" },
  ]);
  const id = graph.nodes[graph.root].children[0];
  graph.nodes[id].source = "🦆".repeat(33000);
  assert.ok(canonical(graph).length < 128 * 1024);
  assert.ok(new TextEncoder().encode(canonical(graph)).length > 128 * 1024);
  await invalid(graph, /128|size|bytes/i);
});

test("verification snapshots the input before asynchronous hashing", async () => {
  const graph = await buildGraph([
    { text: "Original", provenance: "authored" },
  ]);
  const pending = verifyGraph(graph);
  graph.nodes[graph.nodes[graph.root].children[0]].text =
    "Changed while hashing";
  assert.deepEqual(await pending, { valid: true, text: "Original" });
});

test("validation errors do not disclose content from hostile objects", async () => {
  const marker = "private source data";
  const hostile = new Proxy(
    {},
    {
      ownKeys() {
        throw new Error(marker);
      },
    },
  );
  const result = await verifyGraph(hostile);
  assert.equal(result.valid, false);
  assert.equal(result.text, "");
  assert.ok(!result.error?.includes(marker));
});
