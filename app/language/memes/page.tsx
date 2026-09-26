import { pageMetadata } from "../../../lib/social";
import { Memes } from "../../../components/memes";
export default function Page() {
  return <Memes />;
}

export const metadata = pageMetadata("memes");
