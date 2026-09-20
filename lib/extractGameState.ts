import { DOOM_FOV } from "./doom-camera";
import type { GameFeatures, GameState, Point } from "../types/doom";
import {
  angleDifference,
  distance,
  isBlocked,
  isInFiringCone,
  lineOfSight,
  MAX_AMMO,
} from "./gameLoop";
export function extractGameState(
  state: GameState,
  chaos = false,
): GameFeatures {
  const p = state.player;
  const bearing = (q: Point): "left" | "center" | "right" => {
    const a = angleDifference(Math.atan2(q.y - p.y, q.x - p.x), p.angle);
    return isInFiringCone(p, q) ? "center" : a < 0 ? "left" : "right";
  };
  const visible = (q: Point) =>
    distance(p, q) <= 8 &&
    Math.abs(angleDifference(Math.atan2(q.y - p.y, q.x - p.x), p.angle)) <=
      DOOM_FOV / 2 &&
    lineOfSight(state, p, q);
  const enemy = state.enemies
    .filter((e) => e.health > 0 && visible(e))
    .sort((a, b) => distance(p, a) - distance(p, b))[0];
  const item = state.items
    .filter((i) => !i.collected && (visible(i) || distance(p, i) <= 1.1))
    .sort((a, b) => distance(p, a) - distance(p, b))[0];
  const blocked = (offset: number) =>
    isBlocked(
      state,
      p.x + Math.cos(p.angle + offset) * 0.7,
      p.y + Math.sin(p.angle + offset) * 0.7,
    );
  const ahead =
    state.map[Math.floor(p.y + Math.sin(p.angle) * 0.85)]?.[
      Math.floor(p.x + Math.cos(p.angle) * 0.85)
    ];
  return {
    enemy_visible: !!enemy,
    enemy_distance: chaos
      ? "unknown"
      : !enemy
        ? "none"
        : distance(p, enemy) <= 2
          ? "near"
          : distance(p, enemy) <= 5
            ? "medium"
            : "far",
    enemy_angle_degrees: enemy
      ? (angleDifference(Math.atan2(enemy.y - p.y, enemy.x - p.x), p.angle) *
          180) /
        Math.PI
      : null,
    enemy_bearing: enemy ? bearing(enemy) : "none",
    health_pct: p.health,
    ammo_pct: Math.round((p.ammo / MAX_AMMO) * 100),
    wall_ahead: blocked(0),
    wall_left: blocked(-Math.PI / 2),
    wall_right: blocked(Math.PI / 2),
    door_ahead: ahead === "D",
    item_visible: !!item,
    item_nearby: !!item && distance(p, item) <= 1.1,
    item_kind: item?.kind || "none",
    item_bearing: item ? bearing(item) : "none",
    last_action: state.lastAction,
  };
}
