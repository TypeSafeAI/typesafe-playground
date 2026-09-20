import type { RunPayload } from "../api";
import type { Personality } from "./personality";
import type { ResponseGraph } from "./graph";
import type { StoryFrame } from "./story";
import type { StoryDecision } from "./creative";
import type { CreativeResolution } from "./creative-policy";
import type { ExcerptSpan, SourceExcerpt } from "./source-excerpts";
import type {
  CalculationProof,
  QuantityFact,
  QuantityOperation,
} from "./quantities";

export type Intent =
  | "capabilities"
  | "greet"
  | "acknowledge"
  | "explain"
  | "answer"
  | "compare"
  | "summarize"
  | "support"
  | "create"
  | "clarify"
  | "unsupported";
export type Style = "concise" | "balanced" | "detailed";
export type Topic = "guide" | "notes" | "support" | "creative";
export type EngineMessage = {
  role: "user" | "assistant";
  text: string;
  options?: string[];
  story?: StoryFrame;
};
export type EngineInput = {
  messages: EngineMessage[];
  topic: Topic;
  notes: string;
  mode: "live" | "demo";
  style: Style;
  personality?: Personality;
  seed?: number;
};
export type Evidence = {
  id: string;
  title: string;
  text: string;
  provenance: "authored" | "source";
  source: string;
  terms: string[];
};
export type Context = {
  input: EngineInput;
  question: string;
  originalQuestion: string;
  referenceUnresolved: boolean;
  evidence: Evidence[];
  excerpts: SourceExcerpt[];
  quantities: { facts: QuantityFact[]; overflow: boolean };
  previousStory: StoryFrame | null;
  state: Record<string, unknown>;
};
export type Signal = { probability: number | null; confidence: number | null };
export type Section = {
  text: string;
  provenance: "authored" | "source" | "hypothetical";
  source?: string;
  excerpt?: ExcerptSpan;
};
export type Plan = {
  id: string;
  intent: Intent;
  title: string;
  sections: Section[];
  sources: Evidence[];
  options: string[];
  status: "answered" | "clarify" | "unsupported";
  calculation?: CalculationProof;
  story?: StoryFrame;
};
export type CreativeChoices = {
  character: string;
  setting: string;
  obstacle: string;
  resolution: string;
};
export type Analysis = {
  intent: Intent;
  signal: Signal;
  relevant: string[];
  relevantExcerpts?: string[];
  conflict: boolean;
  creative: CreativeChoices;
  story?: StoryDecision;
  storyCandidates?: CreativeResolution[];
  calculation: {
    operation: QuantityOperation | "clarify";
    operands: string[];
  } | null;
};
export type EngineResult = {
  version: "jev-engine-v1";
  text: string;
  intent: Intent;
  status: Plan["status"];
  provenance: "live" | "demo";
  signal: Signal;
  sections: Section[];
  sources: Evidence[];
  options: string[];
  graph: ResponseGraph;
  calculation?: CalculationProof;
  story?: StoryFrame;
  trace: {
    engine: string;
    personality?: Personality;
    contextHash: string;
    selectedPlan: string;
    candidates: { id: string; title: string; text: string }[];
    calls: number;
    inputTokens: number | null;
    outputTokens: number | null;
    elapsedMs: number;
    reason: string;
    integrity: "verified";
    semanticVerification:
      "model-assessed" | "scripted-demo" | "scripted-help" | "not-assessed";
  };
};
export type JevTransport = (
  payload: RunPayload,
  signal?: AbortSignal,
) => Promise<unknown>;
export type EngineEvent = {
  stage:
    "context" | "interpret" | "compose" | "evaluate" | "verify" | "complete";
  label: string;
  calls: number;
};
export type EngineDependencies = {
  transport?: JevTransport;
  signal?: AbortSignal;
  onProgress?: (event: EngineEvent) => void;
  now?: () => number;
};
