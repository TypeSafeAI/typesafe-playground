import { ArcadeLab } from "../../../components/ArcadeLab";
import { pageMetadata } from "../../../lib/social";
import "../arcade.css";
export const metadata = pageMetadata("snake");
export default function Page() {
  return (
    <ArcadeLab
      gameId="snake"
      title="Jev plays Snake"
      description="Four directions, one cell per move. The game computes what each direction would do; Jev picks one and chases the apple."
    />
  );
}
