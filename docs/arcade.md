# Jev Arcade

Open `/arcade` for three classic games Jev can play successfully: **Snake** (`/arcade/snake`), **Breakout** (`/arcade/breakout`) and **Meteor dodge** (`/arcade/meteor-dodge`). They sit beside the chess page on purpose. Chess shows what one reactive choice cannot do; these games show what it can do when each move is a small, well-evidenced decision.

## What Jev is and is not asked

Each game is a pure state machine in `lib/arcade/`. Code owns every rule: the board, legal moves, collisions, scoring and the end of the run. Before every move, code also computes what each legal action would do right now, and sends those facts with the game state:

- **Snake** reports, for each direction, whether it crashes into a wall or the tail, whether it eats the apple, the distance to the apple afterwards, and how many cells stay reachable by flood fill. A move that leaves fewer open cells than the snake's length is marked as a trap.
- **Breakout** predicts the column where a falling ball will reach the paddle, following wall bounces. For each paddle move it reports whether the paddle would cover that column and how far off it would be.
- **Meteor dodge** reports, for each move, whether the ship would hit the arriving row, how many of the nine visible rows it could still clear from that lane, and how many lanes stay reachable at the edge of view. That is a code-computed look-ahead over visible rows only.

Jev answers one closed-set `choice` question per move, and the candidates are exactly the legal actions. It never sees pixels, never invents a control, and no generated code runs. This is reactive selection over evidence, not planning. Credit for a good run belongs partly to the facts code supplies, and the page says so.

## Forced moves and fallbacks

When only one legal move avoids an immediate crash, the game plays it locally and labels it **Forced**. No request is sent, the same rule the chess lab uses for a single legal move.

An answer counts as a Jev choice only when it names an offered action and carries a complete probability distribution over the offered actions that sums to 1, with a confidence in [0, 1]. Anything else plays the game's safe fallback, such as straight ahead or holding still, labeled **Fallback: invalid answer**. Fallbacks are never counted as Jev choices. A provider error stops the run and shows the error. It never becomes a move.

## Baselines and reproducibility

The seed fixes the whole world: apple spawns, serve directions and meteor rows. The world's randomness lives in game state and never mixes with the player's choices, so Jev, the scripted demo, the random baseline and a human all face the same game on the same seed.

- **Random baseline** picks uniformly among legal moves that do not crash on this tick. It dodges only instant, obvious losses, so beating it means the choices carry information.
- **Scripted demo** is a short hand-written rule over the same facts Jev receives. It needs no key, makes no model call, and is labeled as not Jev. It also serves as a check that the evidence is sufficient: a unit test fails if the rule does not at least double the random mean.
- **You play** uses the arrow keys or WASD while the board has focus.

The scoreboard shows the random baseline on the current seed and its mean over 20 fixed seeds, next to the scripted rule's score.

Meteor dodge keeps one hidden lane clear in every row, and that lane moves at most one lane per row. A survivable path always exists, so a crash is a decision error rather than an impossible field.

## Bounds

| Game | Move cap | Other stop |
| --- | --- | --- |
| Snake | 200 moves | 120 moves without an apple |
| Breakout | 240 frames | Three lives lost |
| Meteor dodge | 150 rows | First hit |

Live play sends at most one request a second. That stays under the playground server's limit of 60 requests a minute per key. Runs pause when the tab is hidden, a reset discards any answer still in flight, and Pause aborts the pending request.

## Measured results

Live runs on 2026-09-26 with `jev-latest`, seed 1, one full run per game, driven through this app's `/api/run` with the same payloads the page sends:

| Game | Jev | Random, same seed | Random, mean of 20 seeds | Scripted rule | Jev choices | Forced | Fallbacks | Crash picks | Agreed with rule |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Snake, apples | 18 | 0 | 0.7 | 19 | 194 | 6 | 0 | 0 | 88% |
| Breakout, bricks | 15 | 3 | 4.5 | 15 | 239 | 0 | 1 | 0 | 93% |
| Meteor dodge, rows | 150 | 81 | 36.2 | 150 | 100 | 50 | 0 | 0 | 83% |

Snake and Breakout ran to their move caps. Breakout reached its cap with lives remaining. Meteor dodge survived all 150 rows. The one Breakout fallback came from a provider HTTP 520 error. The measurement script played a fallback and continued, whereas the page stops and shows the error.

The runs used 398,103 input tokens and 19,785 output tokens across 534 requests. Mean confidence was 0.72 to 0.79, and mean request latency was 237 to 488 ms.

These are three single-seed runs, not a benchmark. They show that Jev can play each game well above chance with the supplied evidence. They do not establish a win rate across seeds, and they are no claim about harder games or play without code-computed facts.
