/**
 * Provisional design assumptions, NOT collected human reference data.
 * Changing these assumptions requires a new method version. This conversion
 * only applies to the fixed 24-question playground set.
 */
const MODEL = {
  method: "assumed-reference-v2",
  calibration: "uncalibrated",
  questionCount: 24,
  assumedRawMean: 12,
  assumedRawStandardDeviation: 4,
  scaleMean: 100,
  scaleStandardDeviation: 15,
} as const;

export function estimateIq(correct: number, total: number) {
  if (total !== MODEL.questionCount)
    throw Error("The IQ estimate requires the fixed 24-question set.");
  if (!Number.isInteger(correct) || correct < 0 || correct > total)
    throw Error("The IQ estimate requires an integer score from 0 to 24.");
  const value = Math.round(
    MODEL.scaleMean +
      MODEL.scaleStandardDeviation *
        ((correct - MODEL.assumedRawMean) / MODEL.assumedRawStandardDeviation),
  );
  return { value, ...MODEL };
}
