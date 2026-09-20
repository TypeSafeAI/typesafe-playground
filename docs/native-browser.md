# Native Jev browser commands

Open `/jev-browser-agent/native` on localhost. Jev chooses commands for an isolated browser-use session; no text-generation model or alternate policy runs when Jev fails. The existing Newegg parts-research workflow remains separate. Its price-based fallback is not part of the native command loop.

## Run locally

Use the repository's pinned pnpm version, `uv`, and Chromium. Set `TYPESAFE_API_KEY` in `.env.local` or use the API-key icon in the native toolbar, install Chromium with `pnpm exec playwright install chromium`, then run `pnpm dev`. `LOCAL_BROWSER_EXECUTABLE` can select another Chromium executable. The first session downloads pinned browser-use 0.13.10 through uv. Hosted deployments cannot launch a browser on your computer.

The browser guide links to the native workspace. Choose one of these tasks:

| Task              | Execution                                                                                          | Completion check                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| PC configuration  | Three sections: eight component selections, one name field, two Continue actions and Save draft; 12 required actions | All nine exact values and the saved confirmation                        |
| Account setup     | Three sections: eight input fields, one plan selection, two Continue actions and Save draft; 12 required actions         | All nine exact values and the saved confirmation                          |
| Newegg navigation | Real Newegg pages with a custom goal                                                               | User-supplied confirmation text; the API also supports exact field checks |

These forms are controlled execution benchmarks, not market research or real account creation. Newegg confirmation text establishes only that the text appears in the document. It does not establish price, compatibility, budget optimization, or a complete PC build. Specify a check that distinguishes the destination from the initial page.

## What crosses the Jev boundary

1. **Observe.** Read bounded, visible controls and text locally. Each document gets an identity; each observed node gets a stable ID. Screenshots appear in the app but are not sent to Jev.
2. **Compress now.** Rank controls against the goal, retain at most 24 current candidates and 40 short text lines, and construct menus immediately before the call. Truncation is explicit. Unsatisfied candidate windows rotate when Jev skips them.
3. **Send the change.** The first update is a compressed baseline. Subsequent updates contain added, changed and removed nodes/text, current scroll position and revision. Navigation invalidates old handles. The delta encoder retains only the immediately previous compressed view; it never replays old DOM snapshots or prior exchanges.
4. **Choose a batch.** One request contains up to four closed-choice heads. Each choice binds an operation, observed target and exact value. Independent text fields, selects and checkbox toggles can execute together. A primary non-checkbox CLICK, SCROLL, WAIT, DONE or BLOCKED ends the batch and discards speculative field answers. Jev receives the current menus and last batch outcome because the API is stateless; these are not a replay of page history.
5. **Check and act.** Before each command, check document/revision, node identity, current value and structure, option identity, containing form/section revision, visibility and center-point occlusion. Unrelated changes outside that region do not invalidate a stable target before the batch starts. These checks inspect the target, not a fresh DOM table. A dependency change rejects the next command and marks remaining actions skipped. Other clicks and scrolling require another observation.
6. **Verify separately.** DONE and BLOCKED invoke a local completion contract. An unverified claim reopens previously applied fields for correction and gets one fresh observation; a second consecutive unverified claim pauses the run. Duplicate field labels cannot pass an exact field check.

TYPE_TEXT uses exact supplied values or bounded, literal spans from the goal. Quote multiword values to make them reliable candidates. The local step does not invent missing input, generate selectors, execute model code, or call another model. SELECT maps to the observed option's index and value.

## Bounds and current coverage

The executor supports native inputs, textareas, selects, links, buttons and listed ARIA click targets in the main document. It does not traverse iframes or shadow roots, fill passwords/files, or implement drag-and-drop. All controls must be visible at execution time. Observation scans at most 2,000 candidate elements and retains at most 160 visible controls; the policy menu is smaller. Selects retain at most 500 local options; goal relevance selects at most 40 for Jev, so a matching country or configuration beyond the first 40 can still be chosen. Truncation is a coverage limitation, not proof that omitted controls do not exist.

Each batch has at most four actions. Runs have bounded decision/action budgets, six consecutive waits and a four-minute session execution deadline. There is a minimum pause before every action and at least 650 ms between repeated actions on the same target. This discourages rapid repeat spam; it is not a claim to bypass detection. Observed challenges and rate limits pause the loop. Source pages and model output remain untrusted.

The server allows only Newegg or the local benchmark origin; the public API cannot submit evaluation scripts or change a session's goal after creation. It checks localhost/same-origin access, bounds bodies, limits browser session creation, and closes sessions on cancellation or expiry. Navigation, purchase and account security policies are not a general-purpose production authorization system.

## Measurements and debug reports

Inspector displays acknowledged actions, decision calls, output tokens, tokens/action, calls/action and elapsed time. Copy debug report retains exact requests, responses, source URLs, target IDs, per-cycle execution/rejection evidence and the completion contract. Credentials are excluded; page data and user-entered values are included. Traces stay outside policy context. If a browser disconnects during a dispatched batch, planned commands remain in the report and its outcome is unknown; token-per-action comparisons are suppressed. Stopping signals the owned browser process immediately, but an already-dispatched action may have completed before cancellation reached it.

Provider-reported input/output usage remains null when absent. A failed or scripted run cannot satisfy the output-token targets. Reported output tokens use the provider's accounting; there is no separate measurement of hidden reasoning tokens. `latencyMs` sums transport/decision time; `wallclockMs` includes local execution. Neither is a latency percentile.

`requestCharacterReduction` compares actual serialized requests with a counterfactual request using the same goal, menus and last-result summary but a fresh compressed baseline. It is not an A/B model run, token count, cost estimate or proof of reduced model latency. `fullStateCharacters` separately measures raw local observations, including executor-only guards, and is not the denominator for that comparison.

## Reproduce the benchmarks

From the repository root, run correctness first:

```sh
pnpm exec tsx scripts/benchmark-native-browser.ts --scripted --output=/tmp/native-scripted.json
```

This runs real local browser-use sessions with a deterministic test policy. It makes no Jev calls and reports token usage as unknown. To measure live Jev explicitly:

```sh
pnpm exec node --env-file=.env.local --import tsx scripts/benchmark-native-browser.ts --live --output=/tmp/native-live.json
```

The current fixtures are version 2: three sections plus a saved review and an Edit draft path. Use `--task=pc` or `--task=profile` to run one scenario and `--model=jev-latest` to select a model. The script requires exactly one of `--live` or `--scripted`, saves its report even on a run failure, and stops after a failed live scenario instead of repeatedly spending credits. Automated tests use mocked responses only.

The comparison targets are the user's reported BetterWrite figures: approximately 2,400 output tokens for 12 actions and 1,500 for a setup/configuration task. These fixtures differ from those reported tasks. Even a passing single run establishes only this task/model/environment result; it does not establish equal retail coverage, general reliability or a BetterWrite reproduction.

## Evidence so far

On 2026-09-17, the scripted real-browser staged PC and profile runs completed in seven decision calls each, with 12 executed actions each. Their serialized requests were approximately 7.3% and 9.0% smaller than the same-menu fresh-baseline counterfactual. No token performance claim follows from scripted decisions.

Re-running the same command on 2026-09-20 reproduced both results exactly: `done` on each task, 12 executed actions in 7 decision calls, zero model calls, null tokens, and 7.33% / 9.02% request-character reduction.

The live Jev benchmark returned HTTP 402 on its first call, before any action. Output-token targets and live policy success are **not verified**. Restore provider quota and rerun the live command before claiming either target is met.
