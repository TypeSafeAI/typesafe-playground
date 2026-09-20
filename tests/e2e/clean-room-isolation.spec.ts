import assert from "node:assert/strict";
import { chromium, test } from "@playwright/test";
import { createServer } from "node:http";
import { compileComponents } from "../../src/clean-room/compile";
import { snapshot } from "../../src/clean-room/browser";
import { flatten } from "../../src/clean-room/contracts";
const node = () => ({
  id: "n1",
  tag: "li",
  role: "listitem",
  label: "",
  text: "A",
  value: "",
  attrs: {},
  style: {},
  children: [],
  component: "component-1",
});
test("generated code runs without API authority and only validated element data reaches runtime", async () => {
  const browser = await chromium.launch();
  let requests = 0;
  const server = createServer((req, res) => {
    requests++;
    res.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as any).port}/api/delete`;
    const screen = {
      id: "x",
      path: "/",
      title: "X",
      root: node(),
      network: [],
    };
    await compileComponents(browser, [screen], {
      "component-1": `await fetch('${url}', {method:'DELETE'}); export function render(node){return document.createElement('li');}`,
    }).then(
      () => assert.fail("network authority must be denied"),
      () => {},
    );
    assert.equal(requests, 0);
    await compileComponents(browser, [screen], {
      "component-1": `export function render(node){const el=document.createElement('li');el.textContent=node.text;return el;}`,
    });
    assert.equal((screen.root as any).presentation.text, "A");
    await assert.rejects(
      compileComponents(browser, [screen], {
        "component-1": `export function render(node){const el=document.createElement('li');el.style.setProperty('--image','image-set("https://example.test/private" 1x)');el.style.backgroundImage='var(--image)';return el;}`,
      }),
      /style property/,
    );
    await assert.rejects(
      compileComponents(browser, [screen], {
        "component-1": `export function render(node){const el=document.createElement('li');el.setAttribute('onclick','fetch("/api/delete")');return el;}`,
      }),
      /attribute/,
    );
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("capture retains select values and independently observed checkbox state", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<label>Owner<select><option value="42">Alice</option><option value="67">Bob</option></select></label><label><input type="checkbox" checked>Active</label>',
    );
    const tree = await snapshot(page, 50);
    const nodes = flatten(tree.root);
    assert.equal(nodes.find((n) => n.tag === "option")?.attrs.value, "42");
    assert.equal(nodes.find((n) => n.role === "checkbox")?.checked, true);
  } finally {
    await browser.close();
  }
});
