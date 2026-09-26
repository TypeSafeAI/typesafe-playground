import { pageMetadata } from "../../../lib/social";
import { PullRequestReview } from "../../../components/pr-review";
export const metadata = pageMetadata("pr-review");
export default function Page() {
  return <PullRequestReview />;
}
