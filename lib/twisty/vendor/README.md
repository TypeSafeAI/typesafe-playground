# 4×4 reduction solver provenance

`reduce444.ts` is adapted from Chen Shuang's three-phase solver as distributed
in [cubing.js v0.63.8](https://github.com/cubing/cubing.js/blob/d02c02fc90f3410e612315141072a47af03feb97/src/cubing/vendor/mit/cs0x7f/cstimer/src/js/scramble/444-solver.ts).
The generated search implementation is retained; upstream's `@ts-nocheck` is
preserved for this generated file alone.

Chen Shuang explicitly added the MIT option for this solver in
[the upstream license grant](https://github.com/cs0x7f/min2phase/issues/17#issuecomment-1905196770).
[The solver's README](https://github.com/cs0x7f/TPR-4x4x4-Solver/blob/e432528210ddcc4fb75586a14163b172795caa9f/README.md)
contains that license, copied to `public/licenses/cs0x7f-MIT.txt`.
cubing.js moved this code to its MIT vendor directory in
[commit b4e7139](https://github.com/cubing/cubing.js/commit/b4e713922f810c882de169b8f9def47b9a1771a2).
The old nested csTimer GPL notice predates this explicit additional grant.

The TypeScript adaptation and our modifications are available under MPL-2.0;
see `public/licenses/cubing-MPL-2.0.txt`. Source is checked into this repository.
This file's license does not change the playground's MIT license.

Local changes:

- Replace random-state generation with a solved piece model plus validated input
  moves; search uses the resulting piece state, not inverse history.
- Return the forward reduction sequence instead of its inverse scramble.
- Remove the random 3×3 scramble appendage and upstream internal imports.
- Use small local combination/permutation/cycle helpers.
- Keep the remaining 3×3 handoff, whole-cube orientation and independent final
  verification in the typed adapter outside this generated implementation.

No generated code from a model or user is evaluated. The vendored static source
is bundled into the on-demand local worker by the normal build.
