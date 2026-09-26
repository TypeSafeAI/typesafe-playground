# Clean-room rebuild

Open `/agents/clean-room` on localhost for three prefilled, runnable demos:

| Demo | Behavior checked against the original |
| --- | --- |
| Searchable catalog | Initial product cards, search form, query request, filtered results |
| Contacts CRUD | List, create Grace, update Ada to Katherine, delete Grace, refreshed results |
| Support ticket | Email and message submission, JSON body, ticket confirmation |

Each demo starts an independent local target, observes it through Chromium, rebuilds it, and opens the result on a separate localhost origin. The UI uses **simulated Jev choices**, clearly labeled. These exercise the full pipeline without credentials; they do not measure Jev quality or live model cost. The catalog and contacts demos emit one reusable list-item definition through the same deterministic generator used in live runs. Duplicate items reuse that definition.

## Run

```sh
pnpm exec playwright install chromium
pnpm dev
# Open http://localhost:3042/clean-room
```

Or run from the terminal:

```sh
pnpm clean-room --demo catalog --serve
pnpm clean-room --demo contacts --serve
pnpm clean-room --demo support --serve
```

`--serve` keeps the target API and rebuilt app alive until Ctrl-C. Without it, the command verifies the rebuild, writes artifacts, and shuts down both servers. UI demo servers expire after 20 minutes; **Close demo servers** releases them earlier. Downloaded apps use the target API and require it to remain reachable. No original backend implementation is generated.

The local browser and subprocess runtime are unavailable on Vercel. The page explains local setup; POST/GET/download endpoints reject non-local and cross-origin requests. Generated component modules run only during compilation in fresh, offline, credential-free browser contexts. Network requests and sockets are blocked; generated element attributes and style properties are validated before serialization. The rebuilt app runs the deterministic renderer on that element data. Generated JavaScript is retained as an audit artifact and is not loaded or served by the active app.

## Live Jev and custom targets

The live pipeline uses Jev for endpoint classification, relationship selection, UI bindings, and generation/reuse decisions. Jev receives only closed-set choice questions. It never generates code or prose. All code generation is local and deterministic. `EMIT_TEMPLATE` emits a reusable component from a trusted template and the observed scaffold; duplicates reuse the definition. There is no external generation provider, model selection, or generation API key.

Configure server-only values in `.env.local`:

```dotenv
TYPESAFE_API_KEY=...
```

Demo and live runs share the same component emitter. It accepts observed scaffold data, never target source code, scripts, stylesheets, or full-page markup. Observations remain data rather than being interpolated into executable code. The isolated compiler validates each emitted element; the deterministic runtime renders children and attaches API behavior.

```sh
pnpm clean-room --demo catalog --live --serve
pnpm clean-room --config target.json --serve
```

Custom targets use live Jev for classification. Supply an origin, optional same-origin OpenAPI JSON path, and observed screen/interaction scenarios:

```json
{
  "target": "http://127.0.0.1:4000",
  "openapi": "/openapi.json",
  "screens": [{
    "id": "catalog",
    "path": "/catalog",
    "readyText": "Products",
    "scenarios": [{
      "id": "search",
      "actions": [
        { "kind": "fill", "role": "textbox", "name": "Search products", "value": "Cloud" },
        { "kind": "click", "role": "button", "name": "Search" }
      ],
      "expectText": "Cloud notebook"
    }]
  }]
}
```

Actions support `fill`, `click`, `select`, and `check`, using exact accessible names and an optional zero-based `nth`. Scenarios execute against the original target, including writes. Use a resettable test environment with equivalent starting data. Each scenario has a fresh browser context; server-global state and nondeterministic IDs/timestamps still need target-side isolation. The verifier reports differences instead of normalizing away business behavior.

Use `--output path` for a new or empty artifact directory. Existing artifacts are never overwritten. Bounds include 30 screens, 300 observed nodes per screen by default, 500 Jev calls, 0.7 minimum decision confidence, and a conservative 30 KB serialized Jev request ceiling below its 32K-token limit. Change the corresponding config fields explicitly. Oversized contexts, uncertain decisions, provider errors, invalid choices, and inconsistent bindings stop the run with persisted evidence; no mock fallback occurs.

## Artifacts and independent verification

Default output is `.clean-room/<demo-or-custom>-<timestamp>/`:

- `app/`: standalone browser ES modules, deterministic wiring, and a Node API proxy. Run `pnpm start` inside it; no dependency installation is needed.
- `endpoints.json`: discovered request/response schemas, variables, auth evidence, Jev categories, and selected dependency edges.
- `layouts.json`: per-screen indexed elements, observed presentation, classifications, component reuse, and endpoint/field bindings.
- `decisions.json`: every Jev request, response, probabilities, duration, usage, and error.
- `generation.json`: each local component emission input/output, deterministic implementation label, zero model tokens, and duration.
- `observations.json`, `original/`, `rebuilt/`: target observations and before/after screenshots.
- `verification.json`: independently replayed checks, network comparisons, visual differences, uncovered endpoints, and discrepancies.
- `cost.json`, `status.json`, `config.json`: cost evidence, terminal stage, and reproducible run settings.

Verification uses a fresh Chromium context for every screen/scenario and compares visible text, semantic elements/current values, every observed API request method/path/variables, response status/body, runtime errors, and full-page screenshots. Pixel differences above 2% fail by default. The UI captures at the current viewport; CLI runs use the configured viewport. A passing report proves that viewport, not all responsive breakpoints. Jev's completion claim is not consulted. An uncovered endpoint, unexercised named control, absent interaction scenario, or failed comparison yields `review-required` and a nonzero CLI exit. A report only covers the configured observations; it never claims all unobserved behavior works.

OpenAPI discovery resolves local references and inherited parameters. External references must be bundled first. Browser discovery captures same-origin JSON fetch/XHR traffic. The current runtime supports JSON requests, query/path variables, forms, response text, repeated list templates, navigation to captured routes, and refreshes read bindings after mutations. Only the initial screen structure is emitted; scenario observations are verification evidence. Cross-origin APIs, uploads, nested repeaters, canvas content, custom widgets, post-action dialogs or other newly introduced controls, externally loaded assets/fonts, and authentication flows may require adapters; discrepancies remain visible. Configure `CLEAN_ROOM_TARGET_TOKEN` for a server-side bearer token on the generated proxy. This does not authenticate original browser capture.

## Costs

The `$0.40` figure is a comparison reference from the brief, not a promised result. The report separates model call counts, reported tokens, known cost, unknown usage/pricing, and stages exceeding half the known cost.

Prices are USD per million tokens. Configure:

```dotenv
CLEAN_ROOM_JEV_INPUT_RATE=0.042
CLEAN_ROOM_JEV_OUTPUT_RATE=
```

The Jev input default matches the playground's existing input-only estimate. Unset Jev output prices remain unknown. Component emission uses zero model calls and tokens; `componentEmissions` counts local work separately from Jev calls and `generationCalls` remains zero. Set a price to `0` only when your provider actually charges zero. Missing usage is never treated as free. `totalCostUsd` remains unknown until every live call has usage and applicable pricing. The reference comparison additionally requires a completed run with passing independent verification. Mock runs cannot establish a live benchmark.

## Verification commands

```sh
pnpm exec tsx --test tests/clean-room.test.ts
E2E_PRODUCTION=1 E2E_PORT=3108 pnpm test:e2e 'clean-room.*\.spec\.ts'
pnpm test
pnpm typecheck
pnpm build
```

The E2E UI tests run all three real pipelines and then perform a new interaction in each rebuilt app. They do not stub the pipeline API or browser traffic.

The `clean-room` Playwright project runs the desktop/mobile UI demos and admission
test with one worker because they share the server's two-job pool. Other browser
tests retain their configured parallelism. Use `--project=clean-room` to run just
these shared-server cases; the pattern above also includes the independent pipeline
and isolation tests.
