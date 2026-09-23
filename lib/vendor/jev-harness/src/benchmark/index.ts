/** Benchmark-only entry point. Never use as a provider-failure fallback. */
import { decideBase as evaluateValidation, type Decision } from "../contract/decide";

export interface BenchmarkDecision extends Decision {
  mode: "base";
  source: "none";
  reviewed: false;
}

/** Preserve the absence of semantic review even when the base verdict permits. */
export function decideBase(validation: unknown): BenchmarkDecision {
  return { ...evaluateValidation(validation), mode: "base", source: "none", reviewed: false };
}
