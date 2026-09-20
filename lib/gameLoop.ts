import type { DoomAction, GameState, Point } from "../types/doom";
export const TICK_MS = 200,
  MAX_TICKS = 450,
  MAX_AMMO = 40;
export const ARENA_MAP = [
  "###############",
  "#......#......#",
  "#......D......#",
  "#..##..#..##..#",
  "#......#......#",
  "#......D......#",
  "#..##..#..##..#",
  "#......#......#",
  "#......D......#",
  "#......#......#",
  "###############",
];
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const angleDifference = (a: number, b: number) =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));
export function isInFiringCone(
  player: Point & { angle: number },
  target: Point,
) {
  return (
    Math.abs(
      angleDifference(
        Math.atan2(target.y - player.y, target.x - player.x),
        player.angle,
      ),
    ) <= Math.atan2(0.4, distance(player, target))
  );
}
export function isBlocked(state: GameState, x: number, y: number) {
  const tile = state.map[Math.floor(y)]?.[Math.floor(x)];
  return !tile || tile === "#" || tile === "D";
}
export function lineOfSight(state: GameState, a: Point, b: Point) {
  const steps = Math.max(1, Math.ceil(distance(a, b) * 12));
  for (let i = 1; i <= steps; i++)
    if (
      isBlocked(
        state,
        a.x + ((b.x - a.x) * i) / steps,
        a.y + ((b.y - a.y) * i) / steps,
      )
    )
      return false;
  return true;
}
export function createGame(seed = 7): GameState {
  const clean = Number.isSafeInteger(seed) ? Math.abs(seed) % 10000 : 7;
  return {
    seed: clean,
    tick: 0,
    map: [...ARENA_MAP],
    player: { x: 2.5, y: 2.5, angle: 0, health: 100, ammo: 32 },
    enemies: [
      { id: "e1", x: 5.5, y: 2.5, health: 40 },
      { id: "e2", x: 5.5, y: 5.5, health: 40 },
      { id: "e3", x: 3.5, y: 8.5, health: 40 },
      { id: "e4", x: 11.5, y: 2.5, health: 40 },
      { id: "e5", x: 12.5, y: 8.5, health: 40 },
    ],
    items: [
      { id: "h1", x: 2.5, y: 4.5, kind: "health", collected: false },
      { id: "a1", x: 5.5, y: 7.5, kind: "ammo", collected: false },
      { id: "h2", x: 12.5, y: 7.5, kind: "health", collected: false },
      { id: "a2", x: 11.5, y: 4.5, kind: "ammo", collected: false },
    ],
    kills: 0,
    shots: 0,
    hits: 0,
    damageTaken: 0,
    actions: 0,
    status: "playing",
    lastAction: "idle",
    damageFlash: false,
  };
}
export function stepGame(
  previous: GameState,
  action: DoomAction,
  turnRadians = Math.PI / 8,
): GameState {
  const turn = Number.isFinite(turnRadians)
    ? Math.min(Math.PI / 8, Math.max(0, turnRadians))
    : Math.PI / 8;
  if (previous.status !== "playing") return previous;
  const s: GameState = {
    ...previous,
    tick: previous.tick + 1,
    map: [...previous.map],
    player: { ...previous.player },
    enemies: previous.enemies.map((e) => ({ ...e })),
    items: previous.items.map((i) => ({ ...i })),
    lastAction: action,
    shotRay: undefined,
    damageFlash: false,
  };
  const p = s.player;
  if (action !== "idle") s.actions++;
  if (action === "turn_left")
    p.angle = (p.angle - turn + Math.PI * 2) % (Math.PI * 2);
  if (action === "turn_right") p.angle = (p.angle + turn) % (Math.PI * 2);
  const movement: Partial<Record<DoomAction, number>> = {
    move_forward: 0,
    move_backward: Math.PI,
    strafe_left: -Math.PI / 2,
    strafe_right: Math.PI / 2,
  };
  const offset = movement[action];
  if (offset !== undefined) {
    const x = p.x + Math.cos(p.angle + offset) * 0.34,
      y = p.y + Math.sin(p.angle + offset) * 0.34;
    // Player has a small collision radius; sliding does not pass through corners.
    const clear = (cx: number, cy: number) =>
      [-0.18, 0.18].every((dx) =>
        [-0.18, 0.18].every((dy) => !isBlocked(s, cx + dx, cy + dy)),
      );
    if (clear(x, p.y)) p.x = x;
    if (clear(p.x, y)) p.y = y;
  }
  if (action === "open_door") {
    const x = Math.floor(p.x + Math.cos(p.angle) * 0.85),
      y = Math.floor(p.y + Math.sin(p.angle) * 0.85);
    if (s.map[y]?.[x] === "D")
      s.map[y] = s.map[y].slice(0, x) + "." + s.map[y].slice(x + 1);
  }
  if (action === "use_item") {
    const item = s.items
      .filter((i) => !i.collected && distance(p, i) <= 1.1)
      .sort((a, b) => distance(p, a) - distance(p, b))[0];
    if (item) {
      item.collected = true;
      if (item.kind === "health") p.health = Math.min(100, p.health + 35);
      else p.ammo = Math.min(MAX_AMMO, p.ammo + 20);
    }
  }
  if (action === "shoot" && p.ammo > 0) {
    p.ammo--;
    s.shots++;
    const target = s.enemies
      .filter(
        (e) =>
          e.health > 0 &&
          distance(p, e) <= 8 &&
          isInFiringCone(p, e) &&
          lineOfSight(s, p, e),
      )
      .sort((a, b) => distance(p, a) - distance(p, b))[0];
    let end: Point = { x: p.x, y: p.y };
    for (let d = 0.1; d <= 8; d += 0.1) {
      const q = {
        x: p.x + Math.cos(p.angle) * d,
        y: p.y + Math.sin(p.angle) * d,
      };
      if (isBlocked(s, q.x, q.y)) break;
      end = q;
    }
    s.shotRay = {
      from: { x: p.x, y: p.y },
      to: target ? { x: target.x, y: target.y } : end,
    };
    if (target) {
      target.health -= 20;
      s.hits++;
      if (target.health <= 0) s.kills++;
    }
  }
  for (const e of s.enemies) {
    if (e.health <= 0) continue;
    const d = distance(p, e);
    if (d < 5 && lineOfSight(s, e, p) && (s.tick + s.seed) % 6 === 0) {
      const damage = Math.min(p.health, 8);
      p.health -= damage;
      s.damageTaken += damage;
      s.damageFlash = true;
    }
    if (d > 0.8 && d < 10 && lineOfSight(s, e, p) && s.tick % 2 === 0) {
      const dx = ((p.x - e.x) / d) * 0.18,
        dy = ((p.y - e.y) / d) * 0.18;
      if (!isBlocked(s, e.x + dx, e.y)) e.x += dx;
      if (!isBlocked(s, e.x, e.y + dy)) e.y += dy;
    }
  }
  if (p.health <= 0) s.status = "dead";
  else if (s.enemies.every((e) => e.health <= 0)) s.status = "won";
  else if (s.tick >= MAX_TICKS) s.status = "timeout";
  return s;
}
