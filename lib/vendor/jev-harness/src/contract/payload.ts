/**
 * Jev request payload types and the last validation/serialization step before
 * an injected transport. Pure: no fetch, no fs, no environment.
 *
 * `Question` and `RunPayload` mirror TypeSafeAI/typesafe-playground
 * `lib/api.ts` at 6fe5967dc020521a0731682b06c4d8eeeab95ffb, defined locally so
 * nothing here imports the playground. `validateReviewPayload` is adapted from
 * that file's `validatePayload` with deliberate differences:
 *
 * - Explicitly supplied `noul` criteria (`{ true, false }`) are preserved, per
 *   the official Noul contract (docs/hardening/07-noul-contract.md). The
 *   playground dropped them. Malformed criteria fail instead of being dropped.
 * - Only the exact `JEV_MODEL` pin is accepted. Missing models, aliases, and
 *   other versions throw instead of defaulting to the playground's alias.
 * - Question types must be exact strings from the closed set, without coercion.
 */
import { dataArray, dataRecord } from "./input";
import { JEV_MODEL } from "./types";

export type QuestionType = "noul" | "choice" | "score";

/** Noul criteria describe what a true and a false answer mean. */
export interface NoulCriteria {
  true: string;
  false: string;
}

export type Question =
  | { type: "noul"; instructions: string; criteria?: NoulCriteria }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

export interface RunPayload {
  model: string;
  state: unknown;
  questions: Record<string, Question>;
}

const nonempty = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

function noulCriteria(value: unknown): NoulCriteria {
  const criteria = dataRecord(value);
  if (
    !criteria ||
    Object.keys(criteria).length !== 2 ||
    !nonempty(criteria.true) ||
    !nonempty(criteria.false)
  )
    throw Error("Noul criteria need exactly a nonempty `true` and `false` description.");
  return { true: criteria.true.trim(), false: criteria.false.trim() };
}

/**
 * Returns a fresh payload with trimmed question fields, or throws. The result
 * is what a transport receives; nothing is silently dropped except surrounding
 * whitespace.
 */
export function validateReviewPayload(value: unknown): RunPayload {
  const payload = dataRecord(value);
  if (!payload) throw Error("Request must be an object.");
  if (payload.model !== JEV_MODEL)
    throw Error(`Request needs the exact pinned model ${JEV_MODEL}.`);
  const state = payload.state;
  if (!(nonempty(state) || dataRecord(state) !== null || dataArray(state) !== null))
    throw Error("Add source text or structured state.");
  const input = dataRecord(payload.questions);
  if (!input || !Object.keys(input).length || Object.keys(input).length > 100)
    throw Error("Use between 1 and 100 questions.");
  // Collected as entries so a key such as `__proto__` stays an own property.
  const questions = new Map<string, Question>();
  for (const [key, raw] of Object.entries(input)) {
    const q = dataRecord(raw);
    if (
      !nonempty(key) ||
      questions.has(key.trim()) ||
      !q ||
      !nonempty(q.instructions) ||
      typeof q.type !== "string" ||
      !["noul", "choice", "score"].includes(q.type)
    )
      throw Error("Every question needs a unique name, valid type, and instructions.");
    const instructions = q.instructions.trim();
    if (q.type === "noul") {
      questions.set(
        key.trim(),
        q.criteria === undefined
          ? { type: "noul", instructions }
          : { type: "noul", instructions, criteria: noulCriteria(q.criteria) },
      );
    } else if (q.type === "choice") {
      const candidates = dataRecord(q.criteria);
      if (
        !candidates ||
        Object.keys(candidates).length < 2 ||
        Object.entries(candidates).some(([k, v]) => !nonempty(k) || !nonempty(v))
      )
        throw Error("Choice questions need at least two named candidates.");
      const entries = Object.entries(candidates).map(([k, v]) => [k.trim(), (v as string).trim()] as const);
      if (new Set(entries.map((e) => e[0])).size !== entries.length)
        throw Error("Candidate names must be unique.");
      questions.set(key.trim(), { type: "choice", instructions, criteria: Object.fromEntries(entries) });
    } else {
      const levels = dataArray(q.criteria);
      if (!levels || levels.length < 2 || !levels.every(nonempty))
        throw Error("Score questions need at least two levels.");
      questions.set(key.trim(), { type: "score", instructions, criteria: levels.map((v) => v.trim()) });
    }
  }
  return { model: payload.model, state, questions: Object.fromEntries(questions) };
}
