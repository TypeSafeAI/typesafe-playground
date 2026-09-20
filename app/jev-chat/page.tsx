import { JevChatLab } from "../../components/JevChatLab";
import { pageMetadata } from "../../lib/social";
import "./chat-studio.css";
export const metadata = pageMetadata("jev-chat");
export default function Page() {
  return <JevChatLab />;
}
