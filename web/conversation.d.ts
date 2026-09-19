export interface Input {
  transcript: string;
  format: string;
  policy: string;
  model: string;
}
export interface Message {
  speaker: string | null;
  timestamp: string | null;
  content: string;
}
export interface Candidate {
  variant: string;
  speaker?: string;
  payload: unknown;
}
export interface Answer {
  type: string;
  noul?: number;
  choice?: string;
  probabilities?: Record<string, number>;
  confidence?: number;
}
export interface Response {
  answers: Record<string, Answer>;
}
export interface Row {
  message?: Message;
  speaker?: string;
  variant: string;
  response?: Response;
  error?: string;
  expected?: string;
  predicted?: string;
}
export const frames: Record<string, string>;
export function parseTranscript(
  text: string,
  format?: string,
): { format: string; messages: Message[]; ignoredStageNotices: number };
export function buildRequest(input: Input, context: boolean): unknown;
export function buildCandidates(input: Input): Candidate[];
export function pickWinners(
  results: Row[],
  threshold: number,
): { status: string; winners: Row[] };
export function gate(answer: Answer | undefined, threshold: number): string;
export function runBatches<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  options?: {
    signal?: AbortSignal;
    onProgress?: (progress: {
      completed: number;
      total: number;
      batch: number;
      batches: number;
    }) => void;
  },
): Promise<PromiseSettledResult<R>[]>;
export function summarize(
  rows: Row[],
  variant: string,
): {
  total: number;
  correct: number;
  matrix: Record<string, Record<string, number>>;
};
