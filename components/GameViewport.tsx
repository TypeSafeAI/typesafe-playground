import { DoomScene } from "./DoomScene";
import { DoomMiniMap } from "./DoomMiniMap";
import type { DoomAction, GameState } from "../types/doom";
import { extractGameState } from "../lib/extractGameState";
import { TICK_MS } from "../lib/gameLoop";
export function GameViewport({
  game,
  active,
  mode,
  pending = false,
  onKeyDown,
  onKeyUp,
  onBlur,
  onAction,
}: {
  game: GameState;
  active: boolean;
  mode: string;
  pending?: boolean;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onKeyUp: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onBlur: () => void;
  onAction: (action: DoomAction) => void;
}) {
  const p = game.player;
  const perception = extractGameState(game);
  const locked = perception.enemy_bearing === "center";
  return (
    <div
      className="doom-viewport"
      data-player-x={p.x}
      data-player-y={p.y}
      data-player-angle={p.angle}
      tabIndex={0}
      role="application"
      aria-label="Maze shooter. Focus here for keyboard controls."
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={onBlur}
    >
      <div className="doom-screen-top">
        <span>JEV / SECTOR 01</span>
        <span>
          {active ? "LIVE" : "PAUSED"} · {mode.toUpperCase()}
        </span>
      </div>
      <DoomScene game={game} active={active} mode={mode} onAction={onAction} />
      <div
        className={"doom-tactical-strip" + (mode === "jev" ? " is-jev" : "")}
      >
        {mode === "jev" && (
          <section
            className="doom-pilot"
            aria-label="Jev pilot telemetry"
            data-target={
              locked
                ? "locked"
                : perception.enemy_visible
                  ? "tracking"
                  : "searching"
            }
          >
            <div className="doom-pilot-heading">
              <span className={active ? "pilot-light active" : "pilot-light"} />
              <strong>JEV PILOT</strong>
              <span>
                {active ? (pending ? "DECIDING" : "EXECUTING") : "STANDBY"}
              </span>
            </div>
            <div className="doom-pilot-action">
              {game.lastAction.replaceAll("_", " ")}
            </div>
            <div className="doom-aim-caption">
              <strong>
                {locked
                  ? "Target aligned"
                  : perception.enemy_visible
                    ? "Acquiring target"
                    : "Scanning sector"}
              </strong>
              <span>
                {perception.enemy_angle_degrees === null
                  ? "No visible target"
                  : `${Math.abs(perception.enemy_angle_degrees).toFixed(1)}° ${perception.enemy_bearing}`}
              </span>
            </div>
            <div className="doom-aim-rail" aria-hidden="true">
              <span />
              {perception.enemy_angle_degrees !== null && (
                <i
                  style={{
                    left: `${50 + Math.max(-50, Math.min(50, perception.enemy_angle_degrees))}%`,
                  }}
                />
              )}
            </div>
            <p>
              {!active
                ? "Start the arena to give Jev control."
                : pending
                  ? "Awaiting Jev · world held steady"
                  : "One decision → one movement or aim action"}
            </p>
            <small>
              X {p.x.toFixed(2)} · Y {p.y.toFixed(2)} · HEADING{" "}
              {Math.round((p.angle * 180) / Math.PI)}°
            </small>
          </section>
        )}
        <details
          key={mode}
          open={mode === "jev"}
          className="doom-minimap"
          onKeyDown={(e) => e.stopPropagation()}
        >
          <summary>Tactical map</summary>
          <DoomMiniMap game={game} />
        </details>
      </div>

      {game.status !== "playing" && (
        <div className="doom-game-over">
          <strong>
            {game.status === "won"
              ? "SECTOR CLEARED"
              : game.status === "dead"
                ? "YOU DIED"
                : "TIME LIMIT"}
          </strong>
          <span>
            {game.kills} kills · {((game.tick * TICK_MS) / 1000).toFixed(1)}s
            survived
          </span>
        </div>
      )}
      <div className="doom-screen-hud">
        <span>
          HEALTH <strong>{p.health}</strong>
        </span>
        <span>
          AMMO <strong>{p.ammo}</strong>
        </span>
        <span>
          KILLS <strong>{game.kills}/5</strong>
        </span>
      </div>
    </div>
  );
}
