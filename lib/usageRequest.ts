import { browserRequestQueue } from "./browserRequestQueue";
import { jevHeaders } from "./api-key";
import {
  assertUsageAvailable,
  recordUsage,
  usageContext,
} from "./logUsageEntry";
import type { ProviderUsage } from "../types/usage";
import { workspaceIdFromPath } from "./routes";
/** One instrumentation point for every browser-to-Jev transport. */
export async function usageRequest(
  endpoint: string,
  payload: unknown,
  signal?: AbortSignal,
  options: { mock?: boolean; example?: string } = {},
) {
  if (options.mock) return sendUsageRequest(endpoint, payload, signal, options);
  assertUsageAvailable();
  const key = jevHeaders()["X-TypeSafe-API-Key"];
  return browserRequestQueue.run(() => {
    assertUsageAvailable();
    if (jevHeaders()["X-TypeSafe-API-Key"] !== key)
      throw Error(
        "API key changed while queued. Run again with the selected key.",
      );
    if (signal?.aborted) throw signal.reason;
    return sendUsageRequest(endpoint, payload, signal, options);
  }, signal);
}
async function sendUsageRequest(
  endpoint: string,
  payload: unknown,
  signal?: AbortSignal,
  options: { mock?: boolean; example?: string } = {},
) {
  const context = usageContext();
  const example =
    options.example ??
    (typeof window !== "undefined"
      ? workspaceIdFromPath(window.location.pathname)
      : "unknown");
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: options.mock
        ? { "Content-Type": "application/json" }
        : jevHeaders(),
      body: JSON.stringify(payload),
      signal,
    });
  } catch (e) {
    if (!options.mock)
      recordUsage(
        payload,
        null,
        signal?.aborted ? "cancelled" : "failed",
        endpoint,
        context,
        example,
      );
    throw e;
  }
  let data: any;
  let invalidBody = false;
  try {
    data = await response.json();
  } catch {
    invalidBody = true;
    data = { error: `Request failed (${response.status}): invalid response.` };
  }
  if (!options.mock) {
    const report: ProviderUsage = data?._playgroundUsage ?? {
      inputTokens: data?.usage?.input_tokens ?? null,
      outputTokens: data?.usage?.output_tokens ?? null,
      attempted: true,
      status: response.status,
      retryAt: null,
    };
    recordUsage(
      payload,
      report,
      signal?.aborted
        ? "cancelled"
        : response.ok && !invalidBody
          ? "success"
          : "failed",
      endpoint,
      context,
      example,
    );
  }
  if (!response.ok || invalidBody)
    throw Error(data.error || `Request failed (${response.status}).`);
  return data;
}
