import type { Browser } from "@playwright/test";
import { z } from "zod";
import { flatten, type Node, type Screen } from "./contracts";
const presentationSchema = z
  .object({
    tag: z.string().regex(/^[a-z][a-z0-9]*$/),
    attrs: z.record(z.string(), z.string().max(4000)),
    style: z.record(z.string(), z.string().max(1000)),
    text: z.string().max(10000),
  })
  .strict();
/** Compile emitted templates in a fresh, offline, credential-free browser realm. Only validated element data reaches the active runtime. */
export async function compileComponents(
  browser: Browser,
  screens: Screen[],
  components: Record<string, string>,
) {
  for (const screen of screens)
    for (const node of flatten(screen.root)) {
      if (!node.component || node.component === "builtin") continue;
      const code = components[node.component];
      if (!code) throw Error("Missing generated component definition.");
      const context = await browser.newContext({
        offline: true,
        serviceWorkers: "block",
        acceptDownloads: false,
      });
      await context.route("**/*", (route) => route.abort());
      await context.routeWebSocket("**/*", (socket) => socket.close());
      const page = await context.newPage();
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        await page.setContent(
          `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src data:; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'">`,
        );
        const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
        const input = {
          tag: node.tag,
          role: node.role,
          kind: node.kind,
          attrs: node.attrs,
          style: node.style,
          text: node.text,
          value: node.value,
        };
        const raw = await Promise.race([
          page.evaluate(`(async () => {
          const component = await import(${JSON.stringify(moduleUrl)});
          const el = component.render(${JSON.stringify(input)});
          if (!(el instanceof HTMLElement) || el.children.length) throw Error('Generated component must return one childless HTMLElement.');
          return {tag:el.tagName.toLowerCase(),attrs:Object.fromEntries(Array.from(el.attributes).filter(a=>a.name!=='style').map(a=>[a.name,a.value])),style:Object.fromEntries(Array.from(el.style).map(key=>[key,el.style.getPropertyValue(key)])),text:el.textContent||''};
        })()`),
          new Promise<never>((_, reject) => {
            deadline = setTimeout(
              () => reject(Error("Component compilation timed out.")),
              5000,
            );
          }),
        ]);
        node.presentation = validatePresentation(raw, node);
      } finally {
        clearTimeout(deadline);
        await context.close();
      }
    }
}
function validatePresentation(raw: unknown, node: Node) {
  const result = presentationSchema.parse(raw);
  if (
    [
      "script",
      "iframe",
      "object",
      "embed",
      "link",
      "meta",
      "style",
      "base",
    ].includes(result.tag)
  )
    throw Error("Forbidden generated element.");
  const attrs = new Set([
    "id",
    "name",
    "type",
    "placeholder",
    "href",
    "src",
    "alt",
    "for",
    "required",
    "min",
    "max",
    "step",
    "multiple",
    "aria-label",
    "aria-labelledby",
    "aria-describedby",
    "role",
    "value",
    "checked",
    "selected",
  ]);
  for (const [key, value] of Object.entries(result.attrs)) {
    if (!attrs.has(key)) throw Error(`Forbidden generated attribute ${key}.`);
    if (["href", "src"].includes(key) && value !== node.attrs[key])
      throw Error("Generated URLs must match observed attributes.");
  }
  const styleKeys = new Set([
    "display",
    "position",
    "box-sizing",
    "color",
    "background-color",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "letter-spacing",
    "text-align",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "border-top",
    "border-right",
    "border-bottom",
    "border-left",
    "border-radius",
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-left-radius",
    "border-bottom-right-radius",
    "max-width",
    "min-width",
    "width",
    "gap",
    "row-gap",
    "column-gap",
    "flex-direction",
    "align-items",
    "justify-content",
    "grid-template-columns",
    "box-shadow",
    "list-style-type",
  ]);
  for (const key of Object.keys(result.style))
    if (
      !styleKeys.has(key) &&
      !/^border-(top|right|bottom|left)-(width|style|color)$/.test(key)
    )
      throw Error(`Forbidden generated style property ${key}.`);
  for (const value of Object.values(result.style))
    if (/url\s*\(|@import|expression\s*\(/i.test(value))
      throw Error("Generated styles cannot load resources.");
  return result;
}
