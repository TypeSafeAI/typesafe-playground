import type { Fixture, Proposal, Proposer, ReviewArm } from "./types";

/**
 * Week 1 proposer: returns the fixture's scripted proposal for the arm. A live
 * proposer (an OpenAI-compatible endpoint, server-side, off by default) is a
 * later, optional addition and is not present at this revision.
 */
export class FixtureProposer implements Proposer {
  readonly name = "fixture";
  async propose(fixture: Fixture, arm: ReviewArm): Promise<Proposal> {
    const proposal = fixture.proposals[arm];
    if (!proposal) throw Error(`Fixture ${fixture.id} has no ${arm} proposal.`);
    return structuredClone(proposal);
  }
}
