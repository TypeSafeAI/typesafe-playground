export const DOOM_ACTIONS = [
  "move_forward",
  "move_backward",
  "strafe_left",
  "strafe_right",
  "turn_left",
  "turn_right",
  "shoot",
  "open_door",
  "use_item",
  "idle",
] as const;
export type DoomAction = (typeof DOOM_ACTIONS)[number];
export type ControlMode = "human" | "jev" | "random";
export interface Point {
  x: number;
  y: number;
}
export interface Enemy extends Point {
  id: string;
  health: number;
}
export interface GameItem extends Point {
  id: string;
  kind: "health" | "ammo";
  collected: boolean;
}
export interface GameState {
  seed: number;
  tick: number;
  map: string[];
  player: Point & { angle: number; health: number; ammo: number };
  enemies: Enemy[];
  items: GameItem[];
  kills: number;
  shots: number;
  hits: number;
  damageTaken: number;
  actions: number;
  status: "playing" | "won" | "dead" | "timeout";
  lastAction: DoomAction;
  shotRay?: { from: Point; to: Point };
  damageFlash: boolean;
}
export interface GameFeatures {
  enemy_visible: boolean;
  enemy_distance: "near" | "medium" | "far" | "unknown" | "none";
  enemy_angle_degrees: number | null;
  enemy_bearing: "left" | "center" | "right" | "none";
  health_pct: number;
  ammo_pct: number;
  wall_ahead: boolean;
  wall_left: boolean;
  wall_right: boolean;
  door_ahead: boolean;
  item_visible: boolean;
  item_nearby: boolean;
  item_kind: "health" | "ammo" | "none";
  item_bearing: "left" | "center" | "right" | "none";
  last_action: DoomAction;
}
export interface GameFrame {
  tick: number;
  features: GameFeatures;
}
export interface ActionDecision {
  tick: number;
  action: DoomAction;
  confidence: number | null;
  probabilities: Partial<Record<DoomAction, number>>;
  error?: string;
}
export interface DecisionBatch {
  decisions: ActionDecision[];
  latencyMs: number;
}
export interface GameTrial {
  classificationsPerSecond: number | null;
  mode: ControlMode;
  chaos: boolean;
  seed: number;
  kills: number;
  damageTaken: number;
  seconds: number;
  accuracy: number | null;
  actions: number;
  outcome: GameState["status"] | "stopped";
}
