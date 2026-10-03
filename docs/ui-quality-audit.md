# Workspace quality audit

Reference: `/agents/jev-browser-agent`. Scope: every page and example, including the local Clean Room workspace. Preserve existing drafts, request contracts, and explicit live/mock/uncertainty boundaries.

## Refresh in progress — 2026-10-03

The receipts below remain the historical September audit. The current inventory
has 32 navigable routes (Home, five section pages, 25 workspaces and the native
browser subpage), with 26 route-specific guides. Tests now derive this inventory
from the route/guide catalogs instead of a fixed list, including Jev Chat, the
arcade, IQ test, proposal review and twisty puzzles.

Current changes make background content inert while the mobile drawer is open
and release its focus trap when resizing to desktop. The refreshed source audit also
found and fixed arcade playback surviving pause/navigation, Jev Chat history
leaving a backdrop after resize, and an unconditional idle usage-clock timer.
Their new desktop/mobile browser regressions pass on a separately built, identical source snapshot. Twisty puzzles use static
SVG, lazy renderer/worker assets, explicit solve actions, cancellation and a
60-second deadline. The puzzle instructions distinguish practice scrambles,
state verification and solver limits; results are local computation.

The selected production audit passed 159 cases with 11 intentional skips; two
batch-triage timing assertions were corrected to use the existing request queue
interval and passed separately. The integrated 4×4 solver has since passed unit,
type and build checks; the later review fixes passed 53 affected-workspace cases
(one intentional skip) plus two Megaminx label/notation cases in a separate
frozen production build. A full 475-case baseline browser run is in progress.
See `docs/plans/puzzles-and-workspace-quality.md` for current receipts and gaps.
No human VoiceOver acceptance or live-provider verification is claimed.

## Execution

- [x] Inventory routes, example families, shared UI, and existing browser coverage.
- [x] Inspect every route at desktop and narrow sizes; exercise representative success/error and example-selection flows offline.
- [x] Apply consistent workspace hierarchy, surfaces, controls, disclosure, and responsive behavior.
- [x] Improve Tool Router task/path/result clarity.
- [x] Add detailed modal breakdowns to all 18 pages, including Home and Browser agent.
- [x] Verify all routes and catalog examples, keyboard use, themes, short screens, scrolling, drafts, and error states.
- [x] Run unit tests, typecheck, production build, browser suite, and legacy tests; record evidence and limitations.

## Findings and evidence

| Severity | Surface | Finding | Change |
| --- | --- | --- | --- |
| Medium | Shared workspace shell and all labs | Competing legacy surface rules produced square nested cards, dense headers, tiny secondary controls, and cramped disclosure markers. | Consistent panel geometry, spacing, typography, controls, focus-preserving native disclosures, and restrained motion. |
| Medium | Lab onboarding | Empty panels gave little guidance about the relationship between inputs and results. | Task-specific previews and keyboard-accessible guides with steps and explicit execution limits. |
| Medium | Page explanations | A short walkthrough did not explain the whole input-to-result process. | Page-specific modal cards for inputs, processing, and results; a numbered walkthrough; a suggested experiment; explicit limits; persistent close controls around a scrollable body. Browser-specific setup details remain available. |
| High | Split editors on short landscape screens | The extraction input area shrank to approximately 69px at 844×390. | Scroll the workspace while retaining a usable editor and reachable run control. |
| Medium | Tool Router | Candidate IDs, graph details, confidence scores, and the actual decision competed for attention. Continuation was a text instruction referring to a distant button. | Request/decision hierarchy, collapsed routing inspector, nearby Continue/Stop controls, compact path cards, and scores under Decision details. |
| Medium | Tool Router completion | Generic completion text displaced the useful simulated tool output. | Retain the last tool output after completion, with simulated provenance visible. |
| Medium | PR review | Before loading a diff, zero counters and empty filters resembled a result. | Show the task walkthrough until a diff is loaded; keep actual review evidence and filters afterward. |
| Medium | Narrow headers | An initial polish rule hid boundary pills. | Independent review caught this; labels now wrap and remain visible. |
| High | Mobile workspace after closing a guide | An inherited 850px heading rule let controls overflow; native focus restoration shifted the workspace sideways and clipped content. | Scope heading action widths correctly and assert nested workspace overflow and scroll offsets across every route. |
| Medium | Workflow onboarding | The empty conversation scrolled to the bottom on initial render, clipping its welcome content on short screens. | Start empty conversations at the top; retain scrolling for active conversations and respect reduced motion. |
| Low | Home test | The card-count expectation was hardcoded and could drift from the navigation catalog. The current base includes 17 cards. | Derive the expected count from the canonical navigation catalog while retaining Home bento and Clean Room assertions. |

## Coverage

- The 18 routes in this audit: home, examples, conversation, extraction, reranker, memes, Ask gate, workflow, Tool Router, LangChain, Clean Room, browser agent, PR review, AST governance, SMT solver, JevDoom, MicroDuck, and chess. The later `/language/youtube-extract` and `/language/jev-chat` additions have dedicated browser suites; they are outside the original audit receipts below.
- All 110 authored catalog examples across 22 packs: selection, editor content, typed result rendering, A/B variants where defined, and a failed-provider run per pack, on desktop and mobile.
- Light/dark route screenshots; narrow/short screens; existing nine-size viewport matrix; keyboard guide open/close and focus return; router continuation/cancellation; stored drafts, import/export, result rails, navigation, and success/error states through the existing browser suite.
- Detailed guide coverage on every page in both themes and on desktop/mobile; 320×568 and 844×390 keyboard navigation, visible close controls, preserved editor values, and zero model requests from opening a guide.
- Browser-agent behavior remains the reference. Game simulation, solver, request validation, credential, and policy logic are unchanged.

## Verification

Verified on 2026-09-17 against current main, including the merged Home bento and Clean Room work. Command logs and screenshots are under `/tmp/typesafe-ui-audit/`.

- `pnpm install --frozen-lockfile`: passed with the pinned pnpm version and unchanged lockfile.
- `pnpm test`: 36 JavaScript and 203 TypeScript tests passed.
- `python3 -m unittest discover -s tests -v`: 26 passed.
- `pnpm typecheck` and `pnpm build`: passed after the final modal changes. The existing local-browser dynamic-filesystem tracing warning remains.
- `E2E_PRODUCTION=1 E2E_PORT=3121 pnpm test:e2e --workers=1 --output /tmp/typesafe-ui-audit/modal-final-results`: 265 passed, 15 intentional project/viewport-specific skips, zero failures. All 110 catalog examples passed on desktop and mobile. Evidence: `modal-final-e2e.log` and `modal-final-results/`.
- The first integrated run used two workers and exposed contention with Clean Room's admission test: a concurrent demo correctly returned “Two rebuilds are already running.” The final suite uses one worker, matching CI, without changing application limits.
- Reviewed route and modal screenshots in both themes on desktop/mobile. Representative modal images: `modal-desktop.png` and `modal-mobile.png`.
- Prettier checks for changed UI/tests and `git diff --check`: passed. Independent code and content review completed; findings were addressed.
- Automated Jev responses are mocked and do not spend shared credits. Live provider quality, billing, and public deployment are outside this UI verification.

The original checkout and its unrelated local changes remain preserved. This work is delivered from an isolated branch based on main.
