# YouTube extract execution ledger

Objective: URL to timestamp-linked, source-only extract using existing captions, deterministic cleanup/chunking/deduplication/selection, and Jev score + choice decisions. No generative model, translation, or transcription.

## Requirement audit

| Requirement | Implementation and evidence |
| --- | --- |
| Existing captions, original timestamps | `lib/youtubeTranscript.ts`, bounded `/api/youtube-transcript`; live public video `jNQXAC9IVRw` returned six lines through both transport and production route. Unit fixtures cover player metadata, XML decoding, and source-language fallback. |
| Natural chunks | `chunkCaptions` uses punctuation, timestamp gaps and speaker markers; tests cover cue provenance, decimals, gaps and bounds. No fixed-length slicing or silent truncation. |
| Deterministic filler cleanup | `cleanFillers`, tested hesitation/false-start removal and preservation of meaningful “like” / “you know.” Original captions remain inspectable. |
| Jev relevance + key claim/confidence | `scoringPayload` sends validated score and closed yes/no questions with bounded transcript context. `readScores` rejects invalid or missing results. No response prose enters output. |
| Deduplication | `selectExtract`, word-set Jaccard > 0.6 after relevance ≥ 0.5, lower-scoring duplicate dropped; unit and browser fixtures verify. |
| Configurable top-N%, chronological order | Slider 5–100%, count relative to total chunks; browser tests prove local reselection with no additional requests and timestamp order. |
| Connectors and assembly | Empty connector rule resolves the brief's conflict with invented transition words: whitespace only, original transitions retained. Unit/browser tests assert exact source-only output. |
| Metrics | Processed/total and kept counts, mean relevance, attempted calls, running reported-input cost estimate, elapsed time; pending/failed usage stays unknown. |
| Human source verification | Kept and raw chunk lists link to source timestamps, include original text, scores and kept/dropped reasons; caveat explicitly requires human comparison of omitted passages. |
| Working page and discovery | `/youtube-extract`, home/sidebar catalog, social metadata, workspace guide and README link. |
| Lifecycle and storage | Stop, key-change and unmount cancellation; URL/length drafts isolated from keys and results. Browser tests cover cancellation, stale key responses, drafts and errors. |
| UI access | Keyboard slider; desktop, 390×844 and 320×568 overflow checks in both themes; inspected desktop/mobile dark controls and narrow light results. Raw list scrolls independently. |

## Verification

- Focused unit/API tests: 10 passed, including observed failing regressions before fixes.
- `pnpm test`: 36 JavaScript + 216 TypeScript tests passed.
- `pnpm typecheck`, `pnpm build`, and `git diff --check`: passed on the final implementation.
- `python3 -m unittest discover -s tests -v`: 26 passed.
- `pnpm exec playwright install chromium`: completed.
- Full production browser run: 269 passed, 15 skipped, four clean-room catalog/contacts failures (desktop/mobile), all eight new extract cases passed.
- Final rebuilt production run, `E2E_PRODUCTION=1 E2E_PORT=3017 pnpm test:e2e tests/e2e/youtube-extract.spec.ts tests/e2e/clean-room.spec.ts --workers=1`: all 14 passed. This verifies all new cases and serial retries of the clean-room failures.
- Live YouTube retrieval verified; paid live Jev calls intentionally not made. Browser Jev responses are mocked.
- The broad-run clean-room failures did not reproduce serially; contention is an inference, not a proven root cause. No clean-room code or test configuration was changed.

Existing unrelated changes in `lib/localBrowser.ts`, `tests/local-browser.test.ts`, and `tests/e2e/local-browser-origin.spec.ts` are preserved. No commit or external publication requested.
