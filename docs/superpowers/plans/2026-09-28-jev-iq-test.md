# Jev IQ-style test implementation plan

**Goal:** Add a Jev-only reasoning test with original questions, checked answers, question-by-question playback, a numerical IQ estimate, and raw/category scores. Val selected Jev testing over human practice/comparison and subsequently requested the numerical estimate.

**Architecture:** A versioned, fixed 12-question set and pure request/response/scoring functions live in `lib/iq-test.ts`. A bounded sequential runner in `lib/iq-test-runner.ts` accepts an injected transport. `components/IqTestLab.tsx` uses the existing `runJev` transport, key handling, usage tracking, and shell at `/simulations/iq-test`.

**Tech stack:** Existing Next.js, React, TypeScript, node:test and Playwright; no new dependencies.

## Design

- Four numerical, four logical, and four pattern questions, each with four choices and explicit assumptions. Reference explanations stay out of Jev requests. Each call contains only the current question.
- Default local demo always chooses the first option and makes no calls. Live Jev requires an explicit selection and start; at most 12 sequential calls, spaced by at least one second. No automatic retry or resume.
- A complete valid distribution and an offered choice are required for grading. Confidence is displayed separately from correctness. Errors/invalid answers stop the run; cancellation and remaining questions stay visible. Percentage appears only for a complete test.
- Stop, hidden tab, key changes, reset and unmount abort active work. Late results cannot update a reset run. Exports include execution mode, version, model, and results, never credentials.
- Retain the shell's colors, typography and panels. A numbered answer sheet opens each puzzle for inspection; the selected question shows options, evidence and a revealable checked explanation. Both columns stack on narrow screens.
- Original educational puzzles, not a standardized or normed IQ instrument. At Val's subsequent explicit request, add the disclosed uncalibrated numerical estimate described below. No population percentiles, rankings, or general capability claims. Symbol patterns are sent as text, not pixels.

## Execution checklist

- [x] Add `tests/iq-test.test.ts`: independently check reference answers; validate payloads and answer-key isolation; exercise malformed distributions, partial scoring, failed/cancelled runs and request cap. Run `pnpm exec tsx --test tests/iq-test.test.ts` before and after implementation.
- [x] Implement `lib/iq-test.ts` and `lib/iq-test-runner.ts` with the above contracts. Keep transport, grading, and UI separate.
- [x] Add mocked `tests/e2e/iq-test.spec.ts`, then implement `components/IqTestLab.tsx`, `app/simulations/iq-test/page.tsx` and scoped CSS. Cover local demo, complete live run, errors, stop/reset, key change, keyboard, preferences, themes and narrow/short screens.
- [x] Register the workspace in routes, playground catalog, social metadata, guides and details. Update the simulations count in the home and section browser tests, README, and add `docs/iq-test.md`.
- [x] Run `pnpm test`, `pnpm typecheck`, `pnpm build`, focused production Playwright and legacy Python tests. Inspect rendered light/dark layouts. Review the final diff; report exact checks and remaining coverage without using live provider credits.

No commit or publication is part of this implementation request.

## Follow-up: watch each answer and show a final breakdown

- [x] Follow the current question by default and scroll it into view. Selecting an earlier question suspends following; a visible follow control restores it. Keep Stop accessible while watching.
- [x] Hold each answer, including the last, for two seconds before advancing or opening the final report. Preserve cancellation, isolation and request bounds.
- [x] Compute category correct/incorrect/unscored counts and complete-category percentages in the shared summary. Include this breakdown in exports and a dedicated final results panel. Report the actual raw score and percentage; this unnormed set cannot yield a standardized IQ number.
- [x] Verify following, readable answer dwell, final-report navigation, breakdown arithmetic, partial runs, keyboard and narrow layouts using offline tests and mocked production browser runs.

Follow-up verification: `pnpm test` passed 39 JavaScript and 595 TypeScript tests; `pnpm typecheck` and `pnpm build` passed. `E2E_PRODUCTION=1 E2E_PORT=3067 pnpm test:e2e tests/e2e/iq-test.spec.ts --workers=2` passed all 18 tests, including following at 320×568, continuing to inspect an earlier answer while later requests proceed, restoring following, and focusing the final report. Inspected desktop/mobile screenshots of both playback and final results. Live responses were mocked; no standardized IQ calibration or live model-performance evidence is claimed.

## Follow-up: numerical estimated IQ

Val explicitly requested a numerical estimate rather than leaving IQ unavailable. Implement a provisional, fully disclosed heuristic while keeping measured results separate from assumptions.

- [x] Add a pure, versioned conversion for the fixed 12-question set: `round(100 + 15 * (correct - 6) / 2)`. The assumed raw mean of 6 and raw standard deviation of 2 are design choices, not collected human norms. The resulting range is 55–145.
- [x] Produce an estimate only when all 12 answers are valid. Include method version, assumptions and uncalibrated status in the summary/export. Neither confidence, latency nor failed/missing answers may inflate the estimate.
- [x] Lead the final report with Estimated IQ and its adjacent uncalibrated label. Preserve raw scores, category breakdowns and execution labels; show the formula in an expandable explanation.
- [x] Update the guide and existing no-conversion copy. Verify every possible score, incomplete runs, malformed inputs, exports and desktop/mobile presentation with mocked provider responses.

Numerical estimate verification: `pnpm test` passed 39 JavaScript and 598 TypeScript tests. `pnpm typecheck`, `pnpm build` and `git diff --check` passed. The production IQ browser suite passed all 18 tests. After adding final-report checks at 320×568, both production complete-run tests passed again. Inspected the estimated value and expanded formula on desktop and mobile; the final report has no horizontal overflow. The local preview returned HTTP 200. All provider responses were mocked; no live Jev score or empirical IQ calibration was measured. Changes remain uncommitted.

## Initial verification evidence

- `pnpm test`: 39 JavaScript and 593 TypeScript tests passed.
- `pnpm typecheck` and `pnpm build`: passed, including the new page and share image route.
- `python3 -m unittest discover -s tests -v`: 26 passed.
- `E2E_PRODUCTION=1 E2E_PORT=3067 pnpm test:e2e tests/e2e/iq-test.spec.ts tests/e2e/sections.spec.ts tests/e2e/home.spec.ts --workers=2`: 35 passed; one desktop-only sidebar check intentionally skipped on mobile.
- Browser checks exercise 1280×720, 390×844 and 320×568 in light/dark themes. Inspected screenshots of the completed demo and dark question detail. Fixed a desktop footer overlap by making this workspace scroll within the shell.
- Live provider responses were mocked. Actual provider performance, the full unrelated browser suite, and human assistive-technology acceptance were not tested.

## Follow-up: 24 questions and finer score resolution

At Val's request, question-set version `reasoning-v2` preserves the original 12 questions and adds 12 with multistep rules and plausible distractors. Each category now has eight questions, with two answers in each option position. The set has six warm-ups, twelve intermediate questions and six challenges; these difficulty labels are editorial, not measured Jev performance.

Scoring method `assumed-reference-v2` uses `round(100 + 15 * (correct - 12) / 4)`. The 25 possible raw scores yield 25 distinct rounded values while retaining the 55–145 endpoints. The mean and deviation remain disclosed design assumptions, not human norms. All 24 valid answers are required. Live mode continues to request actual Jev choices; local mode remains explicitly scripted. UI counts, exports, metadata and documentation now describe the expanded set.

Verification: 680 unit tests (46 JavaScript and 634 TypeScript), typecheck, production build, secret scan and 26 legacy Python tests passed. Production browser checks for IQ, home and section navigation passed 39 cases with one intentional mobile sidebar skip. Coverage includes 24-call request isolation, exports, all score mappings, errors, cancellation, final-answer pause, keyboard inspection and light/dark layouts down to 320×568. Inspected desktop and mobile final reports and question 24. Independent review verified every new answer, exhaustive logic/spatial cases, scoring and integration; no blockers found. Automated provider responses were mocked. No live Jev performance or empirical IQ calibration was measured.
