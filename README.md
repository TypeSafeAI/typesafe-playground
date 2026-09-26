# TypeSafe AI Playground

A community playground for **TypeSafe AI's Jev**: edit classification experiments, compare A/B inputs, route conversations, extract document fields, inspect code-policy decisions, and explore games and simulations built around typed model outputs.

**Small experiments. Clear decisions.** This is an independent community project, not an official TypeSafe AI product, production agent harness, or claim that a typed answer is correct.

**Shout-out to [@nickthompson480](https://github.com/nickthompson480) for the [original TypeSafe AI playground (examples only)](https://github.com/nickthompson480/typesafe-ai-playground).** This community extension builds on that project's example library and Python foundation with a Next.js interface and interactive prototypes. The original credit and [MIT license](LICENSE) are retained.

[Open the live playground](https://typesafe-ai-playground.vercel.app) · [TypeSafe API documentation](https://docs.typesafe.ai/introduction/quickstart) · [Contributing](CONTRIBUTING.md) · [Agent guide](AGENTS.md)

![TypeSafe AI community playground: Small experiments. Clear decisions.](public/og.png)

## Run locally

Use **Node.js 22+** and the exact pnpm version pinned in [package.json](package.json), currently `10.34.5`. Use pnpm only: the repository's local guard rejects other package managers, and `pnpm-lock.yaml` is the single JavaScript dependency lockfile.

```sh
git clone https://github.com/TypeSafeAI/typesafe-playground.git
cd typesafe-playground
# Install/activate the pnpm version declared in package.json.
# Where Corepack is installed, `corepack enable` enables its shims.
pnpm install --frozen-lockfile
cp .env.example .env.local
# For live evaluations, edit .env.local and set TYPESAFE_API_KEY.
pnpm dev
```

Open the dedicated development address, `http://localhost:3042`. `pnpm dev` keeps this port by default; use `pnpm dev --port 3001` to explicitly select another port. You can browse/edit examples without a key; explicitly mocked demos and local solver/simulation paths do not require live Jev calls. Controls labeled **Live Jev** need a configured key.

### 1Password-backed key (recommended)

Keep the key in 1Password and run the app through `op run`, so no secret ever
lands in a file:

```bash
pnpm dev:op
```

`.env.1password` is committed and holds a **reference**, not a secret:
`TYPESAFE_API_KEY="op://Development/Jev API Key/password"`. `op run` expands it
into the process environment at launch. Requires 1Password CLI 2.x, unlocked
(desktop-app integration or `op signin`).

Verify it took effect — `configured` reports whether the SERVER has a key:

```bash
curl -s http://localhost:3042/api/health
# {"ok":true,"configured":true}
```

A shell-provided variable is not overridden by `.env.local` (`@next/env`'s
`processEnv` only fills keys absent from the initial environment), so this path
wins over any stale key left in `.env.local`.

The server environment key is not sent to the browser. Never prefix it with `NEXT_PUBLIC_`, put it in a component, or commit `.env.local`. A browser-supplied personal key follows a different path, documented below.

## Choose a workspace

The playground has five sections, each with its own page: Language & data (`/language`), Agents & workflows (`/agents`), Code & governance (`/governance`), Games & simulations (`/simulations`), and the Arcade (`/arcade`). Every workspace lives under its section, such as `/language/jev-chat`. The home page searches and filters all of them, and the sidebar's section labels open each section page.

Older flat links such as `/jev-chat` or `/chess` redirect permanently to their new home, query strings included. The route map in `lib/routes.ts` feeds the navigation and those redirects, so they cannot drift apart.

| Workspace | What to explore |
| --- | --- |
| **Example builder** `/language/examples` | Editable typed questions, a shared example catalog, and declared A/B input changes. |
| **Conversation lab** `/language/conversation` | Parse conversations, rank possible reply recipients, and compare full-context versus isolated-message judgments. |
| **Ask gate** `/agents/gate` | Check official TypeSafe documentation first, then earlier messages, then route to a human, retaining supporting citations. |
| **Jev Chat** `/language/jev-chat` | Explore Jev-driven scripted composition with selectable personalities, cited source passages, fictional scenes, saved threads, and verifiable response graphs. See the [chat guide](docs/jev-chat.md). |
| **Workflow chat** `/agents/workflow` | Apply editable case rules and request missing facts before recommending an action. |
| **Document extraction** `/language/extraction` | Find source candidates locally, then ask Jev to choose candidates or `null`. |
| **YouTube extract** `/language/youtube-extract` | Select original caption passages with Jev relevance scores, live usage metrics, and timestamp-linked source verification. See [contract and limits](docs/youtube-extract.md). |
| **PR review** `/governance/pr-review` | Classify public PR/diff hunks and inspect policy-gated review queues. |
| **Proposal review** `/governance/proposal-review` | Let an agent propose one patch, ask Jev four yes/no questions, and let a fixed decision table decide. Receipts, mock and live; nothing is applied. Uses a pinned shared community harness with 25 scripted fixtures. See [the harness guide](docs/proposal-review.md). |
| **AST governance** `/governance/ast-governance` | Explore changed symbols, callers, deterministic policy, and ambiguous findings. |
| **SMT solver** `/governance/smt-solver` | Compare Jev classifications with real server-side Z3 checks and decomposition. |
| **Tool router** `/agents/tool-router` | Inspect closed-set routing with simulated tools, policy blocks, and mock approval gates. |
| **LangChain** `/agents/langchain` | Invoke a real LangChain tool adapter with mocked or live Jev predictions. |
| **Vector reranker** `/language/reranker` | Compare vector order, batched Jev relevance, and a labeled lexical mock baseline. |
| **Clean-room rebuild** `/agents/clean-room` | Run three complete local rebuild demos, or use the CLI with live Jev classification and deterministic code generation. Export the app and verification evidence. |
| **Browser agent** `/agents/jev-browser-agent` | Research a Newegg PC build in a local browser-use session with Jev closed choices, or run the synthetic flight demo. No text-generation model required. |
| **Jev plays Doom** `/simulations/doom` | Try an original browser shooter with human, Jev, and seeded random control. |
| **Meme lab** `/language/memes` | Classify reviewed captions and visual descriptions for tone, audience fit, and possible confusion. |
| **MicroDuck arena** `/simulations/microduck` | Compare bounded robot actions in a local 3D simulation. |
| **Jev attempts chess** `/simulations/chess` | Observe the limitations of legal-move selection without lookahead. |
| **Snake** `/arcade/snake` | Watch Jev steer a snake one cell per request, scored against a random baseline on the same seed. See [the Arcade guide](docs/arcade.md). |
| **Breakout** `/arcade/breakout` | Watch Jev move a paddle under a predicted landing column to keep the ball in play. |
| **Meteor dodge** `/arcade/meteor-dodge` | Watch Jev change lanes through falling meteors using a code-computed look-ahead. |

### Examples, drafts, and A/B comparisons

Search the catalog by name, collection, category, or A/B availability. Edit state as text or JSON, choose questions, and inspect their types and candidate definitions before running. **Edit all questions as JSON** exposes the full request configuration; apply edits before evaluation.

**Run example** makes one evaluation request. **Compare A/B** makes two with one declared input difference; the preview shows exactly what changes. A missing comparison field disables the comparison rather than silently inventing one.

Custom examples and drafts persist in browser storage for that origin. **Reset draft** offers an undo, while **Export library** and **Import** move examples between browsers; imported id collisions become copies. Results are not restored after refresh. Exported input may contain private text, so review files before sharing.

The canonical repository catalog is `web/catalog.json`, organized into `packs`. Portable browser exports use an `examples` array; they are not a drop-in replacement for the repository catalog. See [CONTRIBUTING.md](CONTRIBUTING.md) for stable ids, synthetic scenarios, and reference-note conventions.

Jev's `noul`, `choice`, and `score` outputs are typed decisions. A single run is not a validated accuracy, fairness, or consistency benchmark. Puzzle reference notes are teaching aids; subjective judgments have no universal answer key.

### Conversation lab and question triage

The conversation parser accepts Discord-style messages, labeled turns, or plain text. Inspect parsed speakers, timestamps, and multiline messages before evaluating. Recipient ranking uses only preceding context for each candidate; ties, incomplete runs, and no-reply outcomes remain explicit. Context A/B compares the conversation against the final message alone. No Discord messages are sent.

Discord's timestamped “is now a speaker.” stage notices, including copies split across a name and notification line, are excluded from message candidates. The preview reports the ignored count and leaves the raw transcript unchanged. Real speaker headers without a message still fail validation. Plain text mode preserves notification text as content.

The Ask gate chooses `already_answered`, `answerable_by_docs`, `needs_human`, or `needs_more_context`, with a prior-message or documentation-line citation. Suggested replies use fixed templates rather than generated answers. Unsupported outcomes, absent confidence, low-confidence matches, or unsupported citations fall back to human review. Batch triage uses only earlier messages, not future answers; moving the threshold recomputes decisions locally.

Ask gate retrieves `https://docs.typesafe.ai/llms-full.txt` server-side and caches the public corpus for 10 minutes. If the full feed is unavailable, it follows up to six relevant pages from `llms.txt` (three fetches at a time) and labels that limited fallback. Each question sends at most eight shortlisted passages to Jev; community context is checked only when no documentation answer passes the confidence gate. Retrieval failures stop the run visibly. Documentation requests never include your API key.

### Workflow chat and extraction

Workflow playbooks cover damaged delivery, account recovery, duplicate payment, service incidents, and expense approval. Edit the rules before starting a case. Jev must identify a supported rule before the interface recommends its configured action; otherwise the workflow asks for missing facts. **Recommendations only:** this prototype does not issue refunds, resend items, fine services, or ban accounts.

Extraction first finds exact source candidates locally, then submits a closed set plus `null` for selected fields. Results retain the selected candidate, probabilities, and copied source evidence. Empty candidate sets can return local `null` without a model call; request failure is distinct from a valid null selection. See the [extraction guide](docs/document-extraction.md).

### Code review, governance, and exact solving

The [PR review lab](docs/pr-review.md) loads public PR metadata or accepts a pasted diff, retains hunks as evidence, and applies thresholds and fixed policy to labels. It does not post GitHub reviews, merge changes, or execute a second-stage LLM. Mock examples are labeled.

The [AST governance lab](docs/ast-governance.md) explores symbol/caller relationships and deterministic checks before optional classification. Its parser, symbol index, and test cache are prototypes; a simulated cached test result is not evidence that tests ran. No repository code, tests, or merges are executed by the demo.

The [SMT solver lab](docs/smt-solver.md) is different: Z3 really checks the supplied constraints on the server. Jev predicts a closed-set outcome; a definitive solver result takes precedence over a conflicting prediction. Decomposition and on-demand benchmark tables are inspection tools, not a claim that a classifier proves arbitrary statements.

### Routing, LangChain, and reranking

The [Tool Router](docs/tool-router.md) restricts each step to allowed outgoing options, applies fixed policy, asks for clarification on uncertainty, and uses explicit mock approvals where configured. **All downstream agents and tools in that workspace are simulated.** A model choice is not authorization to execute an action.

The [LangChain adapter](docs/langchain.md) uses a real `@langchain/core` tool, validates inputs, and returns structured, policy-gated output. It does not execute downstream actions and is not a published plugin. Run the local example without live credits:

```sh
pnpm example:langchain
# Add --live only for an intentional, authorized call using your configured key.
```

The [reranker](docs/reranker.md) compares supplied vector order, Jev relevance, and an explicit lexical mock. It batches candidates and leaves unknown or failed classifications unscored, suppressing aggregate metrics when appropriate. Overlap, rank correlation, timing, and configurable cost estimates help inspect disagreements; the lexical baseline is not a neural reranker or quality ground truth.

### Browser agent

The [native command workspace](docs/native-browser.md) at `/agents/jev-browser-agent/native` adds delta-only page updates, batched field actions, exact local text values, and per-action usage reports. It includes two synthetic browser benchmarks and live Newegg navigation. Jev makes every policy decision; provider failures pause execution. Live token targets remain unverified while the configured provider key returns HTTP 402.

The [browser agent](docs/jev-browser-agent.md) fills the workspace with a browser, a goal composer at the bottom, and diagnostics in Inspector. The default Newegg task uses a local, isolated [browser-use](https://github.com/browser-use/browser-use) session, and Jev selects parts from a closed candidate set; nothing is purchased. The optional flight sandbox ports [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast): each request chooses an operation and compatible targets from an indexed element table, actions are checked for freshness before they run, and an independent verifier decides whether the goal was met.

### Meme lab and image handling

Paste a public HTTPS image URL, choose **Read image**, then review and correct the recognized text. Add relevant visual context and the intended audience before testing. Loading an image does not itself call Jev.

The server image loader bounds image size and redirects, blocks private/reserved addresses, and pins resolved connections. English OCR runs in the browser using Tesseract; its runtime and language data use configured public CDNs. OCR can misread characters and panel order, so manual correction is part of the workflow. Text can also be entered directly.

**Jev evaluates the reviewed text and description, not image pixels.** A URL alone is not visual context. Humor/tone classifications and estimated audience response are subjective feedback, not measured engagement or a promise of virality. The seeded meta-meme's pictured verdict is part of the joke, not an actual evaluation result.

### Games and simulations

**JevDoom** is an original Three.js/WebGL mini-game, not the Doom engine, and uses no Doom assets. Human, Jev, and seeded-random modes share a deterministic maze and action contract. W/S move, A/D strafe, Q/E turn, Space fires, F opens doors, and R uses items; touch controls and a tactical-map fallback are available. Fullscreen and screenshot mode change the presentation, not the model's authority.

The browser sends structured observations rather than rendered pixels. Model choices are limited to the configured action set. A turn toward a visible enemy uses its signed bearing to stop precisely on target; Jev still chooses whether to turn or shoot. Action freshness checks, bounded calls, cancellation, invalid-answer idling, and error pauses prevent an old or unusable response from becoming a new action. Chaos mode withholds a sensor for inspection without assuming confidence must decrease. Timing includes network latency; classification throughput is not the same as game actions per second. No generated code is executed.

**The Arcade** holds games Jev can play successfully because each move is a small, well-evidenced choice. Before every move, code computes what each legal action would do, such as a crash, the distance to the apple, or a short look-ahead. Jev chooses one action from the offered set. Every game is seeded, so the random baseline and the scripted demo face the identical world. A malformed answer plays a safe fallback that is labeled and never counted as a Jev choice. Live runs are capped per game and send at most one request a second. See [the Arcade guide](docs/arcade.md) for the contract and measured results.

**MicroDuck** is a local deterministic robot arena, not a connection to physical hardware. Inspect sensors, cargo, docks, and bounded seven-action control, and compare with a seeded random baseline. **Chess** intentionally exposes a limitation: choosing one legal move without lookahead is not a competitive chess engine; minimax-based comparison can mark mistakes. Keep simulated outcomes separate from claims about model capability.

## API keys, usage, and deployment

The header key control accepts a personal TypeSafe key that overrides the server default across Jev labs. It stays masked in the interface and persists in this browser's **unencrypted localStorage** until removed. It is sent in a header to this app's server, then used for TypeSafe authorization; it is not intentionally included in model state, results, or exports. Users must trust the deployment handling it. Masking is not protection from origin scripts, developer tools, or access to the browser profile.

Live runs send their supplied text to TypeSafe. Image URLs are fetched by the application server. Use synthetic data for demonstrations and inspect exported inputs before sharing. Do not expose a shared server key publicly without the controls in [deployment notes](docs/deployment.md): request limits are not authentication or a global spending cap. Use appropriate access restrictions, a restricted key, and provider-side budgets.

The usage dashboard records per-call usage where returned and session totals. Missing usage may be labeled as an approximation; failed/cancelled calls without reported usage are unknown, not free. Cost is an input-only estimate, not an invoice. The app does not invent account quotas, plan tiers, balances, or reset times when no supported provider response supplies them. Check current provider documentation rather than guessing quota endpoints.

Rate-limit and billing errors remain distinct. Reported `Retry-After` controls the rate-limit countdown; local and mocked demos remain available. Key changes must not let an in-flight response from a previous key block its replacement.

## Development and checks

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
python3 -m unittest discover -s tests -v
```

Browser tests mock Jev and should not consume TypeSafe credits. To test the production build separately from a running development preview:

```sh
E2E_PRODUCTION=1 E2E_PORT=3002 pnpm test:e2e
```

Build first. `pnpm start` serves the production application. There is no root lint script at this revision; use the actual scripts rather than inventing a passing check. For UI changes, inspect desktop/mobile layouts, keyboard use, both themes, draft persistence, error states, and overflow. Keep automated tests offline and report which checks actually ran.

| Path | Responsibility |
| --- | --- |
| `app/` | Next.js routes, server handlers, styles, and social metadata. |
| `components/` | Shared shell and workspace interfaces. |
| `lib/`, `types/` | Request contracts, decision logic, simulations, image/OCR utilities, and shared types. |
| `src/extraction/` | Source candidate extraction and Jev ranking. |
| `web/catalog.json` | Shared example catalog. |
| `web/` | Legacy interface and tested shared JavaScript helpers. |
| `tests/` | Unit/API, legacy Python, and browser tests. |
| `docs/` | Detailed integration and deployment guides. |
| `public/` | Local brand assets, social images, and example media. |

## Legacy Python UI

The original static playground remains in `web/`. With Python 3.10+, run `python3 run.py` and enter the key at the hidden prompt. It serves port 8765 by default and can read an existing `TYPESAFE_API_KEY` environment variable, but does not load `.env` files. The newer extraction and Meme workspaces require Next.js. Preserve the legacy tests and shared catalog when changing the modern interface.

## Contributing, credits, and related projects

Use original synthetic scenarios, stable ids, and clear questions. See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution and validation details, and [AGENTS.md](AGENTS.md) for repository-specific agent guidance.

Thanks again to **[@nickthompson480](https://github.com/nickthompson480)** for the original playground, and to TypeSafe AI for Jev. This extension retains the [MIT license](LICENSE). TypeSafe brand artwork is stored in `public/brand`; IBM Plex font licensing is retained in [public/brand/OFL.txt](public/brand/OFL.txt). Branding does not imply vendor endorsement.

Other community projects serve distinct roles: [Clarity Judge](https://github.com/TypeSafeAI/clarity-judge) evaluates writing against named checks; [Jev Tool & Model Router](https://github.com/BunsDev/typesafe-router) provides source-level routing logic; [TypeSafe UI](https://github.com/TypeSafeAI/typesafe-ui) provides reusable interface patterns; [Jev Social](https://github.com/socai-io/jev-social) pairs Jev's typed routing with the local socai CLI for Instagram, TikTok, and LinkedIn research with streamed, source-linked evidence. They are not automatically wired together or officially supported as a suite.

The intended GitHub About description and discovery topics are recorded in [repository-metadata.json](repository-metadata.json). Editing that file does not apply GitHub settings automatically, and discovery topics are not release tags.

### Clean-room rebuild pipeline

Open `/agents/clean-room` for three prefilled, functional demos: catalog search, contacts CRUD, and support tickets. Each observes a real local target, reconstructs its UI and endpoint bindings, and independently compares browser behavior. Demo Jev choices are explicitly simulated; custom targets use live Jev. Both use the same local, deterministic code generator. No external generation model or extra credentials are required. `pnpm clean-room --demo catalog --serve` runs the same pipeline from the terminal. See [setup, artifacts, cost tracking, and limits](docs/clean-room/README.md).
