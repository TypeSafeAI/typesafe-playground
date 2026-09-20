export type UsageEntry = {
  timestamp: string;
  example: string;
  endpoint: string;
  inputTokens: number | null;
  outputTokens: number | null;
  tokenSource: "reported" | "estimated" | "unknown";
  requestCount: number;
  estimatedCost: number | null;
  status: "success" | "failed" | "cancelled";
  keySource: "personal" | "community";
};
export type UsageLimit = {
  limit: number;
  remaining: number;
  resetAt: string | null;
  window: string;
};
export type AccountUsage = {
  available: boolean;
  reason: string;
  plan: string | null;
  tokens?: UsageLimit;
  requests?: UsageLimit;
};
export type UsageBlock = {
  kind: "rate_limit" | "billing";
  message: string;
  resetAt: string | null;
};
export type UsageSnapshot = {
  entries: UsageEntry[];
  requests: number;
  tokens: number;
  estimatedTokens: number;
  unknownCalls: number;
  cost: number;
  account: AccountUsage;
  block: UsageBlock | null;
  rateLimit?: import("../lib/serverRateLimit").RateLimitReport;
};
export type ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  attempted: boolean;
  status: number;
  retryAt: string | null;
  rateLimit?: import("../lib/serverRateLimit").RateLimitReport;
};
