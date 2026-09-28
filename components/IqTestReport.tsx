import type { RefObject } from "react";
import type { IqMode, summarizeIq } from "../lib/iq-test";

export function IqTestReport({
  summary,
  mode,
  reportRef,
}: {
  summary: ReturnType<typeof summarizeIq>;
  mode: IqMode;
  reportRef: RefObject<HTMLElement | null>;
}) {
  const estimate = summary.iqEstimate;
  if (!estimate) return null;

  return (
    <section
      className="panel iq-final-report"
      ref={reportRef}
      tabIndex={-1}
      aria-labelledby="iq-final-heading"
    >
      <div className="panel-heading">
        <h2 id="iq-final-heading">Final IQ-style test result</h2>
        <span className="muted">
          {mode === "live" ? "Live Jev" : "Local demo"}
        </span>
      </div>
      <div className="panel-content">
        <div className="iq-final-score">
          <div className="iq-estimate" data-testid="iq-estimate">
            <span className="iq-caption">Estimated IQ</span>
            <strong>≈ {estimate.value}</strong>
            <span className="iq-estimate-label">Uncalibrated heuristic</span>
          </div>
          <div className="iq-final-raw">
            <span className="iq-caption">Raw score</span>
            <strong>
              {summary.correct} / {summary.total}
            </strong>
            <span>{summary.percentage!.toFixed(0)}% correct on this set</span>
            <p>
              {summary.correct} correct · {summary.incorrect} incorrect ·{" "}
              {summary.unscored} unscored
            </p>
          </div>
        </div>
        <p className="iq-score-note">
          {mode === "demo"
            ? "This demo estimate comes from scripted answers, not Jev. "
            : "This estimate describes this run using assumed reference values. "}
          This practice set has no human population norms and cannot establish a
          standardized IQ or percentile.
        </p>
        <div className="iq-breakdowns">
          {summary.categories.map((category) => (
            <div
              key={category.category}
              role="group"
              aria-label={`${category.category} breakdown`}
            >
              <h3>{category.category}</h3>
              <strong>
                {category.correct} / {category.total}{" "}
                <span>{category.percentage!.toFixed(0)}%</span>
              </strong>
              <progress
                max={category.total}
                value={category.correct}
                aria-label={`${category.category} correct answers`}
              />
              <p>
                {category.correct} correct · {category.incorrect} incorrect
              </p>
            </div>
          ))}
        </div>
        <details className="iq-estimate-method">
          <summary>How this estimate is calculated</summary>
          <p>
            We assume a reference mean of {estimate.assumedRawMean} correct
            answers and a standard deviation of{" "}
            {estimate.assumedRawStandardDeviation} answers. These are
            provisional design choices, not measurements from a human sample.
          </p>
          <code>
            {`round(${estimate.scaleMean} + ${estimate.scaleStandardDeviation} × (correct − ${estimate.assumedRawMean}) / ${estimate.assumedRawStandardDeviation})`}
          </code>
          <p>
            The estimate uses all {summary.total} checked answers. Confidence
            and response time do not affect it. Changing the assumptions changes
            the estimate; rounding does not imply measurement precision.
          </p>
        </details>
        <p className="muted">
          Use the answer sheet below to review each choice and its checked
          explanation. The export includes this breakdown and the estimation
          method with its assumptions.
        </p>
      </div>
    </section>
  );
}
