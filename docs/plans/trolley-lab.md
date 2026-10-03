# Interactive trolley lab

Reference: [Max Rovensky's Jev trolley clip](https://x.com/MaxRovensky/status/2100706874173575199). Reproduce the interaction pattern with original scenarios, wording and SVG artwork; do not reuse Neal.fun's assets.

## Design

An animated railway diagram is the focal point, with a compact decision console alongside it. Inherit the app's final brand tokens (porcelain panels, graphite ink, rose accent and soft neutral surfaces) and its dark-theme equivalents, without introducing a second palette. Keep the app's display/body fonts and monospace utility labels. The signature is a branching railway with an actual lever and a trolley that follows the chosen route. Quiet borders and numbered case navigation convey the experiment's structure. No extra dashboard ornaments.

Desktop prioritizes the scenario, diagram, both human actions, Jev controls and response probabilities within the viewport. History scrolls independently; narrow or short screens reflow without clipping content. Support keyboard use, visible focus, textual scene descriptions and reduced motion.

## Execution ledger

- [x] Twelve fixed scenarios, two legal choices and strict response validation.
- [x] Real `/api/run` calls through the shared credential/usage adapter; bounded sequential runs, timeout, cancellation, hidden-page and key-change isolation.
- [x] Original interactive scene and responsive decision console; explicitly label human and Jev decisions, uncertainty and hypothetical consequences.
- [x] Route, navigation, home card, metadata and workspace guide.
- [x] Unit and production browser verification, layout inspection and independent review.

Verified: 692 unit tests, 26 legacy Python tests, typecheck, production build, secret scan, formatting, production browser behavior and route/navigation geometry. All twelve scenario results fit the 1280×720 desktop viewport; mobile and short layouts reflow. Independent review found no required fixes. Live provider responses and human assistive-technology acceptance were not tested.

No moral answer key or accuracy score. Probabilities describe model output, not ethical correctness. Provider failures stop the run without a replacement choice. Automated verification uses mocked responses and never shared Jev credits.
