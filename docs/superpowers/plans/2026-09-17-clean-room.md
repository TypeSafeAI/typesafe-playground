# Clean-room pipeline implementation plan

Goal: rebuild an observed web UI from endpoint contracts and browser observations, with Jev classification, local deterministic code generation, deterministic wiring, and independent evidence.

Architecture: local TypeScript CLI orchestrates Playwright capture, schema discovery, classification, reusable DOM component generation, standalone export, and behavioral verification. No target source files, bundles, or stylesheets enter generation context. Browser observations contain semantic elements, computed presentation, and network JSON only.

Tech stack: existing pnpm/tsx, Zod, Playwright, TypeSafe transport, Node HTTP server, browser ES modules.

1. `tests/clean-room.test.ts`: assert OpenAPI refs/variables, validation, decision gating/reuse, audit/cost behavior, and mismatch detection. Run `pnpm exec tsx --test tests/clean-room.test.ts` before implementation.
2. `src/clean-room/contracts.ts`, `discovery.ts`: bounded configuration, endpoint schemas, observed elements, scenarios, explicit evidence provenance.
3. `src/clean-room/models.ts`, `classify.ts`: closed choice questions only; enforce context limits, record every request/result/failure; gate local template emission and reuse existing definitions; never call an external generation model; unknown usage remains unknown.
4. `src/clean-room/browser.ts`: capture semantic/computed-style trees and API traffic from explicitly configured pages and user-provided interactions; record baselines/screenshots without reading application source.
5. `src/clean-room/emit.ts`, `runtime.js`, `server.mjs`: export DOM component modules and deterministic bindings with query/path/body mapping, render responses, refresh reads after mutations, and server-side API proxy.
6. `src/clean-room/verify.ts`: fresh browser comparisons of target/rebuild text, elements, screenshots, errors and request/response traces. Uncovered endpoints and interactions remain explicit gaps.
7. `src/clean-room/run.ts`, `scripts/clean-room.ts`: stage artifacts, failure persistence, live adapters, CLI and local reference demo. Add pnpm scripts and documentation.
8. `tests/e2e/clean-room-integration.spec.ts`: actual local HTTP target and standalone rebuilt app, with simulated Jev choices explicitly marked mock and the same deterministic component emitter as live runs. Verify both successful behavior and deliberately broken wiring.
9. Run focused tests, full `pnpm test`, `pnpm typecheck`, `pnpm build`, and the live CLI if credentials and target are available. Inspect artifacts against all six requirements. No automatic commit or publish.

External target URL/docs are pending. A local reference proves the mechanism, not fidelity to an unspecified target.
