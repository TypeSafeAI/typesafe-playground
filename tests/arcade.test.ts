import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCADE_GAMES, playOut, randomBaseline } from "../lib/arcade";
import {
  buildArcadePayload,
  forcedAction,
  resolveArcadeDecision,
} from "../lib/arcade/jev";
import { snake, type SnakeState } from "../lib/arcade/snake";
import {
  breakout,
  landingColumn,
  PADDLE_ROW,
  type BreakoutState,
} from "../lib/arcade/breakout";
import {
  meteorDodge,
  METEOR_VIEW,
  survivableRows,
  type MeteorState,
} from "../lib/arcade/meteor";
import { validatePayload } from "../lib/api";

const games = Object.values(ARCADE_GAMES);

test("the same seed rebuilds the same world, and seeds differ", () => {
  for (const game of games) {
    assert.deepEqual(game.create(7), game.create(7), game.id);
    const a = playOut(game, 7, "random");
    const b = playOut(game, 7, "random");
    assert.deepEqual(a, b, `${game.id} replays`);
  }
  const apples = new Set(
    Array.from({ length: 10 }, (_, i) =>
      JSON.stringify((snake.create(i + 1) as SnakeState).apple),
    ),
  );
  assert.ok(apples.size > 1, "different seeds place different apples");
});

test("the world does not depend on which policy plays it", () => {
  // Both policies face the identical opening row set and apple.
  for (const game of games) {
    const start = game.create(3);
    const scripted = game.step(start, game.scripted(start));
    const other = game.legal(start).find((a) => a !== game.scripted(start))!;
    const alt = game.step(start, other);
    if (game.id === "meteor-dodge") {
      const s = scripted as MeteorState,
        o = alt as MeteorState;
      if (!s.ended && !o.ended) assert.deepEqual(s.rows, o.rows);
    }
  }
});

test("steps are pure and illegal actions are rejected", () => {
  for (const game of games) {
    const start = game.create(1);
    const copy = JSON.parse(JSON.stringify(start));
    game.step(start, game.legal(start)[0]);
    assert.deepEqual(start, copy, `${game.id} step must not mutate`);
    assert.throws(() => game.step(start, "teleport"), /Illegal/);
  }
  const s = snake.create(1) as SnakeState;
  assert.ok(!snake.legal(s).includes("left"), "no reversing into the neck");
});

test("snake eats, grows, and dies on walls and its tail", () => {
  let s = snake.create(1) as SnakeState;
  s = { ...s, apple: [s.body[0][0] + 1, s.body[0][1]] };
  const grown = snake.step(s, "right") as SnakeState;
  assert.equal(grown.apples, 1);
  assert.equal(grown.body.length, s.body.length + 1);
  assert.equal(grown.sinceApple, 0);
  const atWall: SnakeState = {
    ...s,
    body: [
      [11, 3],
      [10, 3],
      [9, 3],
    ],
    heading: "right",
  };
  assert.equal(snake.outcomes(atWall).right.crash, true);
  assert.equal((snake.step(atWall, "right") as SnakeState).ended, "wall");
  const curled: SnakeState = {
    ...s,
    apple: [0, 0],
    body: [
      [5, 5],
      [6, 5],
      [6, 6],
      [5, 6],
      [4, 6],
    ],
    heading: "left",
  };
  assert.equal(snake.outcomes(curled).down.crash, true);
  assert.equal((snake.step(curled, "down") as SnakeState).ended, "tail");
});

test("breakout predicts the landing column the ball actually reaches", () => {
  for (let seed = 1; seed <= 30; seed++) {
    let s = breakout.create(seed) as BreakoutState;
    for (let i = 0; i < 200 && !breakout.over(s); i++) {
      const predicted = landingColumn(s.ball);
      const next = breakout.step(s, breakout.scripted(s)) as BreakoutState;
      if (
        predicted !== null &&
        s.ball.y === PADDLE_ROW - 1 &&
        next.lives === s.lives
      ) {
        // Caught: the paddle covered the predicted column.
        assert.ok(
          predicted >= next.paddle && predicted < next.paddle + 3,
          `seed ${seed}`,
        );
      }
      s = next;
    }
  }
});

test("meteor dodge always leaves a survivable path", () => {
  for (let seed = 1; seed <= 100; seed++) {
    let s = meteorDodge.create(seed) as MeteorState;
    for (let i = 0; i < 150; i++) {
      assert.ok(
        s.rows.every((row) => row.some((m) => !m)),
        "every row has an open lane",
      );
      // The hidden safe lane runs through every visible row, so some
      // starting lane can always clear the whole view.
      const best = Math.max(
        ...[0, 1, 2, 3, 4].map((lane) => survivableRows(s.rows, lane)),
      );
      assert.equal(best, METEOR_VIEW, `seed ${seed} tick ${i}`);
      const action = meteorDodge.scripted(s);
      s = meteorDodge.step(s, action) as MeteorState;
      if (s.ended) break;
    }
  }
});

test("the payload offers only legal actions and passes server validation", () => {
  for (const game of games) {
    const state = game.create(2);
    const payload = buildArcadePayload(game, state);
    const offered = Object.keys(payload.questions.action.criteria ?? {});
    assert.deepEqual(offered, game.legal(state));
    assert.equal(payload.questions.action.type, "choice");
    assert.doesNotThrow(() => validatePayload(payload));
    const outcomes = (payload.state as any).outcomes;
    assert.deepEqual(Object.keys(outcomes), game.legal(state));
  }
});

test("only a complete, valid choice counts as a Jev decision", () => {
  const state = breakout.create(1);
  const legal = breakout.legal(state);
  const good = {
    answers: {
      action: {
        type: "choice",
        choice: legal[0],
        confidence: 0.9,
        probabilities: Object.fromEntries(
          legal.map((a, i) => [a, i === 0 ? 0.8 : 0.2 / (legal.length - 1)]),
        ),
      },
    },
  };
  const ok = resolveArcadeDecision(breakout, state, good);
  assert.equal(ok.source, "jev");
  assert.equal(ok.action, legal[0]);
  assert.equal(ok.confidence, 0.8, "confidence is capped by the choice");
  const bad = [
    null,
    { answers: {} },
    { answers: { action: { ...good.answers.action, choice: "teleport" } } },
    { answers: { action: { ...good.answers.action, confidence: 2 } } },
    {
      answers: {
        action: { ...good.answers.action, probabilities: { [legal[0]]: 1 } },
      },
    },
    {
      answers: {
        action: {
          ...good.answers.action,
          probabilities: Object.fromEntries(legal.map((a) => [a, 0.9])),
        },
      },
    },
  ];
  for (const response of bad) {
    const d = resolveArcadeDecision(breakout, state, response);
    assert.equal(d.source, "fallback");
    assert.equal(d.action, "stay");
    assert.equal(d.confidence, null);
  }
});

test("a single safe move is forced locally instead of asked", () => {
  const s = snake.create(1) as SnakeState;
  const corner: SnakeState = {
    ...s,
    body: [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    heading: "left",
  };
  assert.equal(forcedAction(snake, corner), "down");
  assert.equal(forcedAction(snake, s), null);
});

test("the code-computed evidence is enough to beat the random baseline", () => {
  // The scripted rule reads only the same outcome facts Jev receives. If it
  // did not beat chance, no amount of good choosing could.
  for (const game of games) {
    let scripted = 0;
    for (let seed = 1; seed <= 40; seed++)
      scripted += playOut(game, seed, "scripted").score;
    const random = randomBaseline(game, 1, 40).mean;
    assert.ok(
      scripted / 40 > random * 2,
      `${game.id}: scripted ${scripted / 40} vs random ${random}`,
    );
  }
});

test("runs are bounded by each game's decision cap", () => {
  for (const game of games)
    for (let seed = 1; seed <= 20; seed++) {
      const result = playOut(game, seed, "scripted");
      assert.ok(result.decisions <= game.maxDecisions, game.id);
    }
});
