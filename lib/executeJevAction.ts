import { extractGameState } from "./extractGameState";
import { stepGame } from "./gameLoop";
import type { DoomAction, GameState } from "../types/doom";
/** Jev chooses the direction. Visible geometry only bounds that turn's size. */
export function executeJevAction(
  state: GameState,
  action: DoomAction,
): GameState {
  const angle = extractGameState(state).enemy_angle_degrees;
  const towardTarget =
    angle !== null &&
    ((action === "turn_left" && angle < 0) ||
      (action === "turn_right" && angle > 0));
  return stepGame(
    state,
    action,
    towardTarget
      ? Math.min(Math.PI / 8, (Math.abs(angle!) * Math.PI) / 180)
      : Math.PI / 8,
  );
}
