import type { RunPayload } from "./api";
import {
  buildTrolleyPayload,
  resolveTrolleyChoice,
  trolleyCase,
  TROLLEY_CASES,
  type TrolleyDecision,
} from "./trolley";

export const TROLLEY_REQUEST_TIMEOUT_MS = 45_000;
export const TROLLEY_HOLD_MS = 1_800;

export function trolleyPause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function requestWithDeadline(
  payload: RunPayload,
  signal: AbortSignal,
  transport: (payload: RunPayload, signal: AbortSignal) => Promise<unknown>,
): Promise<unknown> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () =>
      controller.abort(Error("Jev request timed out. No action was applied.")),
    TROLLEY_REQUEST_TIMEOUT_MS,
  );
  let rejectAbort: () => void = () => {};
  try {
    return await Promise.race([
      new Promise<never>((_, reject) => {
        rejectAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener("abort", rejectAbort, {
          once: true,
        });
      }),
      transport(payload, controller.signal),
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", rejectAbort);
  }
}

/** Fixed cases, at most twelve requests, no retries and no fallback decisions. */
export async function runTrolleyCases({
  ids,
  signal,
  transport,
  assertCurrent,
  onCase,
  onDecision,
  wait = trolleyPause,
}: {
  ids: readonly string[];
  signal: AbortSignal;
  transport: (payload: RunPayload, signal: AbortSignal) => Promise<unknown>;
  assertCurrent: () => void;
  onCase: (id: string) => void;
  onDecision: (decision: TrolleyDecision) => void;
  wait?: typeof trolleyPause;
}): Promise<void> {
  if (
    !ids.length ||
    ids.length > TROLLEY_CASES.length ||
    new Set(ids).size !== ids.length
  )
    throw Error("Choose one to twelve distinct trolley scenarios.");
  ids.forEach(trolleyCase);
  for (const id of ids) {
    signal.throwIfAborted();
    assertCurrent();
    onCase(id);
    const started = performance.now();
    const response = await requestWithDeadline(
      buildTrolleyPayload(id),
      signal,
      transport,
    );
    signal.throwIfAborted();
    assertCurrent();
    const decision = resolveTrolleyChoice(response);
    onDecision({
      scenarioId: id,
      source: "jev",
      ...decision,
      latencyMs: Math.round(performance.now() - started),
    });
    // A readable hold also prevents rapid sequences of live calls.
    await wait(TROLLEY_HOLD_MS, signal);
  }
}
