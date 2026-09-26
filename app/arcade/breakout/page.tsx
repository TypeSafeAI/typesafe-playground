import { ArcadeLab } from "../../../components/ArcadeLab";
import { pageMetadata } from "../../../lib/social";
import "../arcade.css";
export const metadata = pageMetadata("breakout");
export default function Page() {
  return (
    <ArcadeLab
      gameId="breakout"
      title="Jev plays Breakout"
      description="Three paddle moves per frame. The game predicts where the ball will land; Jev keeps the paddle under it."
    />
  );
}
