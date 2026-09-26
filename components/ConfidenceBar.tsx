import { percent } from "../lib/client";

interface ConfidenceBarProps {
  label: string;
  value: number | null | undefined;
}

/**
 * Reuses the existing `.probability-track` style, so a single-value
 * confidence/probability score gets the same visual bar as the workspaces
 * that already visualize per-option distributions instead of being shown as
 * plain text.
 */
export function ConfidenceBar({ label, value }: ConfidenceBarProps) {
  const unit =
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
      ? value
      : null;
  return (
    <div className="confidence-bar">
      <div className="input-meta">
        <span>{label}</span>
        <span>{percent(unit)}</span>
      </div>
      <div className="probability-track">
        <span style={{ width: unit === null ? "0%" : `${unit * 100}%` }} />
      </div>
    </div>
  );
}
