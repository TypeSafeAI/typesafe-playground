import { dollars } from "./UsageDetailPanel";
import { Activity } from "lucide-react";
import type { UsageSnapshot } from "../types/usage";
import { quotaState } from "../lib/logUsageEntry";
export function UsageSummaryBadge({
  usage,
  onClick,
  personal,
  queueCount = 0,
}: {
  usage: UsageSnapshot;
  personal: boolean;
  queueCount?: number;
  onClick: () => void;
}) {
  const state = quotaState(usage);
  const total = usage.tokens + usage.outputTokens;
  // Unreported output is unknown, not zero, so the total is only a floor.
  const floor = usage.unknownOutputCalls > 0;
  return (
    <button
      className={`usage-badge ${state}`}
      onClick={onClick}
      aria-label="Open API usage dashboard"
      aria-haspopup="dialog"
    >
      <Activity size={15} />
      <span className="usage-key-label">
        {personal ? "Personal" : "Community"}
      </span>
      <span>
        {state === "exhausted" ? "Calls paused" : `${usage.requests} calls`}
      </span>
      {queueCount > 0 && <span>{queueCount} queued</span>}
      <small>
        <span
          title={`${usage.tokens.toLocaleString()} input + ${usage.outputTokens.toLocaleString()} output tokens${
            floor
              ? `. ${usage.unknownOutputCalls} ${usage.unknownOutputCalls === 1 ? "call" : "calls"} did not report output tokens, so this total is a minimum.`
              : ""
          }`}
        >
          {total.toLocaleString()}
          {floor ? "+" : ""} tokens
        </span>
        {usage.estimatedTokens > 0 ? " ≈" : ""}
        <span
          className="usage-cost"
          title="Estimated input cost at TypeSafe’s published $42 per billion input tokens. Unknown failed-call costs excluded."
        >
          {" "}
          ·{" "}
          {usage.unknownCalls > 0 && usage.tokens === 0
            ? "Cost unknown"
            : `~${dollars(usage.cost)}${usage.unknownCalls > 0 ? "*" : ""}`}
        </span>
      </small>
    </button>
  );
}
