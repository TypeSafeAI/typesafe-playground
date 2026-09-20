import type { RunPayload } from "../lib/api";
/** The complete, closed set of places an incoming question can go. */
export type TriageOutcome =
  | "already_answered"
  | "answerable_by_docs"
  | "needs_human"
  | "needs_more_context";
export const triageOutcomes: Record<TriageOutcome, string> = {
  already_answered:
    "A specific earlier message in the conversation already answers this question.",
  answerable_by_docs:
    "A specific line of the supplied documentation answers it. Check documentation before community context.",
  needs_human:
    "A person has to answer: the question is new, specific, or reaches past the supplied context.",
  needs_more_context:
    "The question is too vague or incomplete to answer or to match against anything.",
};
export const outcomeLabels: Record<TriageOutcome, string> = {
  already_answered: "Already answered",
  answerable_by_docs: "Answered by the docs",
  needs_human: "Needs a human",
  needs_more_context: "Needs more context",
};
export const outcomeHeadlines: Record<TriageOutcome, string> = {
  already_answered: "Someone already answered this.",
  answerable_by_docs: "The docs cover this one.",
  needs_human: "Send this to a person.",
  needs_more_context: "Ask what they actually mean.",
};
export const isTriageOutcome = (value: unknown): value is TriageOutcome =>
  typeof value === "string" && Object.hasOwn(triageOutcomes, value);
/** Outcomes that would keep a question away from a human, so they need evidence. */
export const citesEvidence = (outcome: TriageOutcome) =>
  outcome === "already_answered" || outcome === "answerable_by_docs";
export interface ChatMessage {
  id: string;
  speaker: string;
  timestamp: string;
  content: string;
}
export interface DocSnippet {
  id: string;
  title: string;
  content: string;
  sourceUrl?: string;
}
export type EvidenceKind = "message" | "doc";
/** One auditable thing Jev is allowed to point at, rendered verbatim in the UI. */
export interface EvidenceCandidate {
  id: string;
  kind: EvidenceKind;
  label: string;
  excerpt: string;
  score: number;
  sourceUrl?: string;
}
export interface TriageInput {
  question: string;
  transcript: string;
  format: string;
  docs: string;
  model: string;
  historyLimit: number;
}
export interface TriageRequest {
  payload: RunPayload;
  candidates: EvidenceCandidate[];
  history: ChatMessage[];
  snippets: DocSnippet[];
}
export interface JevAnswer {
  type: string;
  noul?: number;
  choice?: string;
  probabilities?: Record<string, number>;
  confidence?: number;
}
export interface JevResponse {
  answers: Record<string, JevAnswer>;
}
export interface TriageDecision {
  /** What the gate acts on, after the safe fallback is applied. */
  outcome: TriageOutcome;
  /** What Jev chose, kept even when the gate overrides it. */
  proposed: TriageOutcome | null;
  confidence: number | null;
  probabilities: Record<string, number>;
  evidence: EvidenceCandidate | null;
  suggestedReply: string;
  overridden: boolean;
  reason: string;
}
export interface BatchRow {
  index: number;
  message: ChatMessage;
  candidates: EvidenceCandidate[];
  response?: JevResponse;
  error?: string;
}
export interface AnnoyanceTally {
  total: number;
  avoidable: number;
  needsHuman: number;
  unclear: number;
  ratio: number;
  label: string;
}
