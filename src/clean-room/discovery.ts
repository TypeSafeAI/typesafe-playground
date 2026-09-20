import type { Endpoint, Schema, Trace } from "./contracts";
const record = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, any>)
    : {};
export function inferSchema(value: unknown): Schema {
  if (value === null || value === undefined) return {};
  if (Array.isArray(value))
    return { type: "array", items: inferSchema(value[0]) };
  if (typeof value === "object")
    return {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, inferSchema(v)]),
      ),
    };
  return { type: typeof value };
}
function resolve(
  value: unknown,
  root: Record<string, any>,
  seen: string[] = [],
): any {
  if (Array.isArray(value)) return value.map((v) => resolve(v, root, seen));
  if (!value || typeof value !== "object") return value;
  const obj = record(value);
  if (typeof obj.$ref === "string") {
    if (!obj.$ref.startsWith("#/"))
      throw Error(`External OpenAPI references must be bundled: ${obj.$ref}`);
    if (seen.includes(obj.$ref)) return { $ref: obj.$ref };
    const target = obj.$ref
      .slice(2)
      .split("/")
      .reduce(
        (v: any, k: string) => v?.[k.replace(/~1/g, "/").replace(/~0/g, "~")],
        root,
      );
    if (!target) throw Error(`Unresolved OpenAPI reference: ${obj.$ref}`);
    return resolve(target, root, [...seen, obj.$ref]);
  }
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, resolve(v, root, seen)]),
  );
}
export function matchEndpoint(
  method: string,
  url: string,
  endpoints: Endpoint[],
) {
  const path = new URL(url, "http://target").pathname;
  return endpoints
    .filter((e) => e.method === method)
    .sort((a, b) => (a.path.includes("{") ? 1 : b.path.includes("{") ? -1 : 0))
    .find((e) => {
      const pattern = e.path
        .split("/")
        .map((p) =>
          /^\{[^}]+\}$/.test(p)
            ? "[^/]+"
            : p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        )
        .join("/");
      return new RegExp(`^${pattern}$`).test(path);
    });
}
export function discoverEndpoints(
  document: unknown,
  traces: Trace[],
): Endpoint[] {
  const root = record(document),
    endpoints: Endpoint[] = [];
  const jsonSchema = (v: any) =>
    record(v?.content?.["application/json"]?.schema);
  for (const [path, raw] of Object.entries(record(root.paths))) {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))
      throw Error("Invalid OpenAPI endpoint path.");
    const item = resolve(raw, root);
    for (const method of [
      "get",
      "post",
      "put",
      "patch",
      "delete",
      "head",
      "options",
    ]) {
      if (!item[method]) continue;
      const operation = item[method];
      const parameters = new Map<string, any>();
      for (const p of [
        ...(item.parameters || []),
        ...(operation.parameters || []),
      ])
        parameters.set(`${p.in}:${p.name}`, p);
      const success = Object.entries(record(operation.responses)).find(
        ([status]) => /^2\d\d$/.test(status),
      )?.[1];
      const security = operation.security ?? root.security;
      endpoints.push({
        id: `e${endpoints.length}`,
        method: method.toUpperCase(),
        path,
        summary: operation.summary || operation.operationId || "",
        parameters: [...parameters.values()].map((p) => ({
          name: p.name,
          in: p.in,
          required: !!p.required,
          schema: record(p.schema),
        })),
        requestSchema: jsonSchema(operation.requestBody),
        responseSchema: jsonSchema(success),
        authEvidence:
          security === undefined
            ? "unknown"
            : security.length
              ? "required"
              : "none",
        source: ["openapi"],
      });
    }
  }
  for (const trace of traces) {
    const url = new URL(trace.url);
    let endpoint = matchEndpoint(trace.method, url.href, endpoints);
    if (!endpoint) {
      endpoint = {
        id: `e${endpoints.length}`,
        method: trace.method,
        path: url.pathname,
        summary: "Observed browser request",
        parameters: [],
        requestSchema: inferSchema(trace.request),
        responseSchema: inferSchema(trace.response),
        authEvidence: "unknown",
        source: ["network"],
      };
      endpoints.push(endpoint);
    } else {
      if (!endpoint.source.includes("network")) endpoint.source.push("network");
      if (!Object.keys(endpoint.requestSchema).length)
        endpoint.requestSchema = inferSchema(trace.request);
      if (!Object.keys(endpoint.responseSchema).length)
        endpoint.responseSchema = inferSchema(trace.response);
    }
    for (const key of url.searchParams.keys())
      if (!endpoint.parameters.some((p) => p.name === key && p.in === "query"))
        endpoint.parameters.push({
          name: key,
          in: "query",
          required: false,
          schema: { type: "string" },
        });
  }
  return endpoints;
}
