/**
 * Labeled mock transport. It returns the scripted noul probabilities stored on
 * the matching fixture. These are demonstration values, not measurements of
 * Jev; every receipt produced through it should carry `source: "mock"`.
 *
 * The lookup key is the proposal inside the request state. Labels stay on the
 * fixture side of this table and are never added to the payload.
 *
 * Extracted from TypeSafeAI/typesafe-playground `lib/harness/mock.ts` at
 * 6fe5967dc020521a0731682b06c4d8eeeab95ffb.
 */
import type { RunPayload } from "../contract/payload";
import { REVIEW_QUESTION_IDS, type Fixture, type JevTransport, type MockAnswers } from "../contract/types";

export const MOCK_MODEL = "mock-scripted";

const key = (proposal: unknown) => JSON.stringify(proposal);

export function createMockTransport(
  fixtures: Fixture[],
  options: { failFor?: (payload: RunPayload) => string | null } = {},
): JevTransport<RunPayload> {
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
    if (!scripted) throw Error("Mock transport has no scripted answers for this proposal.");
    return {
      model: MOCK_MODEL,
      answers: Object.fromEntries(
        REVIEW_QUESTION_IDS.map((id) => [id, { type: "noul", noul: scripted[id] }]),
      ),
    };
  };
}
