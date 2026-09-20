/** Task guidance is presentation only; execution contracts stay with each lab. */
export type WorkspaceGuide = {
  steps: [string, string][];
  boundary: string;
  flow: [string, string, string];
};
export const workspaceGuides: Record<string, WorkspaceGuide> = {
  "/jev-chat": {
    steps: [
      [
        "Choose a topic",
        "Explore Jev, try synthetic support, add your own notes, or compose a fictional scene.",
      ],
      [
        "Start a conversation",
        "Local demo needs no key. Select Live Jev before the first message to use the model.",
      ],
      [
        "Inspect the response",
        "Open composition details for sources, alternatives, uncertainty, and content integrity. Export chats to keep a copy.",
      ],
    ],
    boundary:
      "Jev chooses meanings and code composes language. Demo uses local rules. Hashes verify integrity, not truth. No downstream actions execute.",
    flow: ["Question", "Jev decisions", "Composed response"],
  },
  "/": {
    steps: [
      [
        "Choose a question",
        "Browse the four workspace groups, or search by the task you want to explore.",
      ],
      [
        "Open an example",
        "Each card shows the input and the kind of result. Start with a preset before changing the context.",
      ],
      [
        "Inspect the outcome",
        "Use the workspace guide to understand the decision, its evidence, and its execution limits.",
      ],
    ],
    boundary:
      "This is an independent community playground. Live model outputs, seeded demos, and solver checks are labeled separately; none proves general model quality.",
    flow: ["Pick a task", "Try an example", "Inspect evidence"],
  },
  "/jev-browser-agent": {
    steps: [
      [
        "Set a goal",
        "Choose a preset and review the task. PC research requires the local browser runtime. Live Jev ranking needs a key; any local price-only baseline is labeled.",
      ],
      [
        "Follow the observations",
        "The browser reads the page; Jev selects from observed candidates or allowed actions. Pause or stop to inspect the run.",
      ],
      [
        "Check the evidence",
        "Open Inspector for source links, prices, verification gaps, and the debug report. A completed run is not a performance benchmark.",
      ],
    ],
    boundary:
      "PC research navigates real pages locally but never adds to a cart or purchases. Flight actions occur in a synthetic sandbox. Missing evidence remains a gap; any price-only fallback is labeled.",
    flow: ["Goal", "Observe & choose", "Checked evidence"],
  },
  "/youtube-extract": {
    steps: [
      [
        "Load captions",
        "Paste a public YouTube URL with an existing caption track.",
      ],
      [
        "Score passages",
        "Jev scores relevance and classifies key claims. Adjust extract length locally.",
      ],
      [
        "Verify omissions",
        "Inspect all scored chunks and open timestamp links to compare with the source.",
      ],
    ],
    boundary:
      "Source-only extract, not a generated summary. Scores cannot prove that nothing important was omitted. Public caption retrieval may be blocked.",
    flow: ["Captions", "Jev scores", "Extract"],
  },
  "/examples": {
    steps: [
      [
        "Pick a question",
        "Browse a collection or search the 110 starter examples. Your edits stay in this browser as drafts.",
      ],
      [
        "Change the context",
        "Edit the input and choose which questions to include. For A/B examples, inspect the one field that changes.",
      ],
      [
        "Read the evidence",
        "Run the example, compare the typed answers, and open reference notes where available. Export keeps your API key separate.",
      ],
    ],
    boundary:
      "Runs use live Jev. Confidence is a model signal, not proof of correctness. Subjective examples have no universal answer key.",
    flow: ["Context", "Typed questions", "Answers"],
  },
  "/conversation": {
    steps: [
      [
        "Set the conversation",
        "Load a sample or paste messages, then choose the experiment.",
      ],
      [
        "Choose a recipient",
        "Run Jev to rank messages against the reply policy.",
      ],
      [
        "Inspect the ranking",
        "Review the selected message, other candidates, and the reply-probability threshold.",
      ],
    ],
    boundary:
      "Live classification only. The lab does not write or send replies.",
    flow: ["Messages", "Reply policy", "Recipient"],
  },
  "/extraction": {
    steps: [
      [
        "Start with a document",
        "Load the invoice or paste your own synthetic text.",
      ],
      [
        "Choose the fields",
        "Select dates, counterparty, amount, or document type, then run extraction.",
      ],
      [
        "Check the source",
        "Each selected value points back to exact source evidence. A null result means no value was selected.",
      ],
    ],
    boundary:
      "Jev can choose only from source candidates or null. A provider error is a failed run, not a missing value.",
    flow: ["Document", "Candidates", "Source evidence"],
  },
  "/gate": {
    steps: [
      [
        "Supply the evidence",
        "Enter a question with conversation history and optional documentation.",
      ],
      ["Run the gate", "Triage one question or a whole chat dump."],
      [
        "Check the citation",
        "Inspect the supporting message or document. Weak evidence goes to a human.",
      ],
    ],
    boundary:
      "Live classification only. The lab does not write an answer or contact a reviewer.",
    flow: ["Question", "Evidence", "Review decision"],
  },
  "/workflow": {
    steps: [
      [
        "Choose a playbook",
        "Select an example and review its rules before starting a case.",
      ],
      [
        "Describe the case",
        "Use a sample message or add your own facts to the conversation.",
      ],
      [
        "Follow the recommendation",
        "Read the matching rule and add missing evidence when the decision is unclear.",
      ],
    ],
    boundary:
      "Recommended actions only. No refunds, fines, bans, or messages are executed.",
    flow: ["Case", "Your rules", "Recommendation"],
  },
  "/tool-router": {
    steps: [
      [
        "Choose a request",
        "Try reading settings, changing production, or requesting a secret.",
      ],
      [
        "Follow the path",
        "Run a live routing step or the complete seeded mock scenario. Continue from the decision to follow another edge.",
      ],
      [
        "Inspect the stop",
        "Review policy blocks and approval checkpoints. Expand the inspector for candidates and the full graph. Open Decision details or Step evidence for scores.",
      ],
    ],
    boundary:
      "Live Jev chooses a node; mock mode uses seeded choices. All agent and tool execution is simulated.",
    flow: ["Request", "Policy gate", "Permitted step"],
  },
  "/langchain": {
    steps: [
      [
        "Choose the request",
        "Use a preset or edit the request and current graph node.",
      ],
      [
        "Invoke the tool",
        "Try a mock invocation without credits, or use live Jev classification.",
      ],
      [
        "Read the contract",
        "Inspect the returned route, policy decision, and structured output for your application.",
      ],
    ],
    boundary:
      "The LangChain tool is real. It returns a decision and never executes downstream actions.",
    flow: ["Tool input", "Policy gate", "Structured result"],
  },
  "/pr-review": {
    steps: [
      [
        "Load a change",
        "Paste a public PR URL or a diff, or try the mock demo.",
      ],
      [
        "Review the rules",
        "Set repository rules and adjust thresholds only when needed.",
      ],
      [
        "Inspect risky hunks",
        "Follow each recommendation to the original diff and its policy evidence.",
      ],
    ],
    boundary:
      "Review recommendations only. This lab does not post reviews, run a second-stage model, or merge code.",
    flow: ["Diff", "Risk & policy", "Review queue"],
  },
  "/ast-governance": {
    steps: [
      [
        "Describe the change",
        "Load the sample or supply a diff and symbol index.",
      ],
      [
        "Map its impact",
        "Inspect callers, changed interfaces, and deterministic policy findings.",
      ],
      [
        "Review the recommendation",
        "Follow the decision back to affected symbols and evidence.",
      ],
    ],
    boundary:
      "The parser and test cache are prototypes. Cached test results are simulated; no tests or merges run.",
    flow: ["Changed symbols", "Affected callers", "Review decision"],
  },
  "/smt-solver": {
    steps: [
      ["Pick a puzzle", "Choose a scenario or write supported constraints."],
      [
        "Compare the approaches",
        "Ask Jev for a prediction and let Z3 check the constraints.",
      ],
      [
        "Trust the exact check",
        "Inspect a satisfying assignment or an unsatisfiable result. Missing or failed checks remain unresolved.",
      ],
    ],
    boundary:
      "Z3 performs a real solver check. A model prediction cannot override a definitive solver result.",
    flow: ["Constraints", "Jev + Z3", "Verified result"],
  },
  "/reranker": {
    steps: [
      [
        "Set the query",
        "Use the synthetic Blink sample or supply candidate snippets and vector scores.",
      ],
      [
        "Compare the orders",
        "Run live Jev relevance scoring or the local lexical baseline.",
      ],
      [
        "Inspect each snippet",
        "Compare movement and relevance across the three lists. Expand the guide for metric definitions.",
      ],
    ],
    boundary:
      "The baseline is lexical and mocked. Unscored results stay unknown; agreement is not proof of search quality.",
    flow: ["Candidates", "Relevance", "New order"],
  },
  "/memes": {
    steps: [
      [
        "Review the image text",
        "Use a sample or read a public image, then correct the OCR text.",
      ],
      [
        "Add the context",
        "Describe the visual, intended audience, and tone before running the test.",
      ],
      [
        "Read the interpretation",
        "Compare the classifications and their confidence with your own judgment.",
      ],
    ],
    boundary:
      "Jev receives reviewed text and descriptions, not image pixels. Humor and audience fit are subjective.",
    flow: ["Reviewed caption", "Audience context", "Interpretation"],
  },
  "/chess": {
    steps: [
      ["Set up a game", "Choose the mode, seed, and opponent depth."],
      [
        "Play a move",
        "Step through decisions or start automatic play. Pause to inspect a position.",
      ],
      [
        "Inspect the mistake",
        "Compare the selected legal move with the local analysis and move history.",
      ],
    ],
    boundary:
      "Jev chooses one legal move without lookahead. This is a limitations demo, not a competitive chess engine.",
    flow: ["Position", "Legal moves", "One choice"],
  },
  "/microduck": {
    steps: [
      [
        "Explore the arena",
        "Inspect the simulated robot, delivery stations, and telemetry.",
      ],
      [
        "Choose a controller",
        "Compare Jev choices with the seeded baseline and set the tick budget.",
      ],
      [
        "Follow the run",
        "Watch deliveries, bumps, and energy. Pause to inspect each action and its sensor state.",
      ],
    ],
    boundary:
      "Simulated hardware only. Each decision comes from seven allowed actions; no physical robot is connected.",
    flow: ["Sensors", "Allowed actions", "Robot movement"],
  },
  "/doom": {
    steps: [
      [
        "Enter the arena",
        "Play with the keyboard or touch controls; fullscreen is available.",
      ],
      [
        "Compare controllers",
        "Switch between human, Jev, and seeded random control.",
      ],
      [
        "Inspect a decision",
        "Pause and review the observed state, permitted action, and run log.",
      ],
    ],
    boundary:
      "JevDoom is an original game with no Doom engine or assets. Jev sees structured state, not screenshots.",
    flow: ["Arena state", "Allowed actions", "One game tick"],
  },
  "/clean-room": {
    steps: [
      [
        "Choose a demo",
        "Try catalog search, contacts CRUD, or a support ticket.",
      ],
      [
        "Run locally",
        "The pipeline observes a local target and rebuilds its interface with deterministic templates.",
      ],
      [
        "Check the rebuild",
        "Open the rebuilt app and inspect the independent behavioral and visual comparisons.",
      ],
    ],
    boundary:
      "UI demos use simulated Jev choices and require local Chromium. They do not establish live model quality or cost.",
    flow: ["Observe", "Rebuild", "Verify"],
  },
};
