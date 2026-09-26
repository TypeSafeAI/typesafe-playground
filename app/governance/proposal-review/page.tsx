import { pageMetadata } from "../../../lib/social";
import { loadFixtures } from "../../../lib/harness/load";
import { ProposalReview, type ClientFixture } from "../../../components/proposal-review";
export const metadata = pageMetadata("proposal-review");
export default function Page() {
  // Fixtures are read on the server. The browser only ever names one by id;
  // the scripted mock probabilities stay server-side so the UI cannot show
  // them as if they were measurements.
  const fixtures: ClientFixture[] = loadFixtures().map(
    ({ mock: _mock, ...fixture }) => fixture,
  );
  return <ProposalReview fixtures={fixtures} />;
}
