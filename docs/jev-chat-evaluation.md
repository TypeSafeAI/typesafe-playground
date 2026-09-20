# Evaluate Jev Chat offline

The chat evaluator records the existing reply selector and the composition engine side by side, then checks their responses against authored synthetic fixtures.

```sh
pnpm exec tsx scripts/jev-chat-eval.ts --output /tmp/jev-chat-evaluation.json
```

This command runs both engines in local demo mode. It needs no API key, supplies no transport, and makes no provider requests. There is no `--live` option. A configured server key has no effect on this command.

The default [fixture collection](../tests/fixtures/jev-chat-evaluation.json) contains 28 cases covering capabilities in all four topics, explanation, exact source evidence, comparison, summaries, missing information, contradictory sources, conversational references, synthetic support, fiction, and a harmless source-instruction trap. Fixtures define expectations before inspecting produced answers. They are regression examples, not a sealed benchmark or an independently reviewed answer key.

## Read the report

The JSON report includes every input, expectation, evidence note, response text, selected reply or plan, source reference, duration, provider-call count, and token count. Composition artifacts include the full response graph. `fixtureHash` identifies the normalized fixture document, including its expectations.

`cases[].baseline` and `cases[].composition` each contain an `artifact`, `mechanical` assertions, `graphIntegrity`, and separate `quality` fields. Inspect a failed assertion alongside the original question and both answers. Keep failures visible when they identify a limitation; don't rewrite expectations simply to match the current implementation.

The `summary` counts completed and failed executions separately from mechanically passing and failing cases. Each numeric measurement reports `knownCount`, `unknownCount`, `knownSubtotal`, and `total`. A missing measurement stays `null`; any unknown value makes the full `total` unknown. Successful local demo calls and token counts are known zero because no model ran. Local elapsed time includes selection or composition and is not model latency or a cost estimate.

Mechanical checks include:

- A completed, nonempty demo response with zero provider calls.
- The expected intent or an explicitly allowed intent. The baseline's labels are annotations of its fixed reply catalog, not intent predictions.
- Case-insensitive required and forbidden substrings. These checks cannot understand negation, reasoning, or whether a mentioned fact answers the question.
- Required source IDs and exact preservation of referenced note paragraphs. Source selection does not establish source truth.
- Clarification status when the fixture explicitly requires or forbids it.
- Independent `verifyGraph` verification for composition responses, including equality between the verified graph text and recorded response text. Graph integrity establishes internal consistency, not factual correctness, source authenticity, or quality.

The baseline calls the original `chatCandidates` and `demoDecision` on the latest user message. The original selector has no creative topic, so `creative` maps to `guide`. It does not consume conversation history or produce a graph. Its graph status is `not-applicable`. Different candidate libraries and response contracts mean these results are not a controlled model comparison. The composition engine has an extra graph assertion, so raw assertion totals also differ.

A completed diagnostic run exits with status `1` when either engine has failed mechanical cases, and `0` when both pass. Invalid arguments, invalid fixtures and file errors also produce status `1`. Engine execution failures are retained as failed case artifacts when a report can be produced. Inspect the report to distinguish a failed expectation from a harness error; successful mechanical checks do not establish semantic quality.

## Supply your own fixtures

Pass `--fixtures` to replace the default collection for that run. The evaluator does not merge collections implicitly.

```sh
pnpm exec tsx scripts/jev-chat-eval.ts \
  --fixtures /tmp/my-chat-fixtures.json \
  --output /tmp/my-chat-evaluation.json
```

Without `--output`, the command writes JSON to stdout. This minimal fixture document can be saved as `/tmp/my-chat-fixtures.json`:

```json
{
  "version": "jev-chat-evaluation-v1",
  "cases": [
    {
      "id": "synthetic-bird-count",
      "category": "source-evidence",
      "input": {
        "topic": "notes",
        "notes": "The synthetic bird survey counted 47 birds.",
        "style": "balanced",
        "messages": [
          { "role": "user", "text": "How many birds did the survey count?" }
        ]
      },
      "expectations": {
        "expectedIntent": "answer",
        "requiredSubstrings": ["47"],
        "forbiddenSubstrings": ["48 birds"],
        "requiredSources": ["note_1"],
        "mustClarify": false
      },
      "evidenceNotes": "The supplied count is 47. Check whether the response actually answers the count question."
    }
  ]
}
```

Use `allowedIntents` instead of `expectedIntent` when more than one response intent is acceptable. Omit `mustClarify` when either status is permissible. Note source IDs count nonempty, blank-line-separated paragraphs starting at `note_1`. Assistant messages may include an `options` array to test a later ordinal reference. `style` defaults to `balanced`; `seed` optionally fixes the creative demo sequence.

Runtime validation rejects unknown fields, duplicate IDs, empty collections, more than 100 cases, and files over 2 MiB. Each case is limited to 12,000 note characters, 40 note paragraphs, 40 messages, 2,000 characters per user message, 24,000 characters per assistant message, and 50,000 serialized conversation characters. Expectations and option lists also have bounds. Fixtures cannot configure a mode, transport, API key, or human-review result.

Reports retain the complete fixture text. Use synthetic data and review artifacts before sharing; schema validation cannot detect a secret pasted inside a message or source paragraph.

## What remains unmeasured

Every report declares `modelComparison: "unmeasured"`, `liveJevQuality: "unmeasured"`, and `latestLlmParity: "unproven"`. Semantic and creative quality remain `unmeasured`, with zero human-reviewed cases. A scripted result, a matching substring, and an intact graph cannot establish parity with current leading LLMs.

To investigate that goal, first define a separately reviewed, held-out set with semantic, creative, and multi-turn rubrics. Record matched prompts, source material, model versions, settings, and complete response artifacts for authorized live Jev and comparison runs. Have independent reviewers assess factual support, task completion, uncertainty, coherence, theme adherence, and creative quality without seeing the engine identity. Keep human judgments separate from model-assessed support, and report missing or failed runs. This offline command does not import reviews, run that benchmark, or spend credits.

The [chat guide](jev-chat.md) describes the engine's operational boundaries. `tests/jev-chat-evaluation.test.ts` checks that the harness detects an independently wrong answer, corrupted graph, mismatched rendering, changed source text, missing clarification, invalid fixture data, and missing measurements. It also verifies that absent human reviews and live comparisons remain unmeasured.

```sh
pnpm exec tsx --test tests/jev-chat-evaluation.test.ts
```

## Plan and run a bounded live benchmark

The separate benchmark CLI runs selected fixtures through the composition engine with an explicit request budget. Start with a plan, which makes no network requests:

```sh
pnpm exec tsx scripts/jev-chat-benchmark.ts \
  --fixtures /tmp/my-chat-fixtures.json \
  --cases synthetic-bird-count --max-requests 2
```

You can use the fixture document above. Select 1–10 unique case IDs and allow 1–20 requests across the entire run. The plan includes normalized fixtures, input hashes, the engine version, and the request limit. Add `--output /tmp/chat-plan.json` to save it to a new file.

For an intentional live run, make your existing `TYPESAFE_API_KEY` available in the process environment, then add both `--live` and a new output path:

```sh
pnpm exec tsx scripts/jev-chat-benchmark.ts \
  --fixtures /tmp/my-chat-fixtures.json \
  --cases synthetic-bird-count --max-requests 2 \
  --live --output /tmp/chat-live-report.json
```

This command spends provider credits. It uses the existing `serverJevTransport` and its configured TypeSafe endpoint. It does not load `.env` files or accept credentials in fixtures or command arguments. The library accepts an injected transport; automated tests inject synthetic responses and label reports `execution: "mocked"`. Engine artifacts still declare the live decision path, so inspect the report's `execution` field to distinguish a live provider run from a transport test.

Built-in help can complete in live mode without dispatching a provider request. Such a case must carry the `scripted-help` trace and pass exact offline replay; its request and token counts are known zero. A live-mode label alone does not establish that inference occurred. Inspect each case's request records and route before interpreting its quality or timing as model performance.

Summary token measurements aggregate dispatched request records. A help-only run has no such measurements, so its summary totals remain `null` even though each completed scripted-help response records zero usage. This is an empty measurement set, not missing usage for an executed request.

Each case allows at most two requests and the engine's 60-second response deadline; the existing server transport also has its own request timeout. There are no automatic retries. The global request budget, HTTP 402/429, cancellation, or a checkpoint failure stops later requests. Ordinary malformed or failed responses remain failed cases. Ctrl+C requests cancellation; an ignored or late provider response cannot update the returned report or write a later checkpoint.

Reports checkpoint before dispatch and after progress. Output files must be new, are created with owner-only permissions, and are replaced atomically as checkpoints arrive. Pending records describe dispatch attempts, so a crash or cancellation between checkpointing and dispatch cannot prove the provider received the request. Interrupted requests retain unknown usage; cancellation does not prove no credits were consumed. Successful earlier requests retain their reported usage. These token counts and elapsed times are diagnostics, not invoices or provider-only latency.

A terminal report contains no running cases or pending requests. Stopped runs retain failed, completed, and not-run cases separately. The last successfully saved checkpoint remains importable if writing later checkpoints fails or the process exits abruptly; `status: "running"` means it is partial. Checkpoints cannot resume execution. The CLI exits `1` for stopped runs or failed case executions. Mechanical assertion failures remain in the report and do not independently change its exit status.

## Evaluate a complete conversation

Independent cases above supply fixed history. A conversation fixture instead supplies an ordered sequence of user turns; later inputs contain the replies the engine actually produced. Create an offline plan with either development example:

```sh
pnpm exec tsx scripts/jev-chat-benchmark.ts \
  --conversation tests/fixtures/jev-chat-conversation-story.json \
  --max-requests 8 --output /tmp/story-conversation-plan.json

pnpm exec tsx scripts/jev-chat-benchmark.ts \
  --conversation tests/fixtures/jev-chat-conversation-notes.json \
  --max-requests 8 --output /tmp/notes-conversation-plan.json
```

The story sequence starts with actual capability options, selects the second option, and then edits tone and ending. The source sequence asks a price, its difference from another price, an ordered ratio instead, and an unavailable project budget. Both are synthetic development fixtures, not held-out evaluations or evidence of live quality.

Conversation documents use `version: "jev-chat-conversation-v1"`, an `id`, `category`, shared `input`, and one to ten `turns`. Shared input contains `topic`, `notes`, optional `style` (default `balanced`) and optional `seed`. Each turn requires a unique `id`, nonempty `question` of at most 2,000 characters, `expectations`, and `evidenceNotes`; an optional `style` changes the response detail for that turn. Expectations use the same schema as independent cases. Unknown fields, supplied assistant history, duplicate turn IDs and files over 2 MiB are rejected.

The plan hashes the normalized fixture and records the engine version and global request limit. It cannot include future assistant replies or their input hashes before execution. Topic, notes and seed stay fixed; each actual assistant message, offered options and story frame becomes part of the next input. Successful story detail changes carry forward as they do in the chat interface. A per-turn style overrides the current detail setting.

Add `--live` and a new `--output` path for an intentional provider run, using the same environment-key setup as above. There is one global limit of 1–20 requests across all turns, with at most two calls per turn and no retries. A completed clarification reply continues the sequence. Mechanical expectation failures remain visible and do not stop a completed turn. An execution failure stops later turns; provider limits, cancellation, request exhaustion and checkpoint failure also stop execution. Sources and earlier messages are never shortened to fit the next turn. If growing history exceeds existing engine limits, the turn fails before dispatch.

The report contains the immutable plan and ordered `turns`. Each attempted turn's `benchmark` is a standard single-case benchmark artifact with its actual input, request hashes, typed decisions and output. A turn that fails before it can create that artifact can have `benchmark: null`. Later turns stay `not-run`. Nested request indices are local to their turn; the outer summary counts requests across the whole conversation, including checkpointed dispatch attempts. Missing usage and elapsed measurements remain unknown.

Checkpoints preserve partial progress and are not resumable. As with independent benchmarks, only an explicit live run uses the provider; automated tests label injected transports `execution: "mocked"`.

### Replay and verify a report offline

Both report formats support offline verification without a key or provider request:

```sh
pnpm exec tsx scripts/jev-chat-benchmark.ts \
  --report /tmp/story-conversation-report.json --verify
```

Add a new `--output` path to save the revalidated report. Verification checks each nested benchmark and binds every executed input to its predeclared user turn and exact preceding replies, options and story frames. It rejects broken chains, changed fixtures, exceeded request budgets and inconsistent lifecycle states, and recomputes summaries. A partial checkpoint can pass internal-consistency verification while remaining `status: "running"`; that is not a completed evaluation.

Use a turn's nested `benchmark` with the comparison/review import flow below after exporting it to a separate JSON file. Such a comparison measures the next response given the same recorded history, including Jev's earlier replies. Comparing complete systems across several turns also requires separately retained trajectories from each system and independent review of those trajectories. Neither replay nor a set of per-turn comparisons establishes conversational or leading-model parity.

## Import comparison outputs and reviews

Use the benchmark CLI's offline assessment path to match externally obtained outputs and judgments to an existing report:

```sh
pnpm exec tsx scripts/jev-chat-benchmark.ts \
  --report /tmp/chat-live-report.json \
  --comparisons /tmp/chat-comparisons.json \
  --reviews /tmp/chat-reviews.json \
  --output /tmp/chat-assessment.json
```

Supply either import file or both. Assessment makes no provider requests. Comparison documents have `version: "jev-chat-comparisons-v1"` and an `entries` array of at most 100 records. Each record requires `caseId`, `inputHash`, `provider`, `model`, `modelVersion`, `settings`, `output`, and an ISO `generatedAt` timestamp. Copy the case ID and input hash from the benchmark report. Settings accept at most 20 named string, finite-number, boolean, or null values. Output text is bounded to 24,000 characters and is preserved exactly, including surrounding whitespace and line endings. Equivalent settings with reordered keys identify the same comparison and cannot bypass duplicate detection.

Review documents have `version: "jev-chat-reviews-v1"` and at most 500 `entries`. Each entry requires `caseId`, `inputHash`, `outputHash`, `reviewerId`, `reviewerKind` (`human` or `model`), `rubricVersion: "jev-chat-quality-v1"`, `ratings`, and nonempty `notes`. The four rating fields are `correctness`, `usefulness`, `coherence`, and `creativity`; each accepts an integer from 1 to 5 or `null` for unassessed. Bind `outputHash` to the benchmark answer or a matched comparison. To obtain comparison hashes, first run assessment with only `--comparisons`, inspect its outputs, then import reviews into a new assessment file. Human and model judgments remain separate records and counts, including when their declared reviewer labels match. No aggregate semantic score is manufactured.

Input hashes bind the complete normalized input, including conversation history, notes, style, and seed when supplied. Output hashes use SHA-256 over canonical JSON string encoding of the unchanged text. Import validates hashes, response graphs, lifecycle states, and trace/request usage consistency, then recomputes mechanical checks and summaries. The fixture document hash identifies the original full collection; a report containing selected cases cannot independently reconstruct that full collection.

Fiction ranking snapshots retain only validated two-level score values, confidence and numeric probabilities. Imports replay acceptance and ranking from these recorded answers alongside field-mode decisions; changing a score that changes the selected response invalidates a completed report. These scores are internal model preferences, separate from the independent review records above. They do not count as evidence of leading-model parity.

Import requires the recorded engine version to match the current engine. It rebuilds the context and first request, and replays completed responses offline from their recorded typed decisions. This checks every completed response's request hashes and all response fields except elapsed time. Partial or failed cases retain their recorded diagnostics; only their reconstructable first request is checked. Replay uses no provider. Hashes and replay cannot authenticate a claimed live run.

`tests/fixtures/jev-chat-reasoning.json` supplies eight additional synthetic development cases for exact arithmetic and conservative refusals. They cover decimal sums, compatible duration units, currency mismatch, approximate figures, unsupported magnitudes, repeated evidence, and unsupported purchase counts. These fixtures guided development and are not held-out quality evidence:

```sh
pnpm exec tsx scripts/jev-chat-eval.ts \
  --fixtures tests/fixtures/jev-chat-reasoning.json \
  --output /tmp/chat-reasoning-offline.json
```

Matching hashes establish internal consistency. They do not authenticate a provider, reviewer, model version, actual external prompt, source truth, or execution. Keep matched external prompts and settings as separately reviewable evidence. Imported ratings remain declarations, and the report continues to mark semantic and creative quality `unmeasured` and leading-LLM parity `unproven`. No live benchmark or independent human review is included with this implementation.
