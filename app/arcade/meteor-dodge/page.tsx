import { ArcadeLab } from "../../../components/ArcadeLab";
import { pageMetadata } from "../../../lib/social";
import "../arcade.css";
export const metadata = pageMetadata("meteor-dodge");
export default function Page() {
  return (
    <ArcadeLab
      gameId="meteor-dodge"
      title="Jev plays Meteor dodge"
      description="Five lanes of falling rock. The game counts how far each lane stays clear; Jev changes lanes or holds."
    />
  );
}
