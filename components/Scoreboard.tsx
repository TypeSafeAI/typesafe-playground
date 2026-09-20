import type { GameState, GameTrial, ControlMode } from "../types/doom";
import { TICK_MS } from "../lib/gameLoop";
export function Scoreboard({
  game,
  trials,
  mode,
  chaos,
  classificationsPerSecond,
}: {
  game: GameState;
  trials: GameTrial[];
  mode: ControlMode;
  chaos: boolean;
  classificationsPerSecond: number | null;
}) {
  const rows = trials.filter((t) => t.seed === game.seed && t.chaos === chaos);
  return (
    <section className="panel doom-scoreboard">
      <div className="panel-heading">
        <h2>Same arena. Three controllers.</h2>
      </div>
      <div className="doom-stats">
        <div>
          <span>Kills</span>
          <strong>{game.kills}</strong>
        </div>
        <div>
          <span>Damage taken</span>
          <strong>{game.damageTaken}</strong>
        </div>
        <div>
          <span>Time survived</span>
          <strong>
            {((game.tick * TICK_MS) / 1000).toFixed(1)}
            <small>s</small>
          </strong>
        </div>
        <div>
          <span>Shot accuracy</span>
          <strong>
            {game.shots
              ? ((game.hits / game.shots) * 100).toFixed(0) + "%"
              : "—"}
          </strong>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Controller</th>
              <th>Kills</th>
              <th>Damage</th>
              <th>Survival</th>
              <th>Accuracy</th>
              <th>Jev decisions/s</th>
            </tr>
          </thead>
          <tbody>
            {(["human", "jev", "random"] as const).map((m) => {
              const last = rows.filter((t) => t.mode === m).at(-1);
              const live = m === mode && game.tick > 0;
              return (
                <tr key={m}>
                  <th>
                    {m === "human" ? "Human" : m === "jev" ? "Jev" : "Random"}{" "}
                    {live ? (
                      <small>· current</small>
                    ) : last ? (
                      <small>· last run</small>
                    ) : null}
                  </th>
                  <td>{live ? game.kills : (last?.kills ?? "—")}</td>
                  <td>
                    {live ? game.damageTaken : (last?.damageTaken ?? "—")}
                  </td>
                  <td>
                    {live
                      ? ((game.tick * TICK_MS) / 1000).toFixed(1) + "s"
                      : last
                        ? last.seconds.toFixed(1) + "s"
                        : "—"}
                  </td>
                  <td>
                    {live
                      ? game.shots
                        ? ((game.hits / game.shots) * 100).toFixed(0) + "%"
                        : "—"
                      : last?.accuracy !== null && last?.accuracy !== undefined
                        ? (last.accuracy * 100).toFixed(0) + "%"
                        : "—"}
                  </td>
                  <td>
                    {m === "jev"
                      ? ((live
                          ? classificationsPerSecond
                          : last?.classificationsPerSecond
                        )?.toFixed(1) ?? "—")
                      : "No model call"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="doom-score-note">
        Same seed, 200ms simulation ticks, 90s simulation limit. Jev pauses the
        simulation while awaiting each decision; API wait time does not count as
        survival. Its chosen turns use visible-target precision. Human and
        random controls run continuously. These are session observations, not a
        controlled model benchmark. Jev decisions/s counts valid frame
        classifications per second of elapsed request time, including the safety
        queue and network; only the
        newest frame can control the arena. Switching mode saves this run and
        resets the arena.
      </p>
    </section>
  );
}
