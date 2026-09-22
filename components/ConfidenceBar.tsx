import { percent } from "../lib/client";

interface ConfidenceBarProps {
  label: string;
  value: number | null | undefined;
}

/**
 * Reuses the `.probability-track` style already shared by the doom, chess and
 * gate workspaces, so a single-value confidence/probability score gets the
 * same visual bar those workspaces use for per-option distributions instead
 * of being shown as plain text.
 */
export function ConfidenceBar({ label, value }: ConfidenceBarProps) {
  const width =
    typeof value === "number" && Number.isFinite(value)
      ? `${Math.max(0, Math.min(1, value)) * 100}%`
      : "0%";
  return (
    <div className="confidence-bar">
      <div className="input-meta">
        <span>{label}</span>
        <span>{percent(value)}</span>
      </div>
      <div className="probability-track">
        <span style={{ width }} />
      </div>
    </div>
  );
}
