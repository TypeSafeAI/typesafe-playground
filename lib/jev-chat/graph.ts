/**
 * A portable, ordered response DAG. SHA-256 checks internal content integrity;
 * it does not establish factual truth, source authenticity, or author identity.
 * Anyone can edit a document and compute a new internally consistent graph.
 */
import type { ExcerptSpan } from "./source-excerpts";
export type GraphNode = {
  kind: "text" | "sequence";
  text?: string;
  children: string[];
  separator?: string;
  provenance: "authored" | "source" | "hypothetical" | "composed";
  source?: string;
  excerpt?: ExcerptSpan;
};

export type ResponseGraph = {
  version: "jev-graph-v1";
  root: string;
  nodes: Record<string, GraphNode>;
};

type Part = {
  text: string;
  provenance: "authored" | "source" | "hypothetical";
  source?: string;
  excerpt?: ExcerptSpan;
};

const MAX_NODES = 128;
const MAX_DEPTH = 8;
const MAX_TEXT = 24_000;
const MAX_BYTES = 128 * 1024;
const encoder = new TextEncoder();
const hashPattern = /^[a-f0-9]{64}$/;

class GraphError extends Error {}

function requireGraph(condition: unknown, message: string): asserts condition {
  if (!condition) throw new GraphError(message);
}

type Frame =
  { value: unknown; depth: number } | { literal: string } | { leave: object };

/** JSON without lossy coercions, user-defined serializers, or recursive calls. */
function serialize(
  value: unknown,
  maxBytes = Infinity,
  maxDepth = Infinity,
): string {
  const stack: Frame[] = [{ value, depth: 0 }];
  const active = new WeakSet<object>();
  const chunks: string[] = [];
  let bytes = 0;
  function append(text: string) {
    if (maxBytes !== Infinity) {
      requireGraph(
        text.length <= maxBytes - bytes,
        "Serialized graph exceeds 128 KB.",
      );
      bytes += encoder.encode(text).length;
      requireGraph(bytes <= maxBytes, "Serialized graph exceeds 128 KB.");
    }
    chunks.push(text);
  }
  function quote(text: string) {
    requireGraph(text.length <= maxBytes, "Serialized graph exceeds 128 KB.");
    return JSON.stringify(text);
  }
  while (stack.length) {
    const frame = stack.pop()!;
    if ("literal" in frame) {
      append(frame.literal);
      continue;
    }
    if ("leave" in frame) {
      active.delete(frame.leave);
      continue;
    }
    const item = frame.value;
    requireGraph(
      frame.depth <= maxDepth,
      "Serialized graph nesting exceeds the limit.",
    );
    if (item === null || typeof item === "boolean") {
      append(JSON.stringify(item));
    } else if (typeof item === "string") {
      append(quote(item));
    } else if (typeof item === "number") {
      requireGraph(
        Number.isFinite(item),
        "Canonical JSON requires finite numbers.",
      );
      append(JSON.stringify(item));
    } else {
      requireGraph(
        typeof item === "object",
        "Canonical JSON requires JSON values.",
      );
      const array = Array.isArray(item);
      const prototype = Object.getPrototypeOf(item);
      requireGraph(
        array
          ? prototype === Array.prototype
          : prototype === Object.prototype || prototype === null,
        "Canonical JSON requires plain objects and arrays.",
      );
      requireGraph(!active.has(item), "Canonical JSON cannot contain cycles.");
      active.add(item);
      const keys = Reflect.ownKeys(item);
      requireGraph(keys.length <= maxBytes, "Serialized graph exceeds 128 KB.");
      requireGraph(
        keys.every((key) => typeof key === "string"),
        "Canonical JSON cannot contain symbol keys.",
      );
      const descriptors = Object.getOwnPropertyDescriptors(item);
      const length = array ? (descriptors.length.value as number) : 0;
      requireGraph(
        !array || keys.length === length + 1,
        "Canonical JSON requires dense arrays without extra properties.",
      );
      const names = array
        ? Array.from({ length }, (_, index) => String(index))
        : (keys as string[]).sort();
      stack.push({ leave: item }, { literal: array ? "]" : "}" });
      for (let index = names.length - 1; index >= 0; index--) {
        const key = names[index];
        const descriptor = descriptors[key];
        requireGraph(
          descriptor &&
            Object.hasOwn(descriptor, "value") &&
            descriptor.enumerable,
          "Canonical JSON requires enumerable data properties.",
        );
        stack.push({ value: descriptor.value, depth: frame.depth + 1 });
        if (!array) stack.push({ literal: ":" }, { literal: quote(key) });
        if (index > 0) stack.push({ literal: "," });
      }
      append(array ? "[" : "{");
    }
  }
  return chunks.join("");
}

/** Stable JSON with lexically sorted object keys and unchanged array order. */
export function canonical(value: unknown): string {
  return serialize(value);
}

/** Browser/Node Web Crypto SHA-256 of canonical JSON encoded as UTF-8. */
export async function hashValue(value: unknown): Promise<string> {
  requireGraph(globalThis.crypto?.subtle, "Web Crypto SHA-256 is unavailable.");
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    encoder.encode(canonical(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fields(value: Record<string, unknown>, allowed: string[]) {
  requireGraph(
    Object.keys(value).every((key) => allowed.includes(key)),
    "Graph contains an unknown field.",
  );
}

function validateNode(value: unknown): asserts value is GraphNode {
  requireGraph(record(value), "Graph node must be an object.");
  requireGraph(Array.isArray(value.children), "Graph node requires children.");
  requireGraph(
    value.children.every(
      (child) => typeof child === "string" && hashPattern.test(child),
    ),
    "Graph contains an invalid child reference.",
  );
  if (value.kind === "text") {
    fields(value, [
      "kind",
      "text",
      "children",
      "provenance",
      "source",
      "excerpt",
    ]);
    requireGraph(typeof value.text === "string", "Text node requires text.");
    requireGraph(
      value.text.length <= MAX_TEXT,
      "Rendered graph exceeds 24,000 characters.",
    );
    requireGraph(
      value.children.length === 0,
      "Text nodes cannot have children.",
    );
    requireGraph(
      ["authored", "source", "hypothetical"].includes(
        value.provenance as string,
      ),
      "Text node has invalid provenance.",
    );
    if (value.provenance === "source") {
      requireGraph(
        typeof value.source === "string" && value.source.trim().length > 0,
        "Source text requires a nonempty source ID.",
      );
      if (Object.hasOwn(value, "excerpt")) {
        requireGraph(record(value.excerpt), "Source excerpt requires offsets.");
        fields(value.excerpt, ["start", "end"]);
        const { start, end } = value.excerpt;
        requireGraph(
          typeof start === "number" &&
            typeof end === "number" &&
            Number.isSafeInteger(start) &&
            Number.isSafeInteger(end) &&
            start >= 0 &&
            end > start &&
            end <= MAX_TEXT &&
            end - start === value.text.length,
          "Source excerpt has invalid offsets.",
        );
      }
    } else {
      requireGraph(
        !Object.hasOwn(value, "source") && !Object.hasOwn(value, "excerpt"),
        "Only source text may declare a source ID or excerpt.",
      );
    }
  } else {
    requireGraph(value.kind === "sequence", "Graph node has an invalid kind.");
    fields(value, ["kind", "children", "separator", "provenance"]);
    requireGraph(
      value.provenance === "composed",
      "Sequence nodes require composed provenance.",
    );
    requireGraph(
      typeof value.separator === "string",
      "Sequence node requires a declared separator.",
    );
    requireGraph(
      value.separator.length <= MAX_TEXT,
      "Rendered graph exceeds 24,000 characters.",
    );
  }
}

/**
 * Verify an object (parse serialized imports before calling). Limits are 128
 * nodes, eight nodes per path including the root, 24,000 UTF-16 text units, and
 * 128 KiB of canonical UTF-8 input. Repeated child references preserve repetition.
 * Empty documents can be integrity-valid; this makes no completeness claim.
 */
export async function verifyGraph(
  value: unknown,
): Promise<{ valid: boolean; text: string; error?: string }> {
  try {
    // Detach before the first await: caller edits during hashing cannot change
    // the document that is checked or the text returned for that document.
    const graph: unknown = JSON.parse(serialize(value, MAX_BYTES, 16));
    requireGraph(record(graph), "Graph must be an object.");
    fields(graph, ["version", "root", "nodes"]);
    requireGraph(
      graph.version === "jev-graph-v1",
      "Graph version is unsupported.",
    );
    requireGraph(
      typeof graph.root === "string" && hashPattern.test(graph.root),
      "Graph root is invalid.",
    );
    requireGraph(record(graph.nodes), "Graph requires a node map.");
    const entries = Object.entries(graph.nodes);
    requireGraph(
      entries.length > 0 && entries.length <= MAX_NODES,
      "Graph requires between 1 and 128 nodes.",
    );
    for (const [id, node] of entries) {
      requireGraph(hashPattern.test(id), "Graph node address is invalid.");
      validateNode(node);
    }
    const nodes = graph.nodes as Record<string, GraphNode>;
    requireGraph(
      Object.hasOwn(nodes, graph.root),
      "Graph root reference is unknown.",
    );
    requireGraph(
      nodes[graph.root].kind === "sequence",
      "Graph root must be a sequence.",
    );
    const active = new Set<string>();
    const rendered = new Map<string, { text: string; height: number }>();
    function render(
      id: string,
      depth: number,
    ): { text: string; height: number } {
      requireGraph(depth <= MAX_DEPTH, "Graph exceeds depth 8.");
      requireGraph(!active.has(id), "Graph contains a cycle.");
      requireGraph(
        Object.hasOwn(nodes, id),
        "Graph contains an unknown child reference.",
      );
      const cached = rendered.get(id);
      if (cached) return cached;
      active.add(id);
      const node = nodes[id];
      let text: string;
      let height = 1;
      if (node.kind === "text") {
        text = node.text!;
      } else {
        const children = node.children.map((child) => render(child, depth + 1));
        let length = Math.max(0, children.length - 1) * node.separator!.length;
        for (const child of children) {
          length += child.text.length;
          height = Math.max(height, child.height + 1);
        }
        requireGraph(
          length <= MAX_TEXT,
          "Rendered graph exceeds 24,000 characters.",
        );
        text = children.map((child) => child.text).join(node.separator);
      }
      requireGraph(height <= MAX_DEPTH, "Graph exceeds depth 8.");
      active.delete(id);
      const result = { text, height };
      rendered.set(id, result);
      return result;
    }
    const result = render(graph.root, 1);
    requireGraph(
      rendered.size === entries.length,
      "Graph contains unreachable nodes.",
    );
    const hashes = await Promise.all(
      entries.map(([, node]) => hashValue(node)),
    );
    requireGraph(
      hashes.every((hash, index) => hash === entries[index][0]),
      "Graph node integrity check failed.",
    );
    return { valid: true, text: result.text };
  } catch (error) {
    return {
      valid: false,
      text: "",
      error:
        error instanceof GraphError
          ? error.message
          : "Graph verification failed.",
    };
  }
}

/** Build a sequence, sharing identical leaves without changing their order. */
export async function buildGraph(
  parts: Part[],
  separator = "\n\n",
): Promise<ResponseGraph> {
  requireGraph(
    typeof separator === "string",
    "Sequence node requires a declared separator.",
  );
  requireGraph(
    separator.length <= MAX_TEXT,
    "Graph separator exceeds 24,000 characters.",
  );
  const snapshot: unknown = JSON.parse(serialize(parts, MAX_BYTES, 16));
  requireGraph(Array.isArray(snapshot), "Graph parts must be an array.");
  const nodes: Record<string, GraphNode> = {};
  const children: string[] = [];
  let length = Math.max(0, snapshot.length - 1) * separator.length;
  for (const part of snapshot) {
    requireGraph(record(part), "Graph part must be an object.");
    fields(part, ["text", "provenance", "source", "excerpt"]);
    const node = { kind: "text", ...part, children: [] };
    validateNode(node);
    length += node.text!.length;
    requireGraph(
      length <= MAX_TEXT,
      "Rendered graph exceeds 24,000 characters.",
    );
    const id = await hashValue(node);
    nodes[id] = node;
    requireGraph(
      Object.keys(nodes).length < MAX_NODES,
      "Graph exceeds 128 nodes.",
    );
    children.push(id);
  }
  const node: GraphNode = {
    kind: "sequence",
    children,
    separator,
    provenance: "composed",
  };
  const root = await hashValue(node);
  nodes[root] = node;
  const graph: ResponseGraph = { version: "jev-graph-v1", root, nodes };
  const verified = await verifyGraph(graph);
  requireGraph(verified.valid, verified.error ?? "Graph construction failed.");
  return graph;
}
