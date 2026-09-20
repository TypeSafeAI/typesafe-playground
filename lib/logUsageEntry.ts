"use client";
import { useSyncExternalStore } from "react";
import { readApiKey, apiKeyRevision, API_KEY_EVENT } from "./api-key";
import {
  estimateCost,
  estimateInputTokens,
  reportedTokens,
} from "./estimateCost";
import type {
  AccountUsage,
  ProviderUsage,
  UsageEntry,
  UsageSnapshot,
} from "../types/usage";
const STORAGE = "typesafe-session-usage-v1";
const initial: UsageSnapshot = {
  entries: [],
  requests: 0,
  tokens: 0,
  estimatedTokens: 0,
  unknownCalls: 0,
  cost: 0,
  account: {
    available: false,
    plan: null,
    reason:
      "Session usage only, not account-wide. Account quotas are unavailable.",
  },
  block: null,
};
let snapshot = initial;
const listeners = new Set<() => void>();
let started = false,
  generation = 0,
  currentKey = "";
function publish() {
  try {
    sessionStorage.setItem(
      STORAGE,
      JSON.stringify({ ...snapshot, keyRevision: apiKeyRevision() }),
    );
  } catch {
    /* Memory-only still works. */
  }
  listeners.forEach((fn) => fn());
}
export function initializeUsage() {
  if (started || typeof window === "undefined") return;
  started = true;
  currentKey = readApiKey();
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE) || "null");
    if (
      saved &&
      Array.isArray(saved.entries) &&
      saved.entries.length <= 200 &&
      [
        saved.requests,
        saved.tokens,
        saved.estimatedTokens,
        saved.unknownCalls,
        saved.cost,
      ].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0)
    ) {
      // Entries contain only scalar telemetry, never prompts or keys.
      const entries = saved.entries.filter(
        (e: UsageEntry) =>
          e &&
          typeof e.timestamp === "string" &&
          typeof e.example === "string" &&
          typeof e.endpoint === "string" &&
          ["reported", "estimated", "unknown"].includes(e.tokenSource),
      );
      snapshot = {
        ...initial,
        ...saved,
        entries,
        account: initial.account,
        rateLimit: undefined,
        block:
          saved.keyRevision === apiKeyRevision() &&
          saved.block &&
          ["rate_limit", "billing"].includes(saved.block.kind) &&
          typeof saved.block.message === "string" &&
          (saved.block.resetAt === null ||
            Number.isFinite(Date.parse(saved.block.resetAt)))
            ? saved.block
            : null,
      };
    }
  } catch {}
  const keyChanged = () => {
    const key = readApiKey();
    if (key === currentKey) return;
    currentKey = key;
    generation++;
    snapshot = {
      ...snapshot,
      block: null,
      account: initial.account,
      rateLimit: undefined,
    };
    publish();
  };
  window.addEventListener(API_KEY_EVENT, keyChanged);
  window.addEventListener("storage", keyChanged);
  publish();
}
export function usageContext() {
  initializeUsage();
  return {
    generation,
    keySource: (readApiKey()
      ? "personal"
      : "community") as UsageEntry["keySource"],
  };
}
export function getUsage() {
  return snapshot;
}
export function useUsage() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getUsage,
    () => initial,
  );
}
export function updateAccountUsage(account: AccountUsage) {
  snapshot = { ...snapshot, account };
  publish();
}
export function usageBlocked(now = Date.now()) {
  const b = snapshot.block;
  return (
    (!!b && (!b.resetAt || Date.parse(b.resetAt) > now)) ||
    [snapshot.account.tokens, snapshot.account.requests].some(
      (limit) =>
        limit &&
        limit.remaining <= 0 &&
        (!limit.resetAt || Date.parse(limit.resetAt) > now),
    )
  );
}
export function releaseUsageBlock() {
  snapshot = { ...snapshot, block: null };
  publish();
}
export function expireUsageBlock() {
  if (
    snapshot.block?.resetAt &&
    Date.parse(snapshot.block.resetAt) <= Date.now()
  )
    releaseUsageBlock();
}
export function assertUsageAvailable() {
  initializeUsage();
  expireUsageBlock();
  if (usageBlocked())
    throw Error(
      snapshot.block?.message ??
        "Reported API quota exhausted. Open Usage for reset information.",
    );
}
export function logUsageEntry(entry: UsageEntry) {
  snapshot = {
    ...snapshot,
    entries: [entry, ...snapshot.entries].slice(0, 200),
    requests: snapshot.requests + entry.requestCount,
    tokens: snapshot.tokens + (entry.inputTokens ?? 0),
    estimatedTokens:
      snapshot.estimatedTokens +
      (entry.tokenSource === "estimated" ? (entry.inputTokens ?? 0) : 0),
    unknownCalls: snapshot.unknownCalls + (entry.inputTokens === null ? 1 : 0),
    cost: snapshot.cost + (entry.estimatedCost ?? 0),
  };
  publish();
}
export function recordUsage(
  payload: unknown,
  report: ProviderUsage | null,
  status: UsageEntry["status"],
  endpoint: string,
  context: ReturnType<typeof usageContext>,
  example: string,
) {
  if (context.generation === generation && report?.rateLimit) {
    snapshot = { ...snapshot, rateLimit: report.rateLimit };
    if (!report.attempted && report.status === 429) {
      snapshot = {
        ...snapshot,
        block: {
          kind: "rate_limit",
          resetAt: report.retryAt,
          message:
            "Playground server safety limit reached. No request was sent to TypeSafe. Limit: 60 requests per rolling minute and 2 concurrent per key, per server instance. Retry after the cooldown; availability is checked again then.",
        },
      };
    }
    publish();
  }
  if (report && !report.attempted) return;
  const reported = reportedTokens(report?.inputTokens);
  const tokens =
    reported ?? (status === "success" ? estimateInputTokens(payload) : null);
  logUsageEntry({
    timestamp: new Date().toISOString(),
    example,
    endpoint,
    inputTokens: tokens,
    outputTokens: reportedTokens(report?.outputTokens),
    requestCount: 1,
    estimatedCost: tokens === null ? null : estimateCost(tokens),
    tokenSource:
      reported !== null
        ? "reported"
        : tokens !== null
          ? "estimated"
          : "unknown",
    status,
    keySource: context.keySource,
  });
  if (context.generation !== generation) return;
  if (report?.status === 429 || report?.status === 402) {
    const rate = report.status === 429;
    snapshot = {
      ...snapshot,
      block: {
        kind: rate ? "rate_limit" : "billing",
        resetAt: report.retryAt,
        message: rate
          ? "TypeSafe rate limit reached. Live Jev calls are paused. Wait for the reset or use your personal API key."
          : "TypeSafe rejected this key for billing or quota (HTTP 402). Live Jev calls are paused; check the key’s budget or use another key.",
      },
    };
    publish();
  }
}
export function quotaState(s = snapshot): "healthy" | "warning" | "exhausted" {
  if (s.block && (!s.block.resetAt || Date.parse(s.block.resetAt) > Date.now()))
    return "exhausted";
  const ratios = [s.account.tokens, s.account.requests]
    .filter(
      (v) =>
        v && v.limit >= 0 && (!v.resetAt || Date.parse(v.resetAt) > Date.now()),
    )
    .map((v) => (v!.limit === 0 ? 1 : 1 - v!.remaining / v!.limit));
  return ratios.some((v) => v >= 1)
    ? "exhausted"
    : ratios.some((v) => v >= 0.8)
      ? "warning"
      : "healthy";
}
