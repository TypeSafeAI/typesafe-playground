import test from "node:test";
import assert from "node:assert/strict";
import { createGame, stepGame, isBlocked } from "../lib/gameLoop";
import { extractGameState } from "../lib/extractGameState";
import { baselineRandomAgent } from "../lib/baselineRandomAgent";
import { classifyActionWithJev } from "../lib/classifyActionWithJev";
import { DOOM_ACTIONS } from "../types/doom";
test("arena is seeded and movement never walks through walls", () => {
  const a = createGame(7);
  assert.deepEqual(a, createGame(7));
  a.player = { ...a.player, x: 1.2, y: 1.5, angle: Math.PI };
  const b = stepGame(a, "move_forward");
  assert.equal(b.player.x, 1.2);
  assert.equal(a.tick, 0);
  assert.ok(isBlocked(a, 0, 0));
  assert.equal(
    stepGame(a, "turn_right").player.angle,
    (Math.PI + Math.PI / 8) % (Math.PI * 2),
  );
});
test("shooting, doors and item use are deterministic actions", () => {
  const a = createGame(7);
  a.enemies = [{ id: "target", x: 4.5, y: 2.5, health: 20 }];
  const b = stepGame(a, "shoot");
  assert.equal(b.kills, 1);
  assert.equal(b.hits, 1);
  assert.equal(b.player.ammo, a.player.ammo - 1);
  assert.equal(b.status, "won");
  const c = createGame(7);
  c.player.x = 6.5;
  c.player.y = 2.5;
  assert.equal(extractGameState(c).door_ahead, true);
  const d = stepGame(c, "open_door");
  assert.equal(d.map[2][7], ".");
  assert.equal(c.map[2][7], "D");
  c.player.health = 50;
  c.items = [{ id: "kit", x: 6.5, y: 2.5, kind: "health", collected: false }];
  assert.equal(stepGame(c, "use_item").player.health, 85);
});
test("perception respects line of sight and chaos hides only distance", () => {
  const a = createGame(7);
  a.enemies = [{ id: "hidden", x: 10.5, y: 2.5, health: 20 }];
  assert.equal(extractGameState(a).enemy_visible, false);
  a.enemies = [{ id: "visible", x: 4.5, y: 2.5, health: 20 }];
  const clear = extractGameState(a),
    chaos = extractGameState(a, true);
  assert.equal(clear.enemy_visible, true);
  assert.equal(clear.enemy_bearing, "center");
  assert.deepEqual(chaos, { ...clear, enemy_distance: "unknown" });
});
test("random baseline uses the same closed action set and seed", () => {
  const a = createGame(9);
  const picks = Array.from({ length: 30 }, (_, tick) =>
    baselineRandomAgent({ ...a, tick }),
  );
  assert.ok(picks.every((x) => DOOM_ACTIONS.includes(x)));
  assert.deepEqual(
    picks,
    Array.from({ length: 30 }, (_, tick) =>
      baselineRandomAgent({ ...a, tick }),
    ),
  );
});
test("Jev batches actual frame states and rejects invented actions or broken probabilities", async () => {
  const frames = [0, 1, 2, 3].map((tick) => ({
    tick,
    features: extractGameState({ ...createGame(7), tick }),
  }));
  const batch = await classifyActionWithJev(frames, {
    transport: async (p) => {
      assert.deepEqual((p.state as any).frames, frames);
      assert.equal(Object.keys(p.questions).length, 4);
      assert.deepEqual(Object.keys(p.questions.frame_0.criteria!), [
        ...DOOM_ACTIONS,
      ]);
      return {
        answers: {
          frame_0: {
            type: "choice",
            choice: "shoot",
            confidence: 0.95,
            probabilities: Object.fromEntries(
              DOOM_ACTIONS.map((a) => [a, a === "shoot" ? 1 : 0]),
            ),
          },
          frame_1: {
            type: "choice",
            choice: "execute_script",
            confidence: 1,
            probabilities: { execute_script: 1 },
          },
        },
      };
    },
  });
  assert.equal(batch.decisions[0].action, "shoot");
  assert.equal(batch.decisions[0].confidence, 0.95);
  assert.ok(
    batch.decisions.slice(1).every((d) => d.action === "idle" && d.error),
  );
  await assert.rejects(classifyActionWithJev([]), /frames/);
});

test("centered enemy features match the executable firing cone", () => {
  for (const y of [2.5, 2.8, 2.94, 2.1, 2.06]) {
    const state = createGame(7);
    state.enemies = [{ id: "target", x: 5.5, y, health: 20 }];
    const centered = extractGameState(state).enemy_bearing === "center";
    assert.equal(
      centered,
      stepGame(state, "shoot").hits === 1,
      `target y=${y}`,
    );
  }
});

test("first-person camera and perception share a horizontal field of view", async () => {
  const { DOOM_FOV, verticalFieldOfView } = await import("../lib/doom-camera");
  for (const aspect of [0.5, 1, 2, 3]) {
    const vertical = (verticalFieldOfView(aspect) * Math.PI) / 180;
    assert.ok(
      Math.abs(2 * Math.atan(Math.tan(vertical / 2) * aspect) - DOOM_FOV) <
        1e-10,
    );
  }
  const state = createGame(7);
  state.map = Array.from({ length: 11 }, () => ".".repeat(15)); // Isolate FOV from wall occlusion.
  state.player = { ...state.player, x: 10.5, y: 5.5, angle: 0 };
  state.enemies = [{ id: "edge", x: 12.5, y: 7.6, health: 40 }];
  assert.equal(extractGameState(state).enemy_visible, false);
  state.enemies[0].y = 7.4;
  assert.equal(extractGameState(state).enemy_visible, true);
});

test("a complete seeded sector can be cleared using only ordinary controls", async () => {
  const { readFile } = await import("node:fs/promises");
  const run = JSON.parse(
    await readFile(
      new URL("./fixtures/doom-winning-run.json", import.meta.url),
      "utf8",
    ),
  );
  let game = createGame(run.seed);
  for (const action of run.actions) {
    assert.ok(DOOM_ACTIONS.includes(action));
    game = stepGame(game, action);
  }
  assert.equal(game.status, "won");
  assert.equal(game.kills, 5);
  assert.ok(game.player.health > 0);
  assert.ok(game.tick < 450);
  assert.ok(run.actions.includes("open_door"));
  assert.equal(stepGame(game, "shoot"), game);
});

test("Jev turn pulses aim at visible targets without changing human turn controls", async () => {
  const { executeJevAction } = await import("../lib/executeJevAction");
  const game = createGame(7);
  game.player.angle = 0;
  game.enemies = [{ id: "target", x: 5.5, y: 2.9, health: 40 }];
  const angle = Math.atan2(0.4, 3);
  const aimed = executeJevAction(game, "turn_right");
  assert.ok(Math.abs(aimed.player.angle - angle) < 0.00001);
  assert.equal(stepGame(game, "turn_right").player.angle, Math.PI / 8);
  assert.ok(executeJevAction(aimed, "shoot").hits > 0);
  const hidden = {
    ...game,
    enemies: [{ id: "hidden", x: 10.5, y: 2.9, health: 40 }],
  };
  assert.equal(
    executeJevAction(hidden, "turn_right").player.angle,
    Math.PI / 8,
  );
});
