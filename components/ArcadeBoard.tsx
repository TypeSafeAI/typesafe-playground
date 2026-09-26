"use client";
import type { CSSProperties } from "react";
import type { ArcadeGameId } from "../lib/arcade/types";
import { SNAKE_SIZE, type SnakeState } from "../lib/arcade/snake";
import {
  BREAKOUT_HEIGHT,
  BREAKOUT_WIDTH,
  PADDLE_ROW,
  PADDLE_WIDTH,
  landingColumn,
  type BreakoutState,
} from "../lib/arcade/breakout";
import {
  METEOR_LANES,
  METEOR_VIEW,
  type MeteorState,
} from "../lib/arcade/meteor";

const CELL = 10;

/** Draws one game state. Purely presentational: it never changes the game. */
export function ArcadeBoard({
  game,
  state,
}: {
  game: ArcadeGameId;
  state: unknown;
}) {
  if (game === "snake") return <SnakeBoard state={state as SnakeState} />;
  if (game === "breakout")
    return <BreakoutBoard state={state as BreakoutState} />;
  return <MeteorBoard state={state as MeteorState} />;
}

function SnakeBoard({ state }: { state: SnakeState }) {
  const [hx, hy] = state.body[0];
  const label = `Snake board, ${SNAKE_SIZE} by ${SNAKE_SIZE}. Head at column ${hx}, row ${hy}, heading ${state.heading}, length ${state.body.length}.${
    state.apple
      ? ` Apple at column ${state.apple[0]}, row ${state.apple[1]}.`
      : ""
  }`;
  return (
    <svg
      className="arcade-board"
      style={
        {
          "--board-ratio": `${SNAKE_SIZE * CELL} / ${SNAKE_SIZE * CELL}`,
        } as CSSProperties
      }
      viewBox={`0 0 ${SNAKE_SIZE * CELL} ${SNAKE_SIZE * CELL}`}
      role="img"
      aria-label={label}
    >
      <rect
        className="arcade-field"
        width={SNAKE_SIZE * CELL}
        height={SNAKE_SIZE * CELL}
      />
      {Array.from({ length: SNAKE_SIZE * SNAKE_SIZE }, (_, i) => (
        <circle
          key={i}
          className="arcade-dot"
          cx={(i % SNAKE_SIZE) * CELL + CELL / 2}
          cy={Math.floor(i / SNAKE_SIZE) * CELL + CELL / 2}
          r={0.6}
        />
      ))}
      {state.apple && (
        <circle
          className="arcade-apple"
          cx={state.apple[0] * CELL + CELL / 2}
          cy={state.apple[1] * CELL + CELL / 2}
          r={CELL * 0.32}
        />
      )}
      {state.body
        .slice()
        .reverse()
        .map(([x, y], i, all) => {
          const head = i === all.length - 1;
          return (
            <rect
              key={`${x},${y},${i}`}
              className={head ? "arcade-snake-head" : "arcade-snake"}
              x={x * CELL + 1}
              y={y * CELL + 1}
              width={CELL - 2}
              height={CELL - 2}
              rx={head ? 3 : 2}
            />
          );
        })}
      {state.ended && state.ended !== "limit" && (
        <rect
          className="arcade-crash"
          x={hx * CELL}
          y={hy * CELL}
          width={CELL}
          height={CELL}
        />
      )}
    </svg>
  );
}

function BreakoutBoard({ state }: { state: BreakoutState }) {
  const landing = landingColumn(state.ball);
  const label = `Breakout field. Ball at column ${state.ball.x}, row ${state.ball.y}, moving ${
    state.ball.dy === -1 ? "up" : "down"
  }. Paddle covers columns ${state.paddle} to ${state.paddle + PADDLE_WIDTH - 1}. ${state.bricks.length} bricks left, ${state.lives} lives.`;
  return (
    <svg
      className="arcade-board"
      style={
        {
          "--board-ratio": `${BREAKOUT_WIDTH * CELL} / ${BREAKOUT_HEIGHT * CELL}`,
        } as CSSProperties
      }
      viewBox={`0 0 ${BREAKOUT_WIDTH * CELL} ${BREAKOUT_HEIGHT * CELL}`}
      role="img"
      aria-label={label}
    >
      <rect
        className="arcade-field"
        width={BREAKOUT_WIDTH * CELL}
        height={BREAKOUT_HEIGHT * CELL}
      />
      {state.bricks.map((key) => {
        const [x, y] = key.split(",").map(Number);
        return (
          <rect
            key={key}
            className={`arcade-brick row-${y}`}
            x={x * CELL + 0.6}
            y={y * CELL + 1.5}
            width={CELL - 1.2}
            height={CELL - 3}
            rx={1}
          />
        );
      })}
      {landing !== null && (
        <rect
          className="arcade-landing"
          x={landing * CELL}
          y={PADDLE_ROW * CELL}
          width={CELL}
          height={CELL}
        />
      )}
      <rect
        className="arcade-paddle"
        x={state.paddle * CELL + 0.5}
        y={PADDLE_ROW * CELL + 3}
        width={PADDLE_WIDTH * CELL - 1}
        height={4}
        rx={2}
      />
      {state.lives > 0 && (
        <circle
          className="arcade-ball"
          cx={state.ball.x * CELL + CELL / 2}
          cy={state.ball.y * CELL + CELL / 2}
          r={CELL * 0.28}
        />
      )}
    </svg>
  );
}

function MeteorBoard({ state }: { state: MeteorState }) {
  // Row 0 arrives next, so it is drawn just above the ship; farther rows sit
  // higher. The ship occupies the bottom row.
  const height = (METEOR_VIEW + 1) * CELL;
  const label = `Meteor field, ${METEOR_LANES} lanes. Ship in lane ${state.ship}. Next row: ${
    state.rows[0]
      .map((m, lane) => (m ? `meteor in lane ${lane}` : null))
      .filter(Boolean)
      .join(", ") || "clear"
  }.`;
  return (
    <svg
      className="arcade-board"
      style={
        {
          "--board-ratio": `${METEOR_LANES * CELL} / ${height}`,
        } as CSSProperties
      }
      viewBox={`0 0 ${METEOR_LANES * CELL} ${height}`}
      role="img"
      aria-label={label}
    >
      <rect
        className="arcade-field"
        width={METEOR_LANES * CELL}
        height={height}
      />
      {Array.from({ length: METEOR_LANES - 1 }, (_, i) => (
        <line
          key={i}
          className="arcade-lane"
          x1={(i + 1) * CELL}
          x2={(i + 1) * CELL}
          y1={0}
          y2={height}
        />
      ))}
      {state.rows.map((row, i) =>
        row.map((meteor, lane) =>
          meteor ? (
            <circle
              key={`${i}-${lane}`}
              className={i === 0 ? "arcade-meteor next" : "arcade-meteor"}
              cx={lane * CELL + CELL / 2}
              cy={(METEOR_VIEW - 1 - i) * CELL + CELL / 2}
              r={CELL * 0.34}
            />
          ) : null,
        ),
      )}
      <path
        className={state.ended === "hit" ? "arcade-ship hit" : "arcade-ship"}
        d={`M ${state.ship * CELL + CELL / 2} ${METEOR_VIEW * CELL + 1.5} L ${
          state.ship * CELL + CELL - 1.5
        } ${height - 1.5} L ${state.ship * CELL + 1.5} ${height - 1.5} Z`}
      />
    </svg>
  );
}
