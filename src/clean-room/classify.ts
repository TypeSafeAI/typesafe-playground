import { createHash } from "node:crypto";
import {
  fields,
  flatten,
  type Edge,
  type Endpoint,
  type Node,
  type Screen,
} from "./contracts";
import { AuditModels } from "./models";
const criteria = (items: string[]) =>
  Object.fromEntries(items.map((x) => [x, x]));
export async function classifyEndpoints(
  endpoints: Endpoint[],
  audit: AuditModels,
) {
  for (const endpoint of endpoints) {
    const choice = await audit.choose(
      "endpoints",
      { task: "endpoint", endpoint },
      {
        category: {
          instructions: "Classify this endpoint functionality.",
          criteria: criteria([
            "auth",
            "list",
            "search",
            "create",
            "read",
            "update",
            "delete",
            "upload",
            "other",
          ]),
        },
        auth: {
          instructions:
            "Classify authentication requirements from evidence. Unknown when not documented.",
          criteria: criteria(["required", "none", "unknown"]),
        },
        requestShape: {
          instructions: "Classify request shape.",
          criteria: criteria(["empty", "object", "array", "scalar", "unknown"]),
        },
        responseShape: {
          instructions: "Classify response shape.",
          criteria: criteria(["empty", "object", "array", "scalar", "unknown"]),
        },
      },
    );
    Object.assign(endpoint, choice);
  }
  const edges: Edge[] = [];
  for (const from of endpoints)
    for (const to of endpoints) {
      if (from.id === to.id) continue;
      const outputs = fields(from.responseSchema);
      if (!outputs.length) continue;
      for (const input of new Set([
        ...to.parameters.map((p) => p.name),
        ...fields(to.requestSchema),
      ])) {
        const candidates = Object.fromEntries(
          outputs.map((output, index) => [
            `r${index}`,
            { from: from.id, to: to.id, output, input },
          ]),
        );
        const result = await audit.choose(
          "relationships",
          { task: "relationship", from, to, candidates },
          {
            relationship: {
              instructions: `Which output supplies the input ${input}? Names may differ (id can supply ownerId). Choose none without evidence of an actual dependency.`,
              criteria: {
                none: "No evidenced relationship",
                ...Object.fromEntries(
                  Object.entries(candidates).map(([id, edge]) => [
                    id,
                    `${edge.output} feeds ${edge.input}`,
                  ]),
                ),
              },
            },
          },
        );
        if (result.relationship !== "none")
          edges.push(candidates[result.relationship]);
      }
    }
  return edges;
}
export function componentSignature(node: Node) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        tag: node.tag,
        role: node.role,
        kind: node.kind,
        type: node.attrs.type || null,
        style: node.style,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}
export async function mapScreens(
  screens: Screen[],
  endpoints: Endpoint[],
  audit: AuditModels,
) {
  for (const screen of screens)
    for (const node of flatten(screen.root)) {
      const bindings: Record<string, string> = { none: "No endpoint binding" };
      for (const e of endpoints)
        bindings[e.id] = `${e.method} ${e.path}: ${e.category}`;
      const fieldOptions: Record<string, string> = { none: "No data field" };
      for (const e of endpoints) {
        for (const f of [
          ...e.parameters.map((p) => p.name),
          ...fields(e.requestSchema),
        ])
          fieldOptions[`req:${e.id}:${f}`] = `Request ${e.id} field ${f}`;
        for (const f of fields(e.responseSchema))
          fieldOptions[`res:${e.id}:${f}`] = `Response ${e.id} field ${f}`;
        if (e.responseSchema.type === "array")
          fieldOptions[`res:${e.id}:[]`] = `Response ${e.id} root list`;
        for (const [name, s] of Object.entries(
          e.responseSchema.properties || {},
        ))
          if (s.type === "array")
            fieldOptions[`res:${e.id}:${name}[]`] =
              `Response ${e.id} list ${name}`;
      }
      const choice = await audit.choose(
        "layout",
        {
          task: "element",
          screen: screen.id,
          node: {
            ...node,
            children: node.children.map((c) => ({
              tag: c.tag,
              role: c.role,
              text: c.text,
            })),
          },
          observedNetwork: screen.network,
          endpoints: endpoints.map(({ id, method, path, category }) => ({
            id,
            method,
            path,
            category,
          })),
        },
        {
          kind: {
            instructions:
              "Classify this observed element. A list renderer is the container of repeating API records. Containers preserve structure; static includes response-bound text.",
            criteria: criteria([
              "container",
              "static",
              "input",
              "action",
              "list",
              "navigation",
            ]),
          },
          endpoint: {
            instructions:
              "Bind only when observed evidence supports an endpoint. Inputs bind the endpoint they supply; list and response text bind the read endpoint; action binds its submit endpoint.",
            criteria: bindings,
          },
          field: {
            instructions:
              "Select the data field for an input, a response value, or list array. none for buttons and structure.",
            criteria: fieldOptions,
          },
        },
      );
      Object.assign(node, choice);
      if (
        choice.field !== "none" &&
        choice.field.split(":")[1] !== choice.endpoint
      )
        throw Error(`Inconsistent field binding on ${screen.id}/${node.id}.`);
    }
}
export async function generateComponents(
  screens: Screen[],
  audit: AuditModels,
) {
  const components: Record<string, string> = {},
    signatures = new Map<string, string>();
  for (const screen of screens)
    for (const node of flatten(screen.root)) {
      const signature = componentSignature(node),
        existing = signatures.get(signature);
      const choice = await audit.choose(
        "generation-gate",
        {
          task: "generation",
          node: {
            ...node,
            children: node.children.map((c) => ({ tag: c.tag, role: c.role })),
          },
          existingComponent: existing ?? null,
        },
        {
          decision: {
            instructions:
              "Use BUILTIN for ordinary semantic HTML nodes that deterministic rendering supports. EMIT_TEMPLATE to emit a reusable local template from the observed element. REUSE an existing structurally equivalent definition instead of generating it again.",
            criteria: existing
              ? {
                  REUSE: "Reuse existing equivalent definition",
                  BUILTIN: "Use deterministic semantic renderer",
                }
              : {
                  BUILTIN: "Use deterministic semantic renderer",
                  EMIT_TEMPLATE:
                    "Emit one reusable component using the local deterministic template",
                },
          },
        },
      );
      if (choice.decision === "REUSE") {
        node.component = existing;
        continue;
      }
      if (choice.decision === "BUILTIN") {
        node.component = "builtin";
        signatures.set(signature, "builtin");
        continue;
      }
      const id = `component-${signature}`;
      components[id] = await audit.generate({
        tag: node.tag,
        role: node.role,
        kind: node.kind,
        attrs: node.attrs,
        style: node.style,
        text: node.text,
        value: node.value,
      });
      node.component = id;
      signatures.set(signature, id);
    }
  return components;
}
