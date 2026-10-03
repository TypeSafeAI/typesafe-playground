# Viewport priority and navigation

## Requested outcome

Optimize every page so the main task, current status and primary actions receive viewport priority. Reduce sidebar density through sections and subsections in expanded and collapsed states. Retain all functionality, execution labels, saved drafts and accessible reflow.

An arbitrary amount of content cannot remain readable in every viewport without scrolling. Use progressive disclosure, task views and bounded content regions on desktop; allow necessary vertical reflow on narrow screens and at zoom. Never hide overflow to manufacture a passing layout.

## Execution

- [x] Inventory every route and identify shared and workspace-specific layout issues.
- [x] Implement grouped expanded navigation and discoverable collapsed section navigation.
- [x] Prioritize task controls and results; disclose secondary instructions and details.
- [x] Verify route coverage, keyboard/focus, themes, narrow/short screens, zoom, persistence and success/error states.
- [x] Independently review, remedy findings and publish evidence-based scores.
- [ ] Complete verification, PR delivery and production checks.

## Ten-point rubric

Score one point per verified criterion; record evidence and limitations for each. A 10/10 score is acceptance against this scoped checklist, not universal design perfection or a WCAG certification.

1. Clear primary task and information hierarchy on every page.
2. Primary controls and task output receive first-viewport priority on supported desktop sizes.
3. Space adapts without clipped content or horizontal page overflow.
4. Secondary guidance, configuration and long records remain discoverable on demand.
5. Expanded navigation presents clear sections and subsections.
6. Collapsed navigation retains grouping, names and current-location cues.
7. Keyboard access, visible focus and focus restoration work throughout changed interactions.
8. Narrow/short screens and zoom reflow preserve reading and controls.
9. Theme contrast, target sizes and reduced-motion behavior remain usable.
10. Mock/live/uncertainty, loading, empty, error and saved-state boundaries survive layout changes.

## Review and verification record

- Baseline independent review: 2/10 criteria verified. Primary actions appeared below a 720px viewport on several workspaces; all workspace links competed in a flat sidebar. The panel-heading metadata override had 1.68:1 contrast on white.
- Added named navigation sections and task subsections; desktop disclosures, collapsed rail flyouts, current-location cues, native Escape/outside-click behavior and mobile drawer continuity.
- Prioritized task actions/output, independent input/result regions, viewport-sized game boards, current IQ question/final-result views, and compact Home/section discovery. Long guidance, configuration, comparisons and histories use disclosures.
- First independent implementation review found same-section navigation restoring the wrong section, IQ questions retaining inner scroll, and open disclosures squeezing the task area. All three were fixed and regression-tested.
- The 32-route matrix passed 35 checks after those fixes. It captures desktop light/dark, 320×568 and 844×390, checks actual named execution actions, and exercises keyboard flyouts, expanded details and IQ scrolling. The follow-up adds a settled Twisty SVG check and visible Proposal reviewer-mode check.
- 320 CSS pixels is the reflow width equivalent to 400% zoom from a 1280px viewport. This is automated reflow evidence, not a human browser-zoom or screen-reader acceptance claim. See [WCAG reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- Navigation uses ordinary links and disclosure buttons, following the [WAI disclosure navigation pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/); it does not apply application-menu roles.
- Local unit verification: 680 tests passed (46 JavaScript, 634 TypeScript). Python: 26 passed. Typecheck, production build and secret scan passed.
- Final independent acceptance: 10/10 scoped criteria, with the automation limits below. The affected browser run passed 112 cases with 36 intentional project skips. Production priority/puzzle checks passed 53 cases; an isolated unchanged MicroDuck rerun resolved the one polling timeout. All six production Clean-room cases passed, including result focus.
- Final refinement: keep Load/New/Reset scramble controls in the puzzle action footer and check Load scramble explicitly in the viewport matrix. The fresh final production matrix passed all 36 cases; final MicroDuck/chess behavior checks passed four cases.
- The full production suite and hosted checks remain delivery gates; terminal receipts are recorded in the delivery PR. Earlier development runs exposed intended disclosure-test updates and hot-reload interruptions; they are not reported as a passing full suite.

Live Jev request paths, solver verification and explicit local/mock modes remain distinct. Browser tests mock provider responses and spend no shared Jev credits. No human VoiceOver acceptance or live-provider quality claim is made.
