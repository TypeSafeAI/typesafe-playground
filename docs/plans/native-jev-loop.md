# Native Jev browser loop: execution ledger

Objective: the seven requirements in the supplied BetterWrite comparison, with no external text/reasoning model. The comparison figures (2,400 output tokens / 12 actions; 1,500 / setup-style task) are user-reported targets, not independently reproduced BetterWrite results.

## Completion requirements

- [x] Delta protocol: one initial compressed page baseline, then additions/changes/removals only, with stable document and node identities. Navigation invalidates handles without resending prior page history.
- [x] Forward-only compression: bounded current-step action menus and changed text, constructed before each call. No historical DOM or tool-call replay. Report truncation and allow progress to other relevant controls.
- [x] Native batches: one Jev request chooses multiple independent actions; every action maps to a locally observed closed choice. Guard and stop the remainder when a dependency changes.
- [x] Self-contained text: exact supplied goal values/spans, selected in the same Jev request; no external text model, hidden calls, or code/selector generation.
- [x] Cheap execution checks: live node identity, structural revision, value/option state and hit testing. No full page re-read between actions in a batch.
- [x] Bounded pacing: prevent rapid repeated clicks; respect challenges and rate limits, report them instead of claiming bypass.
- [ ] Metrics and benchmark: retain each request/response and provider usage outside policy context, report tokens/action, requests/action, compression and latency. Run reproducible 12-action and account/configuration scenarios; unknown usage stays unknown. Distinguish scripted correctness from live Jev selection.
- [x] Integrate local browser execution into the app and document the protocol, limits, evidence, and reproducible benchmark commands.
- [ ] Verify complete requirements, commit, push and merge to main after required checks.

## Implementation plan

1. Pure protocol/types: stable observations, delta stream, relevance selection, closed batched command choices, exact local text values, measurements. Contract tests first.
2. DOM executor: reusable self-contained browser script with stable handles, mutation guard, cheap per-target checks, bounded pacing, and action batches.
3. Native orchestrator + local browser-use bridge + localhost API/UI. Preserve the existing research mode and unrelated work.
4. Synthetic browser benchmarks (PC components/configuration and account-style dry run), real Jev measurements where credentials permit, and adversarial batch/freshness tests.
5. Audit, docs, CI, review and merge.

## Baseline evidence (before implementation)

- Starting point: main ee8abb505c9ea964d3d9a1f809fa3a7df31c3647; existing browser loop resends full visible text/element table and ten recent actions each cycle.
- Existing `TYPE_TEXT` uses another Jev span request; existing speculative target heads execute only one action.
- Existing local browser-use bridge only navigates/reads Newegg pages; it cannot yet execute native commands.
- Existing freshness check rereads the element table for most operations.
- Earlier live provider attempt returned HTTP 402; current native benchmark usage and performance remain unverified.
- Worktree: isolated `feat/native-jev-loop`; unrelated clean-room work in the primary checkout is preserved.

## Requirement audit — 2026-09-17

Checks above describe protocol/executor implementation verified with scripted responses. Live Jev selection and token performance are still unverified; completion is not claimed.

| Requirement | Authoritative evidence | Status |
| --- | --- | --- |
| Delta-only state | `DeltaStream`; protocol tests for unchanged data, navigation and goal-ranked option compression; retained scripted exchanges | Implemented and tested offline |
| Forward-only compression | Bounded nodes/text/options, explicit truncation; loop test reaches field 29 after skipped windows; only previous compressed view retained by encoder | Implemented and tested offline |
| Batches | Closed per-field heads; independent input/select and checkbox execution; click barriers; dependent DOM updates reject remainder | Implemented; live Jev batch selection unverified |
| Jev-only execution | One transport request per decision; exact goal spans/supplied values; no text-model call or fallback policy in native mode | Implemented and tested offline |
| Structural checks | DOM tests cover changed field, document, option, form context, occlusion and stable target outside unrelated updates; mutation-region counters avoid full rereads | Implemented and tested offline |
| Pacing/cancellation | Repeated target waits, challenge early-stop, bounded waits; cancellation test observes SIGTERM while RPC remains pending; unacknowledged batches remain uncertain | Implemented and tested offline; no detection-bypass claim |
| Metrics and targets | Staged v2 PC and profile: 12 actions / 7 decisions each. Actual model calls = 0 in scripted mode; tokens = null. Live attempt: HTTP 402 before first action | Target measurement incomplete |
| App/docs | `/jev-browser-agent/native`, guide link, explicit synthetic/live context, copyable exact trace; tests for failure accounting, overflow and short-screen composer | Implemented and tested offline |
| Delivery | Isolated `feat/native-jev-loop`; main remains unchanged by this task | Draft PR #19 pushed; initial 98300e5 CI passed; staged benchmark follow-up and live measurement pending |

## Verification receipts

- `pnpm test`: 200 TypeScript tests passed, plus the legacy JavaScript suite.
- `pnpm typecheck` and `pnpm build`: passed on the final DOM-region guard update.
- Production whole-app Playwright suite: 171 passed, 15 skipped. The subsequent DOM-context refinement passed all 20 desktop/mobile native executor tests.
- Production native UI suite: 6 passed, including 1920×1080, 1280×720, 390×844 and 320×568 bounds.
- `python3 -m unittest discover -s tests -v`: 26 passed; `python3 -m py_compile scripts/local-browser.py` passed.
- Observed red/green regression: unrelated promotion update initially rejected the batch on both viewports; region-aware guard now allows the stable form while still rejecting a changed form context.
- Visual inspection: dark 1920×1080 and light 390×844 screenshots; the subsequently corrected mobile source label and short-screen bounds are covered by the UI tests.
- Native runtime JS and Python bridge are present in the production route's file trace; no `.env` paths were included.

## Remaining work

1. Restore provider quota or supply a TypeSafe key with budget, then run the live
   benchmark command in `docs/native-browser.md`. Do not repeatedly retry HTTP 402
   or treat scripted decisions as live measurement.
2. Inspect real Jev choices, provider token coverage and achieved outcomes against
   the reported BetterWrite targets; fix any live-only failures.
3. Until then the output-token targets and live Jev task success stay unverified in
   the README, `docs/native-browser.md` and this ledger.

## Local benchmark artifacts

- `/tmp/typesafe-native-scripted-verified.json` — SHA-256 `fb3a9457362f4f6f772e05fdcd3c75f45c0982d5af3b0fe802e62c0d898f28c6`.
- `/tmp/typesafe-native-live.json` — SHA-256 `a7ce27ae702ce980c1c8d9612aea2ea2642f9a9ccd31cac8b5b7586d7774de37`.
- 2026-09-20 rerun of `scripts/benchmark-native-browser.ts --scripted` — SHA-256
  `8a190e0ba3e06aa42a67512fe6f22b1885be93cd65650876e67f256e7a7e82e4`. Reports are
  local artifacts and are not committed.

## Staged benchmark follow-up

- The initial one-page form scenarios were too narrow to establish multi-step browser control. Version 2 uses three sections, Continue/back navigation, persistent values, a saved review, and an Edit draft path. Both tasks require 12 actions and completed with scripted decisions in seven calls. These are still synthetic correctness checks, not live Jev performance.
- Same-menu request character reduction is 7.3% (PC) / 9.0% (profile) for the staged workflows. Earlier 34% / 24% figures applied only to the superseded one-page fixtures.
- The independent verifier can reject a wrong applied field and reopen it for correction; a focused loop regression now proves recovery instead of permanently hiding that field.
- Four staged-browser tests passed across desktop/mobile at the benchmark's explicit 1440×900 viewport. App layout responsiveness is checked separately.
- Initial commit `98300e5349c169e05b928bfeca991eeea79f4251` passed all four GitHub Actions checks and Vercel; those checks do not cover this follow-up until it is pushed.
- Current staged v2 raw report: `/tmp/typesafe-native-staged-v2.json`. Earlier local artifacts above remain historical evidence, not the current benchmark comparison.

- Follow-up verification: `pnpm test` passed 201 TypeScript tests plus legacy JavaScript checks; typecheck/build passed. Production native executor, staged benchmark, native UI and shared key-settings suites passed all 32 cases. Native key replacement clears the old billing block and sends the replacement header; dialog IDs are unique across the shell and native toolbar.

## Close-out audit — 2026-09-20

`origin/main` (6eb3bdd, through Jev Chat and the playground rename) is merged into the
branch and the whole suite was re-run on the merged tree.

- `pnpm test`: 475 TypeScript tests passed, plus the legacy JavaScript suite.
- `pnpm typecheck` and `pnpm build`: passed.
- `E2E_PRODUCTION=1 pnpm test:e2e`: 335 passed, 15 skipped. The four `clean-room.spec.ts`
  failures were reproduced as a local artifact of three Playwright workers competing for
  the two-slot demo admission cap, not a regression: the same spec passes 6/6 at
  `--workers=1`, which is what CI uses. The 35 native-browser executor, staged-benchmark
  and UI cases passed after the review fixes below.
- `python3 -m unittest discover -s tests`: 26 passed; `py_compile` passed on the bridge,
  `server.py` and `run.py`.
- `scripts/benchmark-native-browser.ts --scripted` re-run against a real local
  browser-use session: both staged tasks reached `done` with 12 executed actions in 7
  decision calls, 0 model calls, null tokens, and 7.33% / 9.02% request-character
  reduction — the same figures the earlier run reported.

Automated review findings, resolved:

- The Python bridge's `json.loads` around `page.evaluate` was reported as a Playwright
  type error. It is correct for the pinned browser-use 0.13.10, whose `Page.evaluate`
  returns a string and JSON-stringifies objects, and the scripted benchmark above
  exercises that path end to end. The call now also accepts an already-decoded value so
  a future pin cannot break it silently.
- The injected DOM runtime source is read and rewritten once per process instead of on
  every observe/execute/verify call.
- Usage entries keep `success` for a cycle whose Jev call was answered but whose browser
  batch then failed. That matches `PcBuildResearch`, where the status describes the Jev
  exchange, and those input tokens were genuinely spent; the run's own status still
  reports `failed`, and `outputTokensPerAction` is suppressed for uncertain batches.

Open requirement: live token measurement. Every other requirement is implemented,
tested offline and documented, so the branch merges with the live targets labelled
unverified in the README, `docs/native-browser.md` and this ledger.
