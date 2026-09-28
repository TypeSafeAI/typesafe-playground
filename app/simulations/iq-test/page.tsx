import { IqTestLab } from "../../../components/IqTestLab";
import { pageMetadata } from "../../../lib/social";
import "./iq-test.css";

export const metadata = pageMetadata("iq-test");
export default function Page() {
  return <IqTestLab />;
}
