import {
  IQ_QUESTIONS,
  buildIqPayload,
  resolveIqAnswer,
  unscoredIqResult,
  type IqMode,
  type IqResult,
} from "./iq-test";
import type { RunPayload } from "./api";

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** A fixed, bounded test. Failures stop; no retries or substituted answers. */
export async function runIqTest({
  mode,
  signal,
  transport,
  onResult,
  onQuestion,
  wait = pause,
}: {
  mode: IqMode;
  signal: AbortSignal;
  transport: (payload: RunPayload, signal: AbortSignal) => Promise<unknown>;
  onResult?: (result: IqResult) => void;
  onQuestion?: (index: number) => void;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
}): Promise<IqResult[]> {
  const results: IqResult[] = [];
  for (const [index, question] of IQ_QUESTIONS.entries()) {
    if (signal.aborted) break;
    onQuestion?.(index);
    let result: IqResult;
    if (mode === "demo") {
      result = {
        id: question.id,
        status: question.expected === "a" ? "correct" : "incorrect",
        choice: "a",
        confidence: null,
        probabilities: null,
        latencyMs: null,
      };
    } else {
      const started = performance.now();
      try {
        const response = await transport(buildIqPayload(question), signal);
        result = signal.aborted
          ? unscoredIqResult(
              question.id,
              "cancelled",
              "Request cancelled; no answer was scored.",
            )
          : resolveIqAnswer(question, response);
      } catch {
        // Transport owns detailed/redacted errors and usage. Do not persist
        // arbitrary provider strings (which might echo credentials) in exports.
        result = unscoredIqResult(
          question.id,
          signal.aborted ? "cancelled" : "failed",
          signal.aborted
            ? "Request cancelled; no answer was scored."
            : "Jev request failed. Check the API key and Usage panel, then start a new run.",
        );
      }
      result.latencyMs = Math.round(performance.now() - started);
    }
    results.push(result);
    onResult?.(result);
    if (result.status !== "correct" && result.status !== "incorrect") break;
    // Keep every answer readable, including the last before the final report.
    // This also bounds the rate of live requests without hiding network time.
    try {
      await wait(2000, signal);
    } catch (error) {
      if (!signal.aborted) throw error;
      break;
    }
  }
  return results;
}
