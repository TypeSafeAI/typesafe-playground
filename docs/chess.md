# Jev attempts chess

Open `/simulations/chess` to watch a System One decision model play a game that needs search. This workspace exists to show a limit, not to recommend an approach: Jev's own guidance puts chess-like planning outside what a fast classifier should be asked to do, and this page wires it up to a real board so the shape of that limit is visible rather than asserted.

**Play out** runs the game one request per move until it ends. **One move** plays a single ply. **New game** resets to the starting position.

## What Jev is and is not asked

[chess.js](https://github.com/jhlywa/chess.js) owns every rule. It tracks the position, generates the legal moves, and decides when the game is over. Jev never sees the board, never checks legality, and never names a square of its own — it receives a nine-field summary of the position and a list of legal moves, and picks one.

The summary is `side_to_move`, `move_number`, `material_balance`, `in_check`, `legal_move_count`, `captures_available`, `checks_available`, `phase` and `last_opponent_move`. No piece placement, no pawn structure, no king safety, no threats, and no history beyond the opponent's previous move. Each legal move is described in one line: the piece, the origin and destination squares, what it captures and for how many centipawns, and whether it gives check or mate.

Because the Choice candidates *are* the legal moves, an answer inside the set is always playable. Jev never makes an illegal move — not because it understands chess, but because it is never given the chance to invent one.

## Fallbacks

Three steps, in order. A named move that is one of this position's legal moves is played as chosen. A named move outside that list falls back to the highest-scoring legal move in the probability map, counted on the result card as an illegal pick. A response with nothing usable in it plays the first legal move so the game cannot hang. The last step is a deliberately dumb floor: a page about a model's limits should not quietly paper over them.

Illegal scores are stripped from the distribution rather than ranked, so the bars only ever show moves that were really on offer. A failed request plays nothing at all and surfaces the error.

## The referee

Every Jev move is marked against the best move a depth-limited minimax can find from the same position — material only, no quiescence, no piece-square tables, no opening book. The difference in centipawns is the move's loss, and anything at or above the blunder threshold counts as a blunder. Walking into a forced mate always counts, whatever the threshold says.

The same engine is offered as the opponent in **Jev vs Minimax**. Using one evaluator for both jobs is the honest version of the comparison: Jev is not being marked against a grandmaster, it is being marked against the cheapest search there is — the thing it is supposed to be a poor substitute for.

Mate scores are counted apart from the centipawn figures and never averaged into them. A move that allows mate-in-one scores −100000, and folding that into a mean would report tens of thousands of centipawns lost, which means nothing.

## Modes and reproducibility

- **Jev vs Random** — Black plays a seeded uniform-random legal move. The weakest possible opponent, and the fairest floor.
- **Jev vs Minimax** — Black runs the referee at depth 1 to 3.
- **Jev vs Human** — you play Black by clicking a piece and then its destination.

The seed fixes the opponent's choices, including how minimax breaks ties between equally-scored moves, so the same seed and mode replay the same game. Tie-breaking is seeded rather than taken in move order because a material-only evaluator scores every opening move identically, and taking the first would open 1.a3 every time. Moving the blunder threshold re-marks the moves already played without sending a new request; the referee runs locally.

Games stop after 160 half-moves. Export downloads the position summaries, candidate lists, probability distributions, referee verdicts and totals as JSON.

## What to look for

Jev plays legally and badly. It has no lookahead, no evaluation function, and no memory of strategy between calls — each move is an isolated classification, so there is no plan for a move to be part of. Watch the confidence next to the referee's verdict: a high-confidence pick that gives away a piece is the clearest single statement the page makes. Compare the blunder rate against even depth-1 minimax to see how far a single fast decision is from a search, however shallow.

Implementation: `types/chess.ts`, `lib/chessEngine.ts`, `lib/buildPositionSummary.ts`, `lib/classifyMoveWithJev.ts`, `lib/baselineMinimax.ts` and `lib/chessGameLoop.ts` (named apart from the Doom workspace's `lib/gameLoop.ts`). UI modules: `ChessLab`, `BoardView`, `MoveCandidates`, `MoveProbabilities`, `GameLog` and `ResultSummary`. The board is drawn as plain HTML and Unicode glyphs rather than pulled from a chessboard package, matching how the Doom and MicroDuck viewports are built; chess.js supplies the rules, which is the part that has to be right.
