import { chromium, type Browser, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type {
  Action,
  Capture,
  Config,
  Node,
  Observation,
  Trace,
} from "./contracts";
import { flatten } from "./contracts";
const captureSource = () =>
  readFile(path.join(process.cwd(), "src/clean-room/capture.js"), "utf8");
export async function snapshot(page: Page, maxNodes: number) {
  return (await page.evaluate(`(${await captureSource()})(${maxNodes})`)) as {
    title: string;
    root: Node;
    text: string;
  };
}
export function watch(page: Page, origin: string) {
  const targetOrigin = new URL(origin).origin;
  const network: Trace[] = [],
    errors: string[] = [],
    pending: Promise<void>[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (response) => {
    const request = response.request();
    if (!["fetch", "xhr"].includes(request.resourceType())) return;
    const url = new URL(response.url());
    if (url.origin !== targetOrigin) {
      errors.push(`Uncaptured cross-origin API: ${url.origin}${url.pathname}`);
      return;
    }
    pending.push(
      (async () => {
        let body: unknown = null;
        const contentType = response.headers()["content-type"] || "";
        if (
          response.status() !== 204 &&
          response.status() !== 304 &&
          contentType.includes("json")
        ) {
          const raw = await response.body();
          if (raw.length > 1024 * 1024)
            throw Error("Observed API response exceeds 1 MB.");
          body = JSON.parse(raw.toString());
        } else if (response.status() !== 204)
          errors.push(`Non-JSON API response: ${url.pathname}`);
        let payload: unknown = null;
        try {
          payload = request.postDataJSON();
        } catch {
          errors.push(`Non-JSON request body: ${url.pathname}`);
        }
        network.push({
          method: request.method(),
          url: url.href,
          status: response.status(),
          request: payload,
          response: body,
        });
      })().catch((e) => {
        errors.push(String(e));
      }),
    );
  });
  page.on("requestfailed", (request) => {
    if (!["fetch", "xhr"].includes(request.resourceType())) return;
    pending.push(
      (async () => {
        const response = await request.response();
        // Chromium reports ERR_ABORTED for bodyless 204 responses even when fetch succeeds.
        if (
          response?.status() === 204 &&
          request.failure()?.errorText === "net::ERR_ABORTED"
        )
          return;
        errors.push(`Request failed: ${new URL(request.url()).pathname}`);
      })(),
    );
  });
  return {
    network,
    errors,
    flush: async () => {
      await Promise.all(pending);
    },
  };
}
export async function perform(page: Page, action: Action) {
  const locator = page
    .getByRole(action.role as Parameters<Page["getByRole"]>[0], {
      name: action.name,
      exact: true,
    })
    .nth(action.nth);
  if (action.kind === "fill") await locator.fill(action.value);
  else if (action.kind === "select") await locator.selectOption(action.value);
  else if (action.kind === "check") await locator.setChecked(action.checked);
  else await locator.click();
}
export async function settle(page: Page, config: Config, text?: string) {
  if (text)
    await page
      .getByText(text, { exact: false })
      .first()
      .waitFor({ timeout: 10000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 });
  if (config.settleMs) await page.waitForTimeout(config.settleMs);
}
export async function observe(
  page: Page,
  config: Config,
  monitor: ReturnType<typeof watch>,
): Promise<Observation> {
  await monitor.flush();
  const tree = await snapshot(page, config.maxNodes);
  return {
    text: tree.text,
    elements: flatten(tree.root)
      .filter((n) => !["generic", "text"].includes(n.role))
      .map((n) => ({
        role: n.role,
        label: n.label,
        value: n.value,
        ...(n.checked !== undefined ? { checked: n.checked } : {}),
      })),
    network: [...monitor.network],
    errors: [...monitor.errors],
  };
}
export async function captureTarget(
  browser: Browser,
  config: Config,
  dir: string,
): Promise<Capture> {
  await mkdir(dir, { recursive: true });
  const result: Capture = { screens: [], baselines: {}, gaps: [] };
  for (const screen of config.screens) {
    const context = await browser.newContext({
      viewport: config.viewport,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const monitor = watch(page, config.target);
    try {
      await page.goto(new URL(screen.path, config.target).href);
      await settle(page, config, screen.readyText);
      const tree = await snapshot(page, config.maxNodes);
      const observation = await observe(page, config, monitor);
      result.screens.push({
        id: screen.id,
        path: screen.path,
        title: tree.title,
        root: tree.root,
        network: observation.network,
      });
      result.baselines[`${screen.id}:load`] = observation;
      await page.screenshot({
        path: path.join(dir, `${screen.id}-load.png`),
        fullPage: true,
        animations: "disabled",
      });
    } finally {
      await context.close();
    }
    for (const scenario of screen.scenarios) {
      const ctx = await browser.newContext({
          viewport: config.viewport,
          serviceWorkers: "block",
        }),
        p = await ctx.newPage();
      p.setDefaultTimeout(10000);
      const m = watch(p, config.target);
      try {
        await p.goto(new URL(screen.path, config.target).href);
        await settle(p, config, screen.readyText);
        for (const action of scenario.actions) {
          await perform(p, action);
          await settle(p, config);
        }
        await settle(p, config, scenario.expectText);
        result.baselines[`${screen.id}:${scenario.id}`] = await observe(
          p,
          config,
          m,
        );
        await p.screenshot({
          path: path.join(dir, `${screen.id}-${scenario.id}.png`),
          fullPage: true,
          animations: "disabled",
        });
      } finally {
        await ctx.close();
      }
    }
  }
  return result;
}
export { chromium };
