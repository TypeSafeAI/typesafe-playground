/**
 * Labeled mock transport. It returns the scripted noul probabilities stored on
 * the matching fixture. These are demonstration values, not measurements of
 * Jev; every receipt produced through it carries `source: "mock"`.
 */
import type { RunPayload } from "../api";
import {
  REVIEW_QUESTION_IDS,
  type Fixture,
  type JevTransport,
  type MockAnswers,
} from "./types";

export const MOCK_MODEL = "mock-scripted";

const key = (proposal: unknown) => JSON.stringify(proposal);

export function createMockTransport(
  fixtures: Fixture[],
  options: { failFor?: (payload: RunPayload) => string | null } = {},
): JevTransport {
  const table = new Map<string, MockAnswers>();
  for (const fixture of fixtures)
    for (const arm of ["good", "bad"] as const) {
      const proposal = fixture.proposals[arm];
      table.set(
        key({
          tool: proposal.tool,
          path: proposal.path,
          ...(proposal.patch !== undefined ? { patch: proposal.patch } : {}),
          rationale: proposal.rationale,
          evidence: proposal.evidence,
        }),
        fixture.mock[arm],
      );
    }
  return async (payload, signal) => {
    if (signal?.aborted) throw Error("Mock transport cancelled.");
    const failure = options.failFor?.(payload);
    if (failure) throw Error(failure);
    const state = payload.state as { proposal?: unknown } | null;
    const scripted = table.get(key(state?.proposal));
    if (!scripted)
      throw Error("Mock transport has no scripted answers for this proposal.");
    return {
      model: MOCK_MODEL,
      answers: Object.fromEntries(
        REVIEW_QUESTION_IDS.map((id) => [id, { type: "noul", noul: scripted[id] }]),
      ),
    };
  };
}
