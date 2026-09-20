import { CleanRoomLab } from "../../components/CleanRoomLab";
import { pageMetadata } from "../../lib/social";
import "./clean-room.css";
export const metadata = pageMetadata("clean-room");
export default function Page() {
  return <CleanRoomLab />;
}
