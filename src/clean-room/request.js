export function endpointMatches(endpoint, url, method = endpoint.method) {
  const path = new URL(url, "http://target").pathname;
  const pattern = endpoint.path
    .split("/")
    .map((p) =>
      /^\{[^}]+\}$/.test(p)
        ? "[^/]+"
        : p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("/");
  return endpoint.method === method && new RegExp(`^${pattern}$`).test(path);
}
export function readField(value, path, prefix = "") {
  if (prefix && path.startsWith(prefix + "."))
    path = path.slice(prefix.length + 1);
  if (path === "[]") return value;
  return path
    .replace(/^\[\]\.?/, "")
    .replace(/\[\]/g, "")
    .split(".")
    .filter(Boolean)
    .reduce((v, k) => v?.[k], value);
}
function put(object, path, value) {
  const parts = path.split(".");
  let current = object;
  for (const part of parts.slice(0, -1)) {
    if (["__proto__", "constructor", "prototype"].includes(part))
      throw Error("Invalid field path");
    current = current[part] ??= {};
  }
  const last = parts.at(-1);
  if (["__proto__", "constructor", "prototype"].includes(last))
    throw Error("Invalid field path");
  current[last] = value;
}
function leaves(schema, prefix = "") {
  if (schema.properties)
    return Object.entries(schema.properties).flatMap(([key, s]) =>
      leaves(s, prefix ? `${prefix}.${key}` : key),
    );
  return prefix ? [prefix] : [];
}
export function buildRequest(
  endpoint,
  nodes,
  values,
  results,
  edges,
  observed,
) {
  const sample = observed.find((t) =>
    endpointMatches(endpoint, t.url, t.method),
  );
  function input(name) {
    const matching = nodes.filter(
      (n) => n.field === `req:${endpoint.id}:${name}`,
    );
    if (matching.some((n) => n.attrs?.type === "radio")) {
      const selected = matching.find((n) =>
        values.has(n.id) ? values.get(n.id) : n.checked,
      );
      return selected?.value;
    }
    const node = matching[0];
    if (node)
      return values.has(node.id)
        ? values.get(node.id)
        : node.checked !== undefined
          ? node.checked
          : node.value;
    const candidates = edges.filter(
      (e) => e.to === endpoint.id && e.input === name && results.has(e.from),
    );
    if (candidates.length > 1)
      throw Error(`Ambiguous relationship input ${name}`);
    if (candidates.length) {
      const edge = candidates[0];
      let data = results.get(edge.from);
      if (Array.isArray(data)) {
        if (data.length !== 1)
          throw Error(`Ambiguous relationship input ${name}`);
        data = data[0];
      }
      return readField(data, edge.output);
    }
    if (sample) {
      const url = new URL(sample.url);
      const parts = endpoint.path.split("/"),
        index = parts.indexOf(`{${name}}`);
      if (index >= 0) return decodeURIComponent(url.pathname.split("/")[index]);
      if (url.searchParams.has(name)) return url.searchParams.get(name);
    }
    return undefined;
  }
  let target = endpoint.path;
  const query = new URLSearchParams(),
    body = {};
  for (const p of endpoint.parameters) {
    const value = input(p.name);
    if ((value === undefined || value === "") && p.required)
      throw Error(`Missing ${p.in} variable ${p.name}`);
    if (value === undefined || value === "") continue;
    if (p.in === "path")
      target = target.replace(`{${p.name}}`, encodeURIComponent(String(value)));
    else if (p.in === "query") query.set(p.name, String(value));
    else
      throw Error(
        `Unsupported parameter location ${p.in}; manual review required.`,
      );
  }
  const names = new Set([
    ...leaves(endpoint.requestSchema),
    ...nodes
      .filter((n) => n.field?.startsWith(`req:${endpoint.id}:`))
      .map((n) => n.field.split(":")[2]),
  ]);
  for (const name of names) {
    if (endpoint.parameters.some((p) => p.name === name)) continue;
    const value = input(name),
      schema = name
        .split(".")
        .reduce((s, k) => s?.properties?.[k], endpoint.requestSchema);
    if (value !== undefined)
      put(
        body,
        name,
        ["number", "integer"].includes(schema?.type)
          ? Number(value)
          : schema?.type === "boolean"
            ? value === true || value === "true"
            : value,
      );
  }
  for (const name of endpoint.requestSchema.required || [])
    if (body[name] === undefined)
      throw Error(`Missing required body field ${name}`);
  if (target.includes("{")) throw Error("Unresolved endpoint path variable");
  if (query.size) target += "?" + query;
  return {
    target,
    body: !["GET", "HEAD"].includes(endpoint.method)
      ? JSON.stringify(body)
      : undefined,
  };
}
