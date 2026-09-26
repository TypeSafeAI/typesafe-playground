import type { RunPayload } from "../api";

/** One catalog entry. Jev only ever sees `name` and `snippet`; `schema` is what the chosen tool would load. */
export interface ToolSnippet {
  name: string;
  category: string;
  /** One line, at most SNIPPET_LIMIT characters. */
  snippet: string;
  /** Full parameter schema (JSON Schema-like object). Never sent to Jev. */
  schema: Record<string, unknown>;
}

export interface ToolCatalog {
  version: "tool-router-catalog-v1";
  /** Pairs of tools written to look alike so routing must read past the name. */
  distractorPairs: [string, string][];
  tools: ToolSnippet[];
}

export interface TaskFixture {
  id: string;
  task: string;
  /** Category of the expected tool; null when no listed tool should be used. */
  category: string | null;
  /** The single best tool, or null when the correct answer is "none". */
  expected: string | null;
  /** Tools counted as a correct top-1 besides `expected`. Always includes `expected` when set. */
  acceptable: string[];
}

export interface TaskSet {
  version: "tool-router-tasks-v1";
  tasks: TaskFixture[];
}

export type RoutePath = "single" | "two-stage";

export interface RoutingResult {
  /** Chosen tool, or null when Jev chose `none` or the provider was unavailable. */
  top1: string | null;
  /** Tools ranked by probability, best first, excluding `none`. Empty when unavailable. */
  top3: string[];
  /** True only when Jev explicitly chose the `none` option. */
  none: boolean;
  /** Cleaned probability per option (tools and `none`) from the final choice question. */
  confidences: Record<string, number>;
  /** Jev's own confidence statistic for the final choice question, when reported. */
  confidence: number | null;
  latencyMs: number;
  path: RoutePath;
  /** Category chosen in stage one of a two-stage route; null for single-stage routes. */
  stageCategory: string | null;
  /** Exact requests sent, for audit. */
  requests: RunPayload[];
  /** Set when the provider errored, timed out, or answered outside the closed set. Never a default pick. */
  unavailable?: string;
}

export interface BaselineResult {
  top1: string | null;
  top3: string[];
  none: boolean;
  /** Lexical score per tool; zero means no overlapping term. */
  scores: Record<string, number>;
}

export const SNIPPET_LIMIT = 120;
