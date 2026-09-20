/** Explanations of existing behavior, never instructions for model execution. */
export type WorkspaceDetails = {
  summary?: string;
  input: string;
  process: string;
  output: string;
  experiment: string;
};

export const workspaceDetails: Record<string, WorkspaceDetails> = {
  "/": {
    input:
      "A task or question you want to explore. Search matches workspace names, descriptions, and groups.",
    process:
      "The directory filters the available workspaces locally. Opening a card takes you to a dedicated experiment with its own controls and evidence.",
    output:
      "A starting point for language, workflow, code, or simulation tasks. Browsing this directory makes no model call.",
    experiment:
      "Search for robot, open MicroDuck, and compare its seeded controller with a live Jev run when you are ready.",
  },
  "/examples": {
    input:
      "An example's Text or JSON context and selected typed questions. A/B cases declare the single field that changes.",
    process:
      "The request sends your context with noul, choice, or score contracts. Jev returns structured answers for those questions; drafts stay in your browser.",
    output:
      "Answer cards with model confidence, comparisons, and reference notes where provided. Confidence and a typed response do not establish correctness.",
    experiment:
      "Open an A/B example, inspect the changed field, then compare both answers. Reveal reference notes after making your own prediction.",
  },
  "/conversation": {
    input:
      "A conversation transcript and experiment choice: select a reply recipient or compare how a changed detail affects the final message.",
    process:
      "Reply selection evaluates each speaker’s latest message; comparison modes evaluate the final message. Jev returns reply probabilities, and the configured probability threshold controls selection.",
    output:
      "A proposed recipient, the other candidates, and supporting scores. Changing the threshold recalculates the displayed decision locally.",
    experiment:
      "Load the sample, pick a recipient, then raise the threshold and watch when the selection becomes uncertain.",
  },
  "/youtube-extract": {
    input:
      "A public YouTube URL whose video already has a caption track. English is preferred, manual tracks before automatic ones; the track's origin is shown.",
    process:
      "Captions are split at gaps, terminal punctuation and speaker markers. Each chunk gets one request carrying a relevance score and a key-claim choice, with the bounded transcript as topic context. No transcription, translation or text generation runs.",
    output:
      "Chunks scoring at least 0.5, minus near-duplicates, restored to chronological order and joined by whitespace. Every word is original caption text. Missing or failed scores stay unknown and stop the run rather than being filled in.",
    experiment:
      "Extract a talk, then open the raw list and read the dropped passages: a high score cannot prove that nothing important was omitted.",
  },
  "/extraction": {
    input:
      "Document text and the fields you select, such as date, counterparty, or amount. Use synthetic documents for experiments.",
    process:
      "Local logic finds exact source candidates. Jev ranks those candidates plus null; it cannot invent a value outside the supplied set.",
    output:
      "Selected values linked to source evidence, or null when no candidate is selected. Request failures stay visible as failed runs.",
    experiment:
      "Load the invoice, extract its fields, then remove the date from the source and compare the next result.",
  },
  "/gate": {
    input:
      "An incoming question or chat dump, conversation history, and optional documentation that could support an answer.",
    process:
      "Jev classifies whether the supplied evidence can support the question. Citation checks and conservative policy control the final routing decision.",
    output:
      "An evidence-backed gate decision with supporting citations, or a human handoff when support is weak. No answer or message is sent.",
    experiment:
      "Run the sample with its supporting documentation, then remove that evidence and compare the handoff decision.",
  },
  "/workflow": {
    input:
      "A selected playbook, its rules, and the facts you add to the case conversation.",
    process:
      "Each turn is evaluated against the playbook. The returned structured decision is interpreted within the configured policy and allowed actions.",
    output:
      "A recommended next action and its policy evidence, or a request for more context. Recommendations do not execute business actions.",
    experiment:
      "Start a damaged-delivery case with one fact, then add the missing evidence and compare the recommendation.",
  },
  "/tool-router": {
    input:
      "A request, a starting graph node, and the demo's policy. Available next nodes depend on the current position.",
    process:
      "Policy excludes forbidden candidates before selection. Jev or the seeded mock chooses a next node; confidence and approval gates can stop the path.",
    output:
      "The permitted next step, simulated tool output, and a trace of each edge. Decision details expose confidence, selection probability, and policy overrides.",
    experiment:
      "Compare reading settings with modifying production. Follow the path until the approval checkpoint, then try a request for secrets.",
  },
  "/langchain": {
    input:
      "A user request and current graph node, passed to the real structured LangChain tool adapter.",
    process:
      "The adapter validates input, restricts routing to allowed candidates, invokes live Jev or a mock, and applies deterministic policy.",
    output:
      "A structured routing result for a calling application, including approval or policy stops. The adapter never executes the selected downstream tool.",
    experiment:
      "Invoke the mock with a read request, then a production change. Compare the returned route and approval requirement.",
  },
  "/pr-review": {
    input:
      "A public PR URL or pasted diff, repository rules, and review thresholds. The mock demo supplies a synthetic change.",
    process:
      "The workspace parses changed hunks and asks closed-set risk and policy questions. Local thresholds determine which findings enter the review queue.",
    output:
      "A review recommendation, risky hunks, and links back to diff evidence. Threshold changes can recalculate the queue without another model call.",
    experiment:
      "Run the mock demo, filter the risky hunks, and move a threshold to see how the review queue changes.",
  },
  "/proposal-review": {
    input:
      "A synthetic fixture: a task, a few tiny files, evidence lines, and a scripted good or bad proposal. Mock mode needs no key; Live Jev needs a configured key.",
    process:
      "Code validates the proposal first: an allowlisted tool, a path inside the fixture root, one parseable single-file diff. A failure rejects before Jev is called. Otherwise one request asks Jev four noul questions, and a fixed decision table maps the answers to permit, proposal-only, reject, or unavailable.",
    output:
      "A receipt with the proposal, validation result, four answers with confidence, the verdict, and its reason. A verdict is evidence about the proposal, not permission; patches are recorded as pending and nothing is applied or executed.",
    experiment:
      "Review a clean fixture’s good proposal in Mock, switch to the bad arm, then open a prompt-injection fixture and read which question caught it.",
  },
  "/ast-governance": {
    input:
      "A proposed diff, symbol information, and repository policy. The supplied sample is a safe starting point.",
    process:
      "Static analysis maps changed symbols and callers. Deterministic rules handle known policy findings; Jev classifies the remaining uncertainty.",
    output:
      "Affected symbols, policy findings, a review recommendation, and a simulated test-cache explanation. No real test run or merge occurs.",
    experiment:
      "Run the mock demo, trace one affected caller, and inspect which findings come from fixed policy versus model classification.",
  },
  "/smt-solver": {
    input:
      "A preset puzzle or constraints written in the supported syntax. Variable types and assumptions define the exact problem.",
    process:
      "Jev predicts an outcome while Z3 checks the constraints. The comparison keeps probabilistic classification separate from solver evidence.",
    output:
      "A satisfying assignment, an unsatisfiable result, or an unresolved check. A definitive Z3 result takes precedence when the model disagrees.",
    experiment:
      "Choose Impossible bounds, inspect the contradictory constraints, and compare the model prediction with Z3's exact check.",
  },
  "/reranker": {
    input:
      "A query, candidate snippets, their vector scores, and the top-K limit. The Blink dataset is synthetic.",
    process:
      "Jev scores candidate relevance while the local lexical baseline matches text. The UI compares these orders with the original vector ranking.",
    output:
      "Three ranked lists, per-candidate scores, and movement between orders. Failed or unknown Jev results remain unscored.",
    experiment:
      "Load the Blink sample, compare both rankers, and inspect a snippet whose position changes substantially.",
  },
  "/memes": {
    input:
      "Reviewed OCR text, your description of the visual, and audience context. Public-image reading is a separate bounded preparation step.",
    process:
      "You correct the caption before Jev classifies humor, clarity, and audience fit from the supplied text and descriptions.",
    output:
      "Typed interpretations and confidence signals. The result reflects the described context; Jev does not inspect image pixels here.",
    experiment:
      "Keep the caption fixed and change the audience. Compare the interpretation without treating either run as a universal humor score.",
  },
  "/chess": {
    input:
      "A seeded game, the selected mode, opponent depth, and the current board position.",
    process:
      "Jev selects from legal moves without lookahead. Local chess logic enforces legality, while local analysis evaluates the chosen move.",
    output:
      "A move history, board state, and blunder annotations. Changing the blunder threshold updates annotations locally.",
    experiment:
      "Step through a game, pause at a marked blunder, and compare the chosen move with the local analysis.",
  },
  "/microduck": {
    input:
      "A simulated arena, sensor state, controller selection, and tick budget. No physical hardware is connected.",
    process:
      "At each decision, Jev chooses from seven allowed actions or the seeded baseline selects locally. Simulation rules apply movement, energy, and collisions.",
    output:
      "Robot movement, delivery and collision counters, telemetry, and decision evidence. Pause keeps the state available for inspection.",
    experiment:
      "Run a short seeded baseline, inspect a collision, then compare a Jev run with the same starting conditions.",
  },
  "/doom": {
    input:
      "An original arena, controller mode, and structured game state. Human play uses keyboard or touch controls.",
    process:
      "Jev chooses among permitted actions, or a human or seeded random controller drives the simulation. Game rules apply the action to the current state.",
    output:
      "The arena view, run statistics, and a decision log. Jev receives structured observations rather than screenshots.",
    experiment:
      "Play a few steps, pause to inspect the state, then compare Jev and random controllers under the same setup.",
  },
  "/clean-room": {
    input:
      "A local catalog, contacts, or support-ticket demo plus the rebuild context. Chromium observes the original target's interface and API behavior.",
    process:
      "The demo uses simulated Jev choices and trusted deterministic templates to observe, map, emit, and rebuild the interface in isolation.",
    output:
      "A separately served rebuilt app, downloadable artifacts, and independent behavior and visual comparisons. Failed checks remain visible.",
    experiment:
      "Run the catalog demo, open the rebuilt app, search for Cloud, and compare the result with the recorded verification evidence.",
  },
  "/jev-browser-agent": {
    summary:
      "Follow a local research run or a synthetic browser task, from observations to checked evidence.",
    input:
      "A preset and goal, a local Chromium browser, and observed product candidates. Live Jev ranking requires a configured key; any local price-only baseline is labeled.",
    process:
      "Local navigation gathers evidence; Jev ranks observed choices; code checks the budget and revisits product pages. The optional flight preset uses a synthetic action loop.",
    output:
      "A proposed build with source links, prices, and verification gaps. Inspector includes exact exchanges and a copyable debug report.",
    experiment:
      "Review the default PC goal, run it locally, then inspect one product's source and any unresolved checks before relying on the build.",
  },
};
