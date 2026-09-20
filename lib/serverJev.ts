import { serverRateLimiter } from "./serverRateLimit";
import type { ProviderUsage } from "../types/usage";
import { reportedTokens } from "./estimateCost";
import { readBoundedBody, validatePayload } from "./api";
export class JevProviderError extends Error {
  constructor(
    message: string,
    public status: number,
    public usage?: ProviderUsage,
  ) {
    super(message);
  }
}
/** Server/CLI transport. Keys stay out of model payloads and responses. */
export async function serverJevTransport(
  value: unknown,
  signal?: AbortSignal,
  override?: string | null,
) {
  const payload = validatePayload(value);
  const key = override?.trim() || process.env.TYPESAFE_API_KEY?.trim();
  if (
    override !== undefined &&
    override !== null &&
    (!override.trim() ||
      !/^[\x21-\x7e]+$/.test(override.trim()) ||
      override.length > 1024)
  )
    throw new JevProviderError("Invalid API key override.", 400);
  if (!key)
    throw new JevProviderError(
      "Set TYPESAFE_API_KEY on the server to run Jev.",
      503,
    );
  if (signal?.aborted)
    throw new JevProviderError("Request cancelled before sending.", 499);
  const permit = serverRateLimiter.acquire(key);
  if (!permit.allowed)
    throw new JevProviderError(
      "Playground server safety limit reached (60 requests/minute, 2 concurrent per key per server instance). No request was sent to TypeSafe. Retry after the displayed cooldown.",
      429,
      {
        attempted: false,
        inputTokens: null,
        outputTokens: null,
        status: 429,
        retryAt: permit.report.retryAt,
        rateLimit: permit.report,
      },
    );
  try {
    const upstream = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.any([
        ...(signal ? [signal] : []),
        AbortSignal.timeout(45000),
      ]),
      cache: "no-store",
    });
    if (!upstream.ok) {
      const retry = upstream.headers.get("retry-after");
      const retryMs =
        retry && /^\d+(?:\.\d+)?$/.test(retry)
          ? Date.now() + Number(retry) * 1000
          : retry
            ? Date.parse(retry)
            : NaN;
      const retryAt =
        Number.isFinite(retryMs) &&
        retryMs > Date.now() &&
        retryMs < 8640000000000000
          ? new Date(retryMs).toISOString()
          : null;
      await upstream.body?.cancel();
      throw new JevProviderError(
        upstream.status === 429
          ? "TypeSafe rate limit reached. Live Jev calls are paused; see usage for reset information."
          : upstream.status === 402
            ? "TypeSafe key budget or billing requires attention (HTTP 402). See usage or change your API key."
            : `TypeSafe returned HTTP ${upstream.status}. Check your API configuration or try again.`,
        [429, 402].includes(upstream.status) ? upstream.status : 502,
        {
          inputTokens: null,
          outputTokens: null,
          attempted: true,
          status: upstream.status,
          retryAt,
        },
      );
    }
    const data = JSON.parse(
      await readBoundedBody(upstream.body, 2 * 1024 * 1024),
    );
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      !data.answers ||
      typeof data.answers !== "object" ||
      Array.isArray(data.answers)
    )
      throw Error("Invalid upstream response.");
    return {
      ...data,
      _playgroundUsage: {
        inputTokens: reportedTokens(data.usage?.input_tokens),
        outputTokens: reportedTokens(data.usage?.output_tokens),
        attempted: true,
        status: upstream.status,
        retryAt: null,
        rateLimit: permit.report,
      } satisfies ProviderUsage,
    };
  } catch (e) {
    if (e instanceof JevProviderError) throw e;
    throw new JevProviderError(
      "TypeSafe could not complete this request. Please try again.",
      502,
      {
        inputTokens: null,
        outputTokens: null,
        attempted: true,
        status: 502,
        retryAt: null,
      },
    );
  } finally {
    permit.release();
  }
}
