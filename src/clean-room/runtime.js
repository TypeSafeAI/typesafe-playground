import { manifest } from "./manifest.js";
import { buildRequest, endpointMatches, readField } from "./request.js";
const results = new Map(),
  values = new Map();
const screen =
  manifest.screens.find(
    (s) => s.path === location.pathname + location.search,
  ) || manifest.screens.find((s) => s.path === location.pathname);
if (!screen) throw Error("No captured screen for this path.");
document.title = screen.title;
const all = (node) => [node, ...node.children.flatMap(all)];
const nodes = all(screen.root);
function builtin(node) {
  const tag =
    /^[a-z][a-z0-9-]*$/.test(node.tag) &&
    !["script", "iframe", "object", "embed", "link", "meta", "style"].includes(
      node.tag,
    )
      ? node.tag
      : "div";
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(node.attrs))
    if (
      !/^on/i.test(key) &&
      key !== "style" &&
      !["srcdoc", "formaction"].includes(key)
    ) {
      if (
        ["href", "src"].includes(key) &&
        /^\s*(javascript|data):/i.test(value)
      )
        continue;
      el.setAttribute(key, value);
    }
  for (const [key, value] of Object.entries(node.style))
    el.style.setProperty(key, value);
  el.textContent = node.text;
  return el;
}
function render(node, row, prefix = "") {
  const el = builtin(
    node.presentation ? { ...node, ...node.presentation } : node,
  );
  el.dataset.cleanNode = node.id;
  if (node.field?.startsWith("res:")) {
    const [, endpoint, field] = node.field.split(":");
    const value = readField(
      row ?? results.get(endpoint),
      field,
      row === undefined ? "" : prefix,
    );
    if (node.kind === "list" && Array.isArray(value)) {
      el.replaceChildren();
      const template = node.children[0];
      if (template)
        for (const item of value) el.append(render(template, item, field));
    } else {
      if (
        value !== undefined &&
        value !== null &&
        !Array.isArray(value) &&
        typeof value !== "object"
      )
        el.textContent = String(value);
      for (const child of node.children) el.append(render(child, row, prefix));
    }
  } else
    for (const child of node.children) el.append(render(child, row, prefix));
  if (node.kind === "input") {
    if (["checkbox", "radio"].includes(el.type))
      el.checked = values.has(node.id) ? values.get(node.id) : !!node.checked;
    else el.value = values.has(node.id) ? values.get(node.id) : node.value;
    const remember = () => {
      if (el.type === "radio") {
        for (const peer of nodes.filter(
          (n) => n.attrs.type === "radio" && n.field === node.field,
        ))
          values.set(peer.id, peer.id === node.id && el.checked);
      } else
        values.set(node.id, el.type === "checkbox" ? el.checked : el.value);
    };
    el.addEventListener("input", remember);
    el.addEventListener("change", remember);
  }
  if (node.tag === "form")
    el.addEventListener("submit", (event) => event.preventDefault());
  if (node.kind === "action" && node.endpoint !== "none")
    el.addEventListener("click", (event) => {
      event.preventDefault();
      if (el.form && !el.form.reportValidity()) return;
      execute(node.endpoint).catch(report);
    });
  return el;
}
function repaint() {
  const root = render(screen.root);
  if (root.tagName === "BODY")
    document.documentElement.replaceChild(root, document.body);
  else document.body.replaceChildren(root);
}
function report(error) {
  console.error(error);
  let region = document.getElementById("clean-room-error");
  if (!region) {
    region = document.createElement("p");
    region.id = "clean-room-error";
    region.setAttribute("role", "alert");
    document.body.append(region);
  }
  region.textContent = error.message;
}
async function execute(id, refresh = true) {
  const endpoint = manifest.endpoints.find((e) => e.id === id);
  if (!endpoint) throw Error("Unknown endpoint binding");
  const { target, body } = buildRequest(
    endpoint,
    nodes,
    values,
    results,
    manifest.edges,
    screen.network,
  );
  const response = await fetch(target, {
    method: endpoint.method,
    credentials: "same-origin",
    headers:
      body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body,
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok)
    throw Error(
      `${endpoint.method} ${target} returned HTTP ${response.status}`,
    );
  results.set(id, data);
  if (refresh && !["GET", "HEAD"].includes(endpoint.method))
    for (const read of initialReads) await execute(read, false);
  repaint();
}
const initialReads = [
  ...new Set(
    screen.network
      .filter((t) => t.method === "GET")
      .map(
        (t) =>
          manifest.endpoints.find((e) => endpointMatches(e, t.url, t.method))
            ?.id,
      )
      .filter(Boolean),
  ),
];
repaint();
try {
  for (const id of initialReads) await execute(id, false);
} catch (error) {
  report(error);
}
