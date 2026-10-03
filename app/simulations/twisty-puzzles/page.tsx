import { TwistyPuzzleLab } from "../../../components/TwistyPuzzleLab";
import { pageMetadata } from "../../../lib/social";
import "./twisty.css";
export const metadata = pageMetadata("twisty-puzzles");
export default function Page() {
  return <TwistyPuzzleLab />;
}
