import path from "node:path";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import type { Browser } from "@playwright/test";
import {
  flatten,
  type Action,
  type Screen,
  type Capture,
  type Config,
  type Endpoint,
  type Observation,
} from "./contracts";
import { observe, perform, settle, watch } from "./browser";
import { matchEndpoint } from "./discovery";
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.entries(v)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`)
      .join(",")}}`;
  return JSON.stringify(v);
}
export function compareObservations(
  original: Observation,
  rebuilt: Observation,
) {
  const discrepancies: string[] = [];
  const normalizeText = (s: string) => s.replace(/\s+/g, " ").trim();
  if (normalizeText(original.text) !== normalizeText(rebuilt.text))
    discrepancies.push("Visible text differs.");
  if (stable(original.elements) !== stable(rebuilt.elements))
    discrepancies.push("Accessible elements or current values differ.");
  const network = (o: Observation) =>
    o.network.map((n) => ({
      ...n,
      url: new URL(n.url).pathname + new URL(n.url).search,
    }));
  if (stable(network(original)) !== stable(network(rebuilt)))
    discrepancies.push(
      "Observed network method, path, variables, status or response differs.",
    );
  if (original.network.some((n) => n.status >= 400))
    discrepancies.push("Original API returned errors.");
  if (rebuilt.network.some((n) => n.status >= 400))
    discrepancies.push("Rebuilt API returned errors.");
  for (const error of original.errors)
    discrepancies.push(`Original runtime: ${error}`);
  for (const error of rebuilt.errors)
    discrepancies.push(`Rebuilt runtime: ${error}`);
  return discrepancies;
}
export async function pixelDifference(original: string, rebuilt: string) {
  const [a, b] = await Promise.all([
    sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(rebuilt).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (a.info.width !== b.info.width || a.info.height !== b.info.height)
    return 1;
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4)
    if (
      Math.max(
        ...[0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[i + c])),
      ) > 20
    )
      changed++;
  return changed / (a.info.width * a.info.height);
}
export async function verifyRebuild(
  browser: Browser,
  config: Config,
  capture: Capture,
  endpoints: Endpoint[],
  origin: string,
  dir: string,
) {
  await mkdir(path.join(dir, "rebuilt"), { recursive: true });
  const checks: {
    id: string;
    passed: boolean;
    discrepancies: string[];
    pixelDifference: number | null;
    original: Observation;
    rebuilt: Observation | null;
  }[] = [];
  for (const screen of config.screens)
    for (const scenario of [
      { id: "load", actions: [], expectText: screen.readyText },
      ...screen.scenarios,
    ]) {
      const id = `${screen.id}:${scenario.id}`,
        original = capture.baselines[id];
      const context = await browser.newContext({
        viewport: config.viewport,
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const monitor = watch(page, origin);
      const check = {
        id,
        passed: false,
        discrepancies: [] as string[],
        pixelDifference: null as number | null,
        original,
        rebuilt: null as Observation | null,
      };
      try {
        await page.goto(new URL(screen.path, origin).href);
        await settle(page, config, screen.readyText);
        for (const action of scenario.actions) {
          await perform(page, action);
          await settle(page, config);
        }
        await settle(page, config, scenario.expectText);
        check.rebuilt = await observe(page, config, monitor);
        if (new URL(page.url()).origin !== origin)
          check.rebuilt.errors.push(
            "Interaction escaped the rebuilt app origin.",
          );
        check.discrepancies = compareObservations(original, check.rebuilt);
        const name = `${screen.id}-${scenario.id}.png`;
        await page.screenshot({
          path: path.join(dir, "rebuilt", name),
          fullPage: true,
          animations: "disabled",
        });
        check.pixelDifference = await pixelDifference(
          path.join(dir, "original", name),
          path.join(dir, "rebuilt", name),
        );
        if (check.pixelDifference > config.visualTolerance)
          check.discrepancies.push(
            `Visual difference ${(check.pixelDifference * 100).toFixed(2)}% exceeds ${(config.visualTolerance * 100).toFixed(2)}% tolerance.`,
          );
      } catch (e) {
        check.discrepancies.push(
          e instanceof Error ? e.message : "Browser verification failed",
        );
      } finally {
        await context.close();
      }
      check.passed = check.discrepancies.length === 0;
      checks.push(check);
    }
  const observed = new Set(
    Object.values(capture.baselines)
      .flatMap((o) => o.network)
      .map((n) => matchEndpoint(n.method, n.url, endpoints)?.id),
  );
  const gaps = [
    ...capture.gaps,
    ...endpoints
      .filter((e) => !observed.has(e.id))
      .map((e) => `Unverified endpoint ${e.method} ${e.path}`),
    ...config.screens
      .filter((s) => !s.scenarios.length)
      .map((s) => `No interaction scenarios for ${s.id}`),
  ];
  for (const screen of capture.screens) {
    const actions =
      config.screens
        .find((s) => s.id === screen.id)
        ?.scenarios.flatMap((s) => s.actions) ?? [];
    gaps.push(...unexercisedControls(screen, actions));
  }
  return {
    status:
      checks.every((c) => c.passed) && !gaps.length
        ? "passed"
        : "review-required",
    viewport: config.viewport,
    scope:
      "Configured screens and scenarios only; unobserved app behavior is not proven.",
    checks,
    gaps,
  };
}

export function unexercisedControls(screen: Screen, actions: Action[]) {
  const gaps: string[] = [];
  const occurrences = new Map<string, number>();
  for (const node of flatten(screen.root)) {
    if (
      !["button", "textbox", "combobox", "checkbox", "radio", "link"].includes(
        node.role,
      )
    )
      continue;
    const key = `${node.role}\0${node.label}`,
      nth = occurrences.get(key) ?? 0;
    occurrences.set(key, nth + 1);
    if (
      !actions.some(
        (a) => a.role === node.role && a.name === node.label && a.nth === nth,
      )
    ) {
      gaps.push(
        `Unexercised control ${screen.id}/${node.id}: ${node.role} ${node.label} [${nth}]`,
      );
    }
  }
  return gaps;
}
