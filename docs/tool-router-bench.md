# Tool router benchmark

A command-line experiment: given a task in plain text and a catalog of 40 tools described by one-line snippets, can Jev pick the right tool (and a useful top-3) from the snippets alone, how does that compare with a deterministic lexical ranker, and how many context bytes does an agent save by loading only the chosen tools' full schemas instead of all of them?

**What it is not.** A routing pick is evidence about which tool a task is asking for; it is not authorization to run anything, and nothing here executes a tool. The catalog and tasks are synthetic (`fixtures/tool-router/`), written for this experiment and not taken from any real repository or service. Mock-mode numbers exercise the harness and say nothing about Jev. This is independent community work in the community playground, not an official TypeSafe product, and the benchmark is 30 tasks, not a capability claim. It is unrelated to the `/tool-router` workspace, which routes one graph edge at a time; see [tool-router.md](tool-router.md).

## Question shape

One request per task, one `choice` question, pinned to `jev-1.13.0` (the release `jev-latest` resolved to on [docs.typesafe.ai/models](https://docs.typesafe.ai/models) when this was written; the alias is never sent so every result file names the exact model).

```json
{
  "model": "jev-1.13.0",
  "state": { "task": "Text Jordan that the deploy finished." },
  "questions": {
    "tool": {
      "type": "choice",
      "instructions": "Choose the one tool whose description best fits the task in state.task. ... Choose none when no listed tool does what the task asks ... Selecting a tool is routing evidence only; it is not authorization to run it.",
      "criteria": {
        "read_file": "Read the full text of one file at a workspace path.",
        "...": "... 38 more name: snippet pairs ...",
        "send_sms": "Send a short text message to a phone number.",
        "none": "No listed tool fits this task, or the task is not a tool request."
      }
    }
  }
}
```

Jev sees only `name` and `snippet` for each tool; full schemas are never in the payload (a test asserts the serialized request contains no `properties`). The full instructions are `TOOL_INSTRUCTIONS` in `lib/tool-router/route.ts`; `docs/tool-router-results.json` carries a complete sample request.

- **Single stage.** [Choice accepts up to 255 options](https://docs.typesafe.ai/primitives/choice), so 40 tools plus `none` fit in one question. `planRoute` reports `single` for this catalog.
- **Two stage.** When tools + `none` would exceed 255, the router asks a category question first (each option lists that category's tool names), then a tool question restricted to the chosen category. Results record `path: "two-stage"` and `stageCategory`. This path is covered by tests with a 300-tool synthetic catalog and was not needed for the benchmark.
- **Closed set, no default.** `choice` must be one of the offered ids. An invented id, a non-choice answer, a provider error, a timeout, or cancellation yields `unavailable` with `top1: null` and an empty `top3`; the router never falls back to an argmax or a first option.
- **`none` is a choice.** `none: true` only when Jev selected the `none` option.

## Top-3: from the choice distribution, not score questions

`top3` is the three tool options with the highest `probabilities` from the same choice answer, with Jev's `choice` kept first and `none` excluded. No `score` questions are sent.

Reason: the choice answer already returns [the full probability distribution across every option](https://docs.typesafe.ai/primitives/choice), so a ranking costs zero extra questions. A [`score`](https://docs.typesafe.ai/primitives/score) question rates one item on a 2 to 10 level ordered scale and returns a weighted mean level; ranking 40 tools that way would mean 40 score questions per task (one per tool), and each would measure absolute fit in isolation rather than preference among the options. That is neither cheap nor the right shape. Observed in the live run below: the provider reports probabilities at 0.01 granularity and concentrated all mass on one option for most tasks, so `top3` usually had a single entry. Caveat: probabilities near the floor of the distribution are a weak ordering signal, so read top-3 accuracy as "the expected tool got non-trivial mass", not as a calibrated second and third pick.

## Baseline

`rankLexically` in `lib/tool-router/baseline.ts` is a BM25-lite ranker over the same `name + snippet` text Jev sees: lowercase, split on non-alphanumerics, drop a short stopword list, strip a trailing `s`, then per-term idf times saturating term frequency (k1 = 1.2, b = 0.75). Ties break by name, so it is fully deterministic. It answers `none` only when no query term overlaps any tool, which is deliberately naive.

## Metrics

Accuracy is over the 25 tasks whose expected answer is a tool. **Top-1** is `top1 === expected`; **Top-1 (acceptable)** also counts any tool in the task's `acceptable` list (two tasks list a second acceptable tool); **Top-3** is `expected` in `top3`. An `unavailable` or `none` result counts as a miss on all three. **None precision/recall** treat `none` as the positive class over all 30 tasks; unavailable results are neither a `none` prediction nor a tool pick. **Unavailable** counts tasks with no usable answer. **Mean Jev ms** is wall-clock per task over available results, including transport overhead.

**Context bytes** use compact JSON byte lengths from the fixtures: "all schemas" is every `{name, schema}`; "snippets only" is every `{name, snippet}` (the router's own input); "snippets + top-k" adds the top-k tools' schemas per task (nothing extra for `none`, all schemas when unavailable, since a failed router leaves the agent loading everything), averaged over the 30 tasks.

## How to run

```sh
pnpm exec tsx scripts/tool-router-bench.ts                         # mock, writes docs/tool-router-results.json
op run --env-file=.env.1password -- pnpm exec tsx scripts/tool-router-bench.ts --live --output docs/tool-router-results.live.json
pnpm exec tsx --test tests/tool-router-bench.test.ts
```

Live mode needs `TYPESAFE_API_KEY` in the environment, sends one request per task (30 total, no retries, sequential, 50 s timeout each), and exits with status 1 if any task came back unavailable so a partial run is never mistaken for a complete one. The result JSON records the requested model, every model id the provider reported, token usage, per-task picks with probabilities, and a sample request.

## Results: mock mode

Mock transport (`lib/tool-router/mock.ts`) turns lexical overlap into a probability distribution with a fixed weight on `none`. These tables only show the harness working; the mock and the baseline share a vocabulary, so their agreement is expected. Source: `docs/tool-router-results.json`.

### Baseline (lexical BM25-lite over name + snippet)

| Category | Tasks | Top-1 | Top-1 (acceptable) | Top-3 | None precision | None recall | Unavailable |
| --- | --- | --- | --- | --- | --- | --- | --- |
| calendar | 3 | 33.3% (1/3) | 33.3% (1/3) | 33.3% (1/3) | n/a | n/a | 0 |
| code | 3 | 66.7% (2/3) | 66.7% (2/3) | 100.0% (3/3) | n/a | n/a | 0 |
| data | 3 | 33.3% (1/3) | 33.3% (1/3) | 66.7% (2/3) | n/a | n/a | 0 |
| email | 3 | 33.3% (1/3) | 33.3% (1/3) | 33.3% (1/3) | n/a | n/a | 0 |
| files | 3 | 33.3% (1/3) | 33.3% (1/3) | 66.7% (2/3) | n/a | n/a | 0 |
| notify | 4 | 75.0% (3/4) | 75.0% (3/4) | 75.0% (3/4) | n/a | n/a | 0 |
| tickets | 3 | 0.0% (0/3) | 0.0% (0/3) | 66.7% (2/3) | n/a | n/a | 0 |
| web | 3 | 0.0% (0/3) | 0.0% (0/3) | 33.3% (1/3) | n/a | n/a | 0 |
| none | 5 | n/a | n/a | n/a | 100.0% (4/4) | 80.0% (4/5) | 0 |
| **Total** | 30 | 36.0% (9/25) | 36.0% (9/25) | 60.0% (15/25) | 100.0% (4/4) | 80.0% (4/5) | 0 |

### Jev (mock transport)

| Category | Tasks | Top-1 | Top-1 (acceptable) | Top-3 | None precision | None recall | Unavailable | Mean Jev ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| calendar | 3 | 33.3% (1/3) | 33.3% (1/3) | 66.7% (2/3) | n/a | n/a | 0 | 33 |
| code | 3 | 100.0% (3/3) | 100.0% (3/3) | 100.0% (3/3) | n/a | n/a | 0 | 0 |
| data | 3 | 66.7% (2/3) | 66.7% (2/3) | 66.7% (2/3) | n/a | n/a | 0 | 4 |
| email | 3 | 0.0% (0/3) | 0.0% (0/3) | 33.3% (1/3) | n/a | n/a | 0 | 2 |
| files | 3 | 33.3% (1/3) | 33.3% (1/3) | 100.0% (3/3) | n/a | n/a | 0 | 0 |
| notify | 4 | 50.0% (2/4) | 50.0% (2/4) | 50.0% (2/4) | n/a | n/a | 0 | 0 |
| tickets | 3 | 33.3% (1/3) | 33.3% (1/3) | 66.7% (2/3) | n/a | n/a | 0 | 1 |
| web | 3 | 0.0% (0/3) | 0.0% (0/3) | 33.3% (1/3) | 0.0% (0/1) | n/a | 0 | 0 |
| none | 5 | n/a | n/a | n/a | 100.0% (4/4) | 80.0% (4/5) | 0 | 0 |
| **Total** | 30 | 40.0% (10/25) | 40.0% (10/25) | 64.0% (16/25) | 80.0% (4/5) | 80.0% (4/5) | 0 | 4 |

### Context bytes (mean per task)

| Strategy | Bytes | Of all schemas |
| --- | --- | --- |
| All 40 full schemas | 19000 | 100.0% |
| Snippets only (router input) | 4010 | 21.1% |
| Snippets + baseline top-3 schemas | 5067 | 26.7% |
| Snippets + baseline top-1 schema | 4419 | 23.3% |
| Snippets + Jev top-3 schemas | 5052 | 26.6% |
| Snippets + Jev top-1 schema | 4402 | 23.2% |

## Results: live

One run on 2026-09-22 (started 08:41:52 UTC, finished 08:42:01 UTC) with model `jev-1.13.0` requested and `jev-1.13.0` reported by the provider on every response. 30 requests, 43,251 input and 10,869 output tokens, 0 unavailable. Source: `docs/tool-router-results.live.json`, run with `op run --env-file=.env.1password -- pnpm exec tsx scripts/tool-router-bench.ts --live --output docs/tool-router-results.live.json`.

### Baseline (lexical BM25-lite over name + snippet)

| Category | Tasks | Top-1 | Top-1 (acceptable) | Top-3 | None precision | None recall | Unavailable |
| --- | --- | --- | --- | --- | --- | --- | --- |
| calendar | 3 | 33.3% (1/3) | 33.3% (1/3) | 33.3% (1/3) | n/a | n/a | 0 |
| code | 3 | 66.7% (2/3) | 66.7% (2/3) | 100.0% (3/3) | n/a | n/a | 0 |
| data | 3 | 33.3% (1/3) | 33.3% (1/3) | 66.7% (2/3) | n/a | n/a | 0 |
| email | 3 | 33.3% (1/3) | 33.3% (1/3) | 33.3% (1/3) | n/a | n/a | 0 |
| files | 3 | 33.3% (1/3) | 33.3% (1/3) | 66.7% (2/3) | n/a | n/a | 0 |
| notify | 4 | 75.0% (3/4) | 75.0% (3/4) | 75.0% (3/4) | n/a | n/a | 0 |
| tickets | 3 | 0.0% (0/3) | 0.0% (0/3) | 66.7% (2/3) | n/a | n/a | 0 |
| web | 3 | 0.0% (0/3) | 0.0% (0/3) | 33.3% (1/3) | n/a | n/a | 0 |
| none | 5 | n/a | n/a | n/a | 100.0% (4/4) | 80.0% (4/5) | 0 |
| **Total** | 30 | 36.0% (9/25) | 36.0% (9/25) | 60.0% (15/25) | 100.0% (4/4) | 80.0% (4/5) | 0 |

### Jev (jev-1.13.0)

| Category | Tasks | Top-1 | Top-1 (acceptable) | Top-3 | None precision | None recall | Unavailable | Mean Jev ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| calendar | 3 | 100.0% (3/3) | 100.0% (3/3) | 100.0% (3/3) | n/a | n/a | 0 | 228 |
| code | 3 | 100.0% (3/3) | 100.0% (3/3) | 100.0% (3/3) | n/a | n/a | 0 | 258 |
| data | 3 | 100.0% (3/3) | 100.0% (3/3) | 100.0% (3/3) | n/a | n/a | 0 | 332 |
| email | 3 | 100.0% (3/3) | 100.0% (3/3) | 100.0% (3/3) | n/a | n/a | 0 | 246 |
| files | 3 | 100.0% (3/3) | 100.0% (3/3) | 100.0% (3/3) | n/a | n/a | 0 | 402 |
| notify | 4 | 100.0% (4/4) | 100.0% (4/4) | 100.0% (4/4) | n/a | n/a | 0 | 235 |
| tickets | 3 | 100.0% (3/3) | 100.0% (3/3) | 100.0% (3/3) | n/a | n/a | 0 | 453 |
| web | 3 | 100.0% (3/3) | 100.0% (3/3) | 100.0% (3/3) | n/a | n/a | 0 | 191 |
| none | 5 | n/a | n/a | n/a | 100.0% (5/5) | 100.0% (5/5) | 0 | 225 |
| **Total** | 30 | 100.0% (25/25) | 100.0% (25/25) | 100.0% (25/25) | 100.0% (5/5) | 100.0% (5/5) | 0 | 280 |

### Context bytes (mean per task)

| Strategy | Bytes | Of all schemas |
| --- | --- | --- |
| All 40 full schemas | 19000 | 100.0% |
| Snippets only (router input) | 4010 | 21.1% |
| Snippets + baseline top-3 schemas | 5067 | 26.7% |
| Snippets + baseline top-1 schema | 4419 | 23.3% |
| Snippets + Jev top-3 schemas | 4511 | 23.7% |
| Snippets + Jev top-1 schema | 4433 | 23.3% |

Reading these tables:

- Jev picked the expected tool on all 25 tool tasks and `none` on all 5 none tasks, including every distractor pair (`search_inbox` vs `search_tickets`, `create_event` vs `create_reminder`, `send_sms` vs `send_push_notification`, `export_csv` vs `import_csv`, `format_code` vs `lint_code`, `fetch_url` vs `screenshot_page`) and the prompt-injection-shaped task, which went to `none`. The baseline got 9 of 25 and answered `none` for 4 of 5. This is one run over 30 synthetic tasks with an easy, clean catalog; it shows that snippet-only routing works on this fixture, not a general accuracy figure.
- **Top-3 is effectively top-1 here.** The provider reports probabilities at 0.01 granularity and put all mass on a single option for 23 of 30 tasks, so `top3` had one entry for 23 tasks, two for 3, three for 1, and none for the 3 `none` tasks whose distribution was `none: 1.0`. Top-3 accuracy therefore adds no information on this catalog, and "snippets + Jev top-3 schemas" is close to "snippets + Jev top-1 schema" for the same reason. A catalog with closer alternatives, or a task set written to be ambiguous, would be needed to evaluate a real second and third pick. Reported `confidence` ranged from 0.73 (t16, `run_aggregation` 0.74 vs `query_sql` 0.25, both acceptable) to 1.0, mean 0.97.
- Context bytes: loading every schema costs 19,000 bytes per task; the router's own input (name + snippet for all 40 tools) is 4,010 bytes, and snippets plus the routed schema comes to 4,433 bytes on average, 23.3% of loading everything. The router's input is the dominant cost of that 23.3%, so the saving depends on schemas being much larger than snippets, which they are here by design (246 to 662 bytes vs 32 to 88 characters). The 43,251 input tokens across 30 requests (about 1,440 per request) are the price of sending all 41 options each time.
- Mean latency was 280 ms wall-clock per task from this machine, including the playground's server transport and rate-limit bookkeeping; no request retried or timed out.

## Files

- `lib/tool-router/types.ts`, `catalog.ts`, `baseline.ts`, `route.ts`, `mock.ts`, `metrics.ts`: pure TypeScript, no React, no network; the transport is injected.
- `fixtures/tool-router/catalog.json`: 40 tools in 8 categories with schemas of 246 to 662 bytes, 6 near-duplicate distractor pairs.
- `fixtures/tool-router/tasks.json`: 30 tasks, 5 expecting `none` (including one prompt-injection-shaped task).
- `scripts/tool-router-bench.ts`, `tests/tool-router-bench.test.ts`.

Credits: this experiment lives in the community playground that extends [@nickthompson480's original TypeSafe AI playground](https://github.com/nickthompson480/typesafe-ai-playground) under the MIT license. It is not affiliated with or endorsed by TypeSafe AI.
