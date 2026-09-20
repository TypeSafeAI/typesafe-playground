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
        {usage.tokens.toLocaleString()} tokens
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
