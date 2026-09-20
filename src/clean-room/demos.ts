import type { ModelAdapters } from "./models";
import type { Node, Endpoint } from "./contracts";
import { demoConfigs, demoExamples } from "./examples";
export { startDemoTarget } from "./demo-target";
export const demos = {
  catalog: { ...demoExamples[0], config: demoConfigs.catalog },
  contacts: { ...demoExamples[1], config: demoConfigs.contacts },
  support: { ...demoExamples[2], config: demoConfigs.support },
};
/** Explicit test/demo adapter, never used as a fallback for live model failures. */
export function demoAdapters(): ModelAdapters {
  return {
    mode: "mock",
    jev: async (payload) => {
      const state = payload.state as any;
      let choices: Record<string, string> = {};
      if (state.task === "endpoint") {
        const e = state.endpoint as Endpoint;
        choices = {
          category:
            e.method === "GET"
              ? e.parameters.some((p) => p.in === "query")
                ? "search"
                : "list"
              : e.method === "POST"
                ? "create"
                : e.method === "DELETE"
                  ? "delete"
                  : "update",
          auth: e.authEvidence,
          requestShape: e.requestSchema.type || "empty",
          responseShape: e.responseSchema.type || "empty",
        };
      } else if (state.task === "relationship")
        choices = { relationship: "none" };
      else if (state.task === "generation")
        choices = {
          decision: state.existingComponent
            ? "REUSE"
            : state.node.role === "listitem"
              ? "EMIT_TEMPLATE"
              : "BUILTIN",
        };
      else if (state.task === "element") {
        const node = state.node as Node,
          endpoints = state.endpoints as Endpoint[];
        let kind = ["input", "textarea", "select"].includes(node.tag)
          ? "input"
          : node.role === "button"
            ? "action"
            : node.role === "list"
              ? "list"
              : node.role === "link"
                ? "navigation"
                : node.children.length
                  ? "container"
                  : "static";
        let endpoint = "none",
          field = "none";
        const endpointFor = (method: string) =>
          endpoints.find((e) => e.method === method)?.id || "none";
        if (kind === "list") {
          endpoint = endpointFor("GET");
          field = `res:${endpoint}:[]`;
        }
        if (kind === "action")
          endpoint = endpointFor(
            node.text === "Search"
              ? "GET"
              : node.text.startsWith("Update")
                ? "PATCH"
                : node.text.startsWith("Delete")
                  ? "DELETE"
                  : "POST",
          );
        if (kind === "input") {
          endpoint = endpointFor(
            node.label.startsWith("Update")
              ? "PATCH"
              : node.label.startsWith("Delete")
                ? "DELETE"
                : node.attrs.name === "q"
                  ? "GET"
                  : "POST",
          );
          field = `req:${endpoint}:${node.attrs.name}`;
        }
        if (node.attrs.id === "confirmation") {
          endpoint = endpointFor("POST");
          field = `res:${endpoint}:ticket`;
        }
        if (kind === "static" && node.tag === "span")
          for (const trace of state.observedNetwork) {
            if (!Array.isArray(trace.response)) continue;
            for (const row of trace.response)
              for (const [key, value] of Object.entries(row))
                if (String(value) === node.text) {
                  endpoint = endpointFor("GET");
                  field = `res:${endpoint}:[].${key}`;
                }
          }
        choices = { kind, endpoint, field };
      }
      return {
        answers: Object.fromEntries(
          Object.entries(payload.questions).map(([id, q]) => {
            const choice = choices[id];
            if (!choice || !Object.hasOwn(q.criteria || {}, choice))
              throw Error(`Demo adapter has no closed choice ${id}=${choice}`);
            return [
              id,
              {
                type: "choice",
                choice,
                confidence: 1,
                probabilities: { [choice]: 1 },
              },
            ];
          }),
        ),
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    },
  };
}
