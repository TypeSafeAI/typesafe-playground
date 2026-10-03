# Trolley problems

Open `/simulations/trolley-problems` from Games & simulations → Reasoning.

The interaction is inspired by [Max Rovensky's Jev trolley clip](https://x.com/MaxRovensky/status/2100706874173575199). The railway SVG, scenarios and wording are original. No Neal.fun artwork, game code or audio is used.

## Controls

- **Pull the lever / Do nothing:** human choices, with no API request.
- **Let Jev decide:** one real `jev-latest` choice request through `runJev` and `/api/run`, using the shared server-key or personal-key override rules.
- **Run all 12:** starts at the first scenario, makes at most twelve sequential requests and holds each decision for 1.8 seconds. Nothing starts automatically.
- **Pause:** aborts the pending request or reading hold. Changing scenarios, resetting, hiding the page, changing credentials or leaving the page also stops the run. Starting again requires an explicit action.
- **Export:** downloads the latest 48 source-labeled decisions from this in-memory session. It does not contain credentials. Refreshing clears the session.

The cases cover the classic switch, equal lives, an empty side track, personal property, robots versus a human, humans versus a robot, voluntary sacrifice, uncertain diversion, a reversed default, the loop, delayed harm and empty tracks. Read each case's assumptions.

## Contract and limits

`lib/trolley.ts` owns the fixed scenarios, `pull`/`stay` payload and strict response parser. `lib/trolley-runner.ts` owns sequential execution, cancellation, a 45-second deadline and the request cap. The UI does not choose a substitute action when Jev fails or returns an invalid distribution.

The animation illustrates the chosen route. The stated consequences are part of the thought experiment, not a physical simulation. The uncertain case illustrates an attempted diversion and keeps its outcome unknown; no random casualty outcome is sampled. The loop relies on explicitly stipulated physics, and the delayed-harm marker represents a remote person.

There is no moral answer key, accuracy score or general ethics benchmark. Probability bars describe the provider's response, not moral correctness, fairness or safety. Jev receives text and structured consequences, not image pixels. No downstream real-world action executes.

Desktop prioritizes the scene, choices, result and live controls. Decision history scrolls independently. Narrow and short screens reflow and permit scrolling to preserve readable text and controls. SVG descriptions, keyboard controls and reduced-motion playback are supported; automated coverage does not substitute for human assistive-technology testing.

## Verification

`tests/trolley.test.ts` covers the fixed contract, malformed distributions, request bounds, failure, stale results, cancellation and deadlines. `tests/e2e/trolley.spec.ts` exercises both human routes, `/api/run` integration, full runs, export, errors, lifecycle cancellation, keyboard interaction, reduced motion and responsive layouts. All automated Jev responses are mocked; tests never spend shared provider credits.
