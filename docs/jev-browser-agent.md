# Jev-powered browser agent

Open `/agents/jev-browser-agent`. The browser occupies the workspace, the goal stays in the bottom composer, and Inspector contains results, diagnostics, and copy/export controls. No text-generation model is required for either browser preset.

## Local Newegg research

Run the app on localhost, install [uv](https://docs.astral.sh/uv/), and install Chromium:

```sh
pnpm exec playwright install chromium
pnpm dev
```

Configure `TYPESAFE_API_KEY` on the server. The first run resolves Python 3.12 and `browser-use==0.13.10` through uv. Set `UV_EXECUTABLE` if uv is outside the server PATH, or `LOCAL_BROWSER_EXECUTABLE` to select a Chromium binary. On macOS the bridge discovers Playwright's installed Chromium. Browser-use can discover a local browser on other platforms. Sessions use isolated temporary profiles, disable telemetry and default extensions, and expire after ten minutes. Each session permits one research run; the server allows at most three session starts per minute and three active sessions. Stop or leaving the workspace closes the session. The browser launches on the server, so serverless hosts such as Vercel cannot run it; a self-hosted server with uv and Chromium can.

The supported goal is a $2,500 USD tower for 1440p gaming on Newegg. Other budgets or task types fail before research rather than inheriting the flight verifier. The focused search covers AM5/DDR5, 32GB dual-channel RAM, 2TB NVMe storage, an 850W PSU, ATX airflow cases, and AM5 air coolers. It is not a general web agent or an exhaustive market search.

1. Nine listing searches navigate the local browser serially. The app displays a captured viewport after each read. The view is observational, not a remote-control surface.
2. The parser retains observed candidate IDs, titles, prices, shipping labels, and URLs.
3. One Jev request ranks categories with multiple candidates. Singleton categories resolve locally. Model output must contain valid IDs and bounded probabilities.
4. A deterministic search maximizes summed log category probabilities subject to exactly one part in each of eight categories and a total at or below 250000 cents. This score is a preference heuristic, not a calibrated probability of compatibility or performance. Equal scores prefer lower cost. Under 90% utilization produces a warning rather than wasting budget on cosmetic premiums.
If Jev returns HTTP 402 (billing), 429 (quota), or 503 (unconfigured), research continues with a **local budget baseline**: the cheapest observed candidate in each category. The model failure and provider status remain in diagnostics. This baseline makes no performance ranking claim. A remembered billing/quota block skips Jev on subsequent runs; changing the API key clears that block through the existing key controls. Invalid model IDs or probabilities still fail closed.

5. The local browser reopens all eight product pages to check observed prices and availability. Socket and memory checks only use explicit source text. BIOS support, physical clearance, connectors, and other unresolved compatibility details remain warnings.

No cart or purchase actions occur. Challenges are retained as evidence and coverage gaps; they are not bypassed. A missing category, infeasible budget, invalid model answer, or failed source read never produces invented parts.

## Copyable PC diagnostics

Copy debug report includes the goal/context, candidates, selected IDs and total, verification evidence, exact Jev request/response, and each logical document read's URL, final URL, start time, elapsed time, rendered DOM byte count, and SHA-256. Failed reads count and retain errors. The report excludes credentials, transport headers, and the session capability. Hashes identify extracted DOM strings; they are not archived HTML or HTTP redirect traces.

Provider-reported token usage remains unknown when absent; costs are not inferred from unrelated text-model pricing. Single-run timings include browser/network/queue time and do not imply benchmark latency or general reliability. Read counts exclude browser subresource requests. The page view is not sent to Jev; Jev receives the candidate table.

## Flight sandbox loop

1. **Perceive.** `getElementTable(doc, win)` reads the sandbox document once: common HTML/ARIA controls, accessible names, current values, checked/expanded state, and the visible text. Each real node gets a code-owned numeric identity in a per-document cache. The snapshot also records a semantic marker, a form/viewport key, and a guard per target.
2. **Build the action space.** `buildActionSpace` groups candidates by operation: `CLICK`, `TYPE_TEXT`, `SELECT`, plus `SCROLL_UP`, `SCROLL_DOWN` and `WAIT` when they apply. `DONE` and `BLOCKED` are always offered. Native selects expose one `element:option` index per unselected option.
3. **Decide with one request.** `buildDecisionPayload` sends the element table, page text and the last ten actions as state, with the `operation` question and one target head (`click_target`, `type_text_target`, `select_target`) per available operation. `resolveDecision` validates the reply and consumes only the head matching the chosen operation. A head with a single candidate is resolved locally, because the API needs two candidates.
4. **Choose text only for TYPE_TEXT.** Jev selects a literal span of the user's goal through the `field_text` question. The browser UI always uses `jev-span`; it never invokes `/api/text-helper`. Missing values remain unresolved.
5. **Validate before executing.** `isFresh` compares the form/viewport key and the target guard for clicks and selects, and the full marker for everything else. `resolveTarget` re-reads geometry and hit-tests the centre point. Detached, hidden, disabled, read-only, offscreen and covered targets are rejected with a reason, and the rejection is fed back as recent history.
6. **Execute, log, settle.** Execution is recorded before the next observation. Typing into a combobox waits for visible suggestions, capped at 200 ms; other interactions wait at most two animation frames or 50 ms. `WAIT` is 100 ms.
7. **Verify DONE independently.** `verifyFlightSearch` reads the sandbox DOM: one-way trip, resolved Zürich and London airports, the ISO date, one adult, economy, visible matching results, and no selected flight. A rejected `DONE` is logged and fed back; three rejections fail the run.
8. **Recheck BLOCKED.** A stale `BLOCKED` response is discarded. On a current page, the independent verifier checks for completion first. Otherwise, the loop records the unmet checks and asks Jev to decide once more from a fresh observation. A second consecutive `BLOCKED` stops the run. Speculative target answers never override the chosen operation.

Budgets: 40 actions and 80 decisions. Three consecutive actions that change nothing, four consecutive rejections, two consecutive fresh `BLOCKED` choices, or two consecutive model failures stop the run with a reason.

## The sandbox

The iframe hosts a fictional site, Skyline, written in plain HTML and JavaScript inside `lib/flightSandbox.ts`. It has a trip-type select, passenger and cabin selects, two autocomplete comboboxes whose suggestions arrive asynchronously, tolerant date fields, a return-date field that only appears for round trips, and results that load after a delay. Two switches exercise escalation paths:

- **Popover** — a dismissible tip covers the Search button. A click on it is rejected as covered by the named dialog, and the policy has to dismiss it.
- **Slow results** — results take about 2.6 s, so the policy has to `WAIT`.

Nothing is real: airports, airlines, prices and schedules are synthetic, and the Select buttons only mark a card as selected, which the verifier treats as a failure.

The former public `/api/text-helper` and `/api/browser-research` synthesis endpoints return 410 and cannot spend text-model credits. The browser presets use Jev choices or the labeled local baseline.

## Logging and export

Every cycle records the element table Jev saw, the visible text, the chosen operation and target, operation and target confidence and probabilities, the discarded speculative heads, Jev latency, text-helper output and latency, and the executed outcome or rejection reason. **Export** downloads the goal, status, counters, verification, history and log as JSON.

## Limits

Matching the jev-ultrafast MVP: no shadow DOM, frames, canvas, uploads, pop-up tabs, nested scrolling or arbitrary keyboard widgets. The name algorithm covers labels, ARIA references and text, not the full accessible-name specification. The sandbox is the whole page, so the iframe's own scroll is the page scroll. One task on one synthetic site is a demonstration, not a benchmark; a valid operation can still be the wrong one, and the log says so.

Implementation: `types/browserAgent.ts`, `lib/getElementTable.ts`, `lib/actions.ts`, `lib/callJev.ts`, `lib/textHelper.ts`, `lib/validateTarget.ts`, `lib/agentLoop.ts`, `lib/logStep.ts`, `lib/flightSandbox.ts`. UI: `BrowserAgentLab` and `BrowserAgentGuide`.
