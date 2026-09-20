import { createHash } from "node:crypto";
import { REQUEST_POLICY } from "./requestRateLimit";
type Bucket = { starts: number[]; active: number };
export type RateLimitReport = {
  source: "playground_server";
  scope: "per_key_per_server_instance";
  limit: number;
  windowSeconds: number;
  remaining: number;
  active: number;
  retryAt: string | null;
};
export class ServerRateLimiter {
  private buckets = new Map<string, Bucket>();
  acquire(key: string, now = Date.now()) {
    // Never retain the credential itself or send its digest to the browser.
    const id = createHash("sha256").update(key).digest("hex");
    for (const [id, b] of this.buckets) {
      b.starts = b.starts.filter((t) => t > now - REQUEST_POLICY.windowMs);
      if (!b.active && !b.starts.length) this.buckets.delete(id);
    }
    let b = this.buckets.get(id);
    const capacity = !b && this.buckets.size >= 4096;
    if (!b) b = { starts: [], active: 0 };
    const full = b.starts.length >= REQUEST_POLICY.requestsPerWindow;
    const busy = b.active >= REQUEST_POLICY.maxConcurrent;
    const retryAt = full ? b.starts[0] + REQUEST_POLICY.windowMs : now + 1200;
    const report = (): RateLimitReport => ({
      source: "playground_server",
      scope: "per_key_per_server_instance",
      limit: REQUEST_POLICY.requestsPerWindow,
      windowSeconds: REQUEST_POLICY.windowMs / 1000,
      remaining: Math.max(
        0,
        REQUEST_POLICY.requestsPerWindow - b!.starts.length,
      ),
      active: b!.active,
      retryAt: null,
    });
    if (full || busy || capacity)
      return {
        allowed: false as const,
        report: { ...report(), retryAt: new Date(retryAt).toISOString() },
      };
    b.starts.push(now);
    b.active++;
    this.buckets.set(id, b);
    let released = false;
    return {
      allowed: true as const,
      report: report(),
      release: () => {
        if (!released) {
          b!.active--;
          released = true;
        }
      },
    };
  }
}
// Share the limiter across route modules and development reloads in this process.
const globalLimit = globalThis as typeof globalThis & {
  jevRateLimiter?: ServerRateLimiter;
};
export const serverRateLimiter = (globalLimit.jevRateLimiter ??=
  new ServerRateLimiter());
