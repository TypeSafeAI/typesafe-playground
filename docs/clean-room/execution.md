# Clean-room rebuild execution ledger

Objective: implement all six stages in the supplied clean-room pipeline brief, plus the user's three prefilled functional demos. The user's subsequent Jev-only requirement supersedes the brief's separate generation-model stage: all component code is emitted deterministically on the local machine.

## Implemented and verified locally

- [x] Discover OpenAPI and observed JSON endpoints; retain schemas, variables, authentication evidence, and Jev-classified category/shape/auth.
- [x] Let Jev select endpoint relationships, including differently named fields; preserve endpoint graph JSON.
- [x] Capture indexed semantic elements, current values/checked state, and computed presentation without source/bundle/stylesheet ingestion.
- [x] Classify UI roles and data bindings with closed choices; reject uncertain or inconsistent decisions.
- [x] Gate per-node deterministic template emission and reuse structurally equivalent definitions without duplicate generation.
- [x] Compile generated code in isolated offline browser contexts, validate inert element data, and keep generated JavaScript out of the active app runtime.
- [x] Emit a standalone app with deterministic query/path/body wiring, graph-fed inputs, response rendering, and read refreshes.
- [x] Independently compare original/rebuilt text, accessible controls/current state, network methods/variables/status/response, runtime errors, and screenshots. Report untested endpoint/control occurrences.
- [x] Persist endpoint/layout scaffolds, all Jev decisions and local component emissions, observations, screenshots, cost accounting, and verification reports. Keep missing usage/pricing and mock benchmarks explicitly unverified.
- [x] Provide three prefilled UI/CLI demos: catalog search, contacts CRUD, support ticket submission.
- [x] Verify all three actual pipelines, archive downloads, and new interactions in the rebuilt apps on desktop and mobile.
- [x] Independent review completed; generated-code authority, CSS indirection, wrapped lists, select/check/radio values, and repeated-control coverage findings addressed with regressions.

## Current evidence

- `pnpm test`: 36 JavaScript tests + 203 TypeScript tests passed (239 total), including the current main branch home-layout tests.
- `pnpm typecheck`: passed.
- `pnpm build`: passed. The existing unrelated local-browser subprocess tracing warning remains.
- `E2E_PRODUCTION=1 E2E_PORT=3113 pnpm test:e2e tests/e2e/clean-room*.spec.ts --workers=1`: 18 passed across desktop/mobile UI flows plus pipeline and isolation regressions. Browser-dependent tests run in the Playwright suite after CI installs Chromium.
- A deliberately unwired search is rejected by independent verification despite the app rendering.
- Generated top-level API calls and CSS custom-property resource indirection are rejected without reaching the target.
- CLI runs write app, JSON, and screenshot evidence under ignored `.clean-room/<run>/`; UI runs use a temporary directory and expose artifact downloads. Use the UI or `--serve` to keep the demo API and rebuilt app alive for interactive previews.

## Remaining live evidence

- A real Jev classification run and measured cost comparison remain unverified. Prior attempts stopped at the first endpoint classification with TypeSafe HTTP 402; evidence is retained in `.clean-room/live-provider-final-check/verification.json`.
- No generation-provider setup or credentials are needed. The external generator has been removed, and both demo and live modes use the same local emitter.
- An external target was not supplied. The three supplied local targets are fully configured functional demos.

## Jev-only correction

The model adapter exposes only Jev classification. The component emitter uses a trusted local template, never a model request, and does not consume the Jev call budget. Audit records identify deterministic emission with zero model tokens; cost reports count local component emissions separately and report zero generation-model calls.

A regression rejects any network fetch during live-mode emission and verifies identical output in demo mode. Existing independent browser tests exercise the emitter, standalone runtime, API wiring, downloaded evidence, and fresh interactions in all three demos.

Review follow-up: normalize target origins, reserve concurrent job slots before asynchronous setup, make close idempotent for successful and failed jobs, remove evicted run directories and temporary download archives, and close test jobs in finally blocks. Regression coverage includes trailing-slash origins and concurrent starts/repeated shutdown.
