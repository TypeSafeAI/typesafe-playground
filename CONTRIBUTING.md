# Contributing

This is an independent community example library and Jev playground. Useful small contributions include a new synthetic scenario, a clearer question, a reproducible confusing result, or a usability fix. Preserve the original playground attribution and MIT license.

Read [README.md](README.md) for the workspaces and [AGENTS.md](AGENTS.md) for repository-specific boundaries. Keep changes focused; do not bundle dependency upgrades, production integrations, or new execution authority into a documentation or example fix.

## Next.js development

Use Node.js 22+ and the pnpm version pinned in package.json. Install with `pnpm install --frozen-lockfile`, copy `.env.example` to `.env.local`, and start with `pnpm dev`. Configure a server-only TypeSafe key only when intentionally running live evaluations; mocked tests do not need one.

The local package-manager guard requires pnpm for installation and the dev, build, start, test, typecheck, browser-test, and LangChain scripts. Keep only pnpm-lock.yaml; do not introduce npm, Yarn, or Bun lockfiles or bypass the guard.

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm check:secrets   # what the pre-commit hook and CI run
```

`pnpm install` also installs a pre-commit hook (`.githooks/`) that blocks staged `.env` files and well-known key shapes. If it fires on a false positive, rewrite the text so it is unambiguous; if it fires on a real key, rotate the key. See [SECURITY.md](SECURITY.md).

Browser tests mock Jev and do not need API credits. CI uses the production build; after building, `E2E_PRODUCTION=1 E2E_PORT=3002 pnpm test:e2e` reproduces that server mode. Do not describe lint as a required existing script: there is no root lint script at this revision.

## Add an example

1. Create a focused branch and add a case to the relevant pack in `web/catalog.json`, or add a clearly named pack.
2. Include a unique, stable id, clear title, short description, synthetic state, and concrete `tryThis` variation. Reuse the pack's questions or provide a `questions` override when necessary.
3. Choose an appropriate collection, such as Use cases, Fun & games, Dilemmas & debates, or Model challenges. Follow current catalog entries and validation tests for the exact field shapes.
4. Run relevant checks and try the example in the browser. Explain what the example tests and why it is useful in the pull request.

Browser exports contain fully expanded questions in a top-level `examples` array; the repository groups examples under `packs`. Place exported cases into the appropriate pack instead of replacing the whole catalog with a portable export. Stable ids are important because saved browser drafts refer to them.

## Evidence and reference notes

A useful example has a clear decision, enough context to answer—or deliberately missing facts to test uncertainty—and narrow typed questions with explicit choices or ordered criteria. Include a contrast case or a specific modification someone can try.

For A/B or bias comparisons, change one declared field while holding the operational facts constant. State the intended invariant. One model run does not prove fairness, discrimination, accuracy, or robustness.

For puzzles, follow existing `test.kind: "puzzle"`, `test.note`, and `expectedA` / `expectedB` reference-choice conventions. Independently check arithmetic, logic, and assumptions. For subjective judgments, use `test.kind: "judgment"` without a universal answer key. For equivalent wording or irrelevant pressure, use `test.kind: "consistency"` and state what should stay unchanged. These are revealable teaching notes, not an automatic benchmark claim.

Use original synthetic wording. Link primary background sources where useful; do not copy benchmark datasets or claim an adaptation reproduces a published benchmark. Keep instruction-trap examples harmless and limited to the closed-set task. Never include real secrets, customer records, private logs, or operational attack steps.

## Shared and legacy checks

The original Python tests still cover the legacy server. For changes to shared web/Python code, run the relevant checks as well:

```sh
python3 -m unittest discover -s tests -v
python3 -m py_compile server.py run.py
node --test tests/test_catalog.js tests/test_conversation.js tests/test_workflow.js
node --check web/app.js
node --check web/library.js
node --check web/theme.js
node --check web/conversation.js
node --check web/conversation-ui.js
node --check web/workflow.js
node --check web/workflow-ui.js
```

Keep automated tests offline. Never add a real API key to CI or make shared-key calls from a test. Pure request logic belongs in shared modules, React workspaces in components/, and route handlers in app/. Do not remove the legacy interface simply because a newer workspace exists.

## UI review and reporting

Inspect desktop and narrow layouts, including 1280×720, 390×844, and 320×568 where relevant. Check keyboard focus, themes, touch controls, overflow, scroll behavior, collection/category filters, Text/JSON editing, reset/undo, draft persistence, custom examples, and both successful and failed runs. Keep mock/live labels, uncertain outcomes, and source evidence visible.

A report or pull request should state the example id or workspace, relevant synthetic input, expected and observed behavior, returned model when relevant, commands actually run, results, and any unverified behavior. Inspect exports and screenshots before attaching them; they can contain inputs even when credentials are excluded. Do not report a failed or incomplete result as a pass.

Contributions are licensed under the repository's [MIT license](LICENSE). Preserve existing author and asset/font notices.
