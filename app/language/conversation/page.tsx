import { pageMetadata } from "../../../lib/social";
import { Conversation } from "../../../components/conversation";
export default function Page() {
  return <Conversation />;
}

export const metadata = pageMetadata("conversation");
