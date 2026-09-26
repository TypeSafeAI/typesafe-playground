import { BrowserAgentLab } from "../../../components/BrowserAgentLab";
import "./browser-studio.css";
import { pageMetadata } from "../../../lib/social";
export const metadata = pageMetadata("jev-browser-agent");
export default function Page() {
  return (
    <>
      <BrowserAgentLab />
    </>
  );
}
