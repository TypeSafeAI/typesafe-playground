# Twisty puzzle solver

Open `/simulations/twisty-puzzles`. **Live Jev** is the default mode. It uses
real Jev requests through the playground's `/api/run` transport and your configured
server key or personal-key override. Local code owns puzzle rules and verification.

1. Select 2×2, 3×3, 4×4 or Megaminx (a twelve-sided dodecahedral puzzle).
2. Enter a scramble starting from solved, or choose **New scramble**.
3. **Load scramble** updates the unfolded diagram. Try `R` for a one-turn example.
4. **One Jev move** sends one closed-set choice request. **Run Jev** continues
   until solved, paused, failed, or the 40-move attempt limit is reached.
5. Inspect the Jev decision receipts and resulting state. A complete solved state
   enables verified playback; an incomplete attempt is never called a solution.

## What Jev actually does

Every applied live move is Jev's returned choice among the legal turns. The model
receives current and solved piece arrays, recent Jev moves, and code-computed
one-turn outcomes (solved status and misplaced/misoriented piece counts). No local
search, inverse scramble history, or precomputed solution supplies Jev's move.
This is reactive selection over local evidence, not a lookahead solver. Longer
scrambles may stall or remain unsolved. Confidence does not prove progress.

The receipt records the move, probability distribution, bounded confidence and
returned model when reported. Usage appears in the shared header; unavailable
usage remains unknown. Each request goes through the existing credential,
rate-limit and error-redaction controls. The browser queue spaces request starts
by 1.2 seconds. A request (including queue time) has a 45-second deadline.

Pause, hiding/leaving the page, changing mode/puzzle/draft, or changing the API key
aborts pending work and discards late responses. Applied moves survive Pause so
you can resume explicitly. Loading a scramble starts a fresh attempt. No requests
run while idle. Invalid choices/distributions and provider errors stop the attempt;
there is no local fallback. Already-solved input requires no Jev call and says so.

## Local comparison

Select **Local solver**, then **Solve puzzle**, to use the existing local worker
without a key or model request. This mode is explicitly labeled and never starts
automatically after a Jev failure. Use **Next**, **Back**, or a move button to
inspect the verified local solution.

## Notation and limits

Use at most 250 space-separated moves and 2,000 characters. R, L, U, D, F and B
turn a cube’s right, left, upper, lower, front and back face clockwise when looking
directly at that face. A straight apostrophe reverses the turn; 2 turns twice.
Cube turns are 90°; Megaminx turns are 72°. On 4×4, Rw means both right layers.
Megaminx accepts twelve face names: U, D, F, B, L, R, FL, FR, BL, BR, DL and DR.
Match them to the fixed-position labels on the diagram; FR is one face, not two
successive turns. A 2 is 144° clockwise and 2' is 144° counterclockwise.
Megaminx additionally accepts R++, R--, D++ and D-- scramble notation.
Solutions may use a v suffix for whole-puzzle rotations around a named face’s
axis: Rv means 72° clockwise as viewed toward R; Uv' is 72° counterclockwise
as viewed toward U. Reorient the entire puzzle, then read subsequent moves in
that new orientation. Rotation tokens are output instructions, not scramble
input in this version.
Grouped algorithms, repetitions and commutators are intentionally not accepted.

In Local solver mode, all four puzzles search the piece state computed from the entered scramble.
2×2, 3×3 and Megaminx use cubing.js state search. The 4×4 uses Chen Shuang's
three-phase reduction (centers and paired edges), then cubing.js solves the
remaining 3×3 state. Its solution may include x or y whole-cube rotations in
the direction of R or U respectively. There is no camera or color-entry input. Practice scrambles are reproducible random moves,
not official competition random-state scrambles. Solutions are not guaranteed
shortest and do not solve center artwork orientation.

In Local solver mode, the complete returned algorithm is applied to the initial piece state before a
verified result is displayed. Unsolved output is rejected. Errors, cancellation
and timeouts never become successful results. Searches stop at 60 seconds;
editing, changing puzzles, leaving or hiding the page terminates the worker.
Nothing searches or animates while idle.

Each puzzle's draft persists separately in localStorage. Results do not persist.
Storage failure is reported without preventing local use. A 2D diagram avoids
requiring WebGL and fits narrow screens; written moves remain available if the
diagram fails.

## Packaging and attribution

[`cubing.js` 0.63.8](https://github.com/cubing/cubing.js/tree/v0.63.8) supplies the
puzzle definitions, renderer and state searches. Its source is available at that
link; the library is used under the [Mozilla Public License 2.0](../public/licenses/cubing-MPL-2.0.txt).
The adapted 4×4 reduction implementation includes its
[provenance and license grant](../lib/twisty/vendor/README.md) and
[MIT notice](../public/licenses/cs0x7f-MIT.txt). Generated bundles retain upstream
legal comments. The playground's own license
and original contributor attribution are unchanged.

`pnpm puzzles:build-worker` bundles the nested module worker with esbuild. It runs
before development, typechecking and production builds. Generated, hashed files
under `public/generated/twisty/` and the private build manifest
`lib/twisty/worker-url.json` are ignored by Git. The worker is fetched only after
an explicit solve action; the renderer is loaded only in this workspace. Node
22.3+ is required by the pinned cubing.js dependency.

## Verification

`tests/twisty-puzzles.test.ts` checks legal notation, bounded input, reproducible
scrambles, solved states and solution playback. `tests/e2e/twisty-puzzles.spec.ts`
explicitly selects the local comparison and uses real local workers with no model calls.
`tests/e2e/twisty-jev.spec.ts` intercepts Jev responses (no shared credits) and checks
real request payloads, accepted and invalid choices, errors, freshness, request bounds, and
desktop/mobile playback, persistence, errors and keyboard guidance.
