import { TrolleyLab } from "../../../components/TrolleyLab";
import { pageMetadata } from "../../../lib/social";
import "./trolley.css";

export const metadata = pageMetadata("trolley-problems");
export default function Page() {
  return <TrolleyLab />;
}
