import {
  Blocks,
  MessageSquare,
  Inbox,
  GitBranch,
  FileScan,
  GitPullRequest,
  ClipboardCheck,
  Network,
  Scale,
  Route,
  Plug,
  ArrowDownWideNarrow,
  Gamepad2,
  Laugh,
  Crown,
  Bird,
  House,
  MousePointerClick,
} from "lucide-react";

/** One catalog keeps the home screen, navigation and breadcrumbs in sync. */
export const playgroundGroups = [
  {
    id: "language",
    label: "Language & data",
    description: "Turn unstructured context into a clear, grounded choice.",
    examples: [
      {
        href: "/examples",
        label: "Example builder",
        icon: Blocks,
        detail:
          "Explore the original catalog, edit inputs and define your own closed-set questions.",
        flow: "Context → typed answer",
      },
      {
        href: "/jev-chat",
        label: "Jev Chat",
        icon: MessageSquare,
        detail:
          "Explore Jev-driven response composition, source passages, constrained fiction, and visible decisions.",
        flow: "Question → composed response",
      },
      {
        href: "/conversation",
        label: "Conversation lab",
        icon: MessageSquare,
        detail:
          "Rank messages and find the person your bot should answer next.",
        flow: "Messages → best reply target",
      },
      {
        href: "/extraction",
        label: "Document extraction",
        icon: FileScan,
        detail:
          "Select dates, vendors and amounts from values actually present in a document.",
        flow: "Document → selected fields",
      },
      {
        href: "/youtube-extract",
        label: "YouTube extract",
        icon: FileScan,
        detail:
          "Select original caption passages with Jev scores, cost tracking and timestamp-linked verification.",
        flow: "Video captions → chronological extract",
      },
      {
        href: "/reranker",
        label: "Vector reranker",
        icon: ArrowDownWideNarrow,
        detail:
          "Compare Jev, vector similarity and a lexical baseline on the same candidates.",
        flow: "Search results → relevance order",
      },
      {
        href: "/memes",
        label: "Meme lab",
        icon: Laugh,
        detail:
          "Classify a meme’s humor, audience and clarity from reviewed captions.",
        flow: "Caption → audience fit",
      },
    ],
  },
  {
    id: "agents",
    label: "Agents & workflows",
    description:
      "Choose the next step, with explicit policy and approval gates.",
    examples: [
      {
        href: "/gate",
        label: "Ask gate",
        icon: Inbox,
        detail:
          "Decide whether a request belongs with Jev or needs human attention.",
        flow: "Request → reviewer",
      },
      {
        href: "/workflow",
        label: "Workflow chat",
        icon: GitBranch,
        detail:
          "Describe a scenario and see which action follows your process.",
        flow: "Scenario → next action",
      },
      {
        href: "/tool-router",
        label: "Tool router",
        icon: Route,
        detail:
          "Follow a request through a graph with blocked tools and approval stops.",
        flow: "Request → permitted tool",
      },
      {
        href: "/langchain",
        label: "LangChain",
        icon: Plug,
        detail:
          "Try a typed routing tool with live classification or a mocked response.",
        flow: "Tool call → governed route",
      },
      {
        href: "/clean-room",
        label: "Clean-room rebuild",
        icon: Blocks,
        detail:
          "Rebuild observed screens and API contracts, then compare behavior in a real browser.",
        flow: "Observed app → verified rebuild",
      },
      {
        href: "/jev-browser-agent",
        label: "Browser agent",
        icon: MousePointerClick,
        detail:
          "Drive a synthetic flight search from an indexed element table, one operation and target per request.",
        flow: "Element table → operation + target",
      },
    ],
  },
  {
    id: "governance",
    label: "Code & governance",
    description:
      "Surface risky changes and verify decisions against fixed rules.",
    examples: [
      {
        href: "/pr-review",
        label: "PR review",
        icon: GitPullRequest,
        detail:
          "Paste a PR or diff to separate routine changes from hunks needing review.",
        flow: "Diff → review gate",
      },
      {
        href: "/proposal-review",
        label: "Proposal review",
        icon: ClipboardCheck,
        detail:
          "Let an agent propose one patch, ask Jev four questions about it, and let code decide.",
        flow: "Proposal → code verdict",
      },
      {
        href: "/ast-governance",
        label: "AST governance",
        icon: Network,
        detail:
          "Trace changed symbols, affected callers and deterministic policy findings.",
        flow: "Symbols → change impact",
      },
      {
        href: "/smt-solver",
        label: "SMT solver",
        icon: Scale,
        detail:
          "Compare Jev’s prediction with an exact solver on structured constraints.",
        flow: "Constraints → verified result",
      },
    ],
  },
  {
    id: "simulations",
    label: "Games & simulations",
    description: "Watch small decisions play out—and discover their limits.",
    examples: [
      {
        href: "/doom",
        label: "Jev plays Doom",
        icon: Gamepad2,
        detail:
          "Enter JevDoom’s fullscreen 3D arena and compare human, Jev and random play.",
        flow: "Arena state → one action",
      },
      {
        href: "/microduck",
        label: "MicroDuck arena",
        icon: Bird,
        detail:
          "Guide a robot through a 3D delivery floor with seven possible actions.",
        flow: "Robot sensors → movement",
      },
      {
        href: "/chess",
        label: "Jev attempts chess",
        icon: Crown,
        detail:
          "See why choosing a legal move without lookahead falls short of a chess engine.",
        flow: "Legal moves → one choice",
      },
    ],
  },
];
/**
 * Bento spans over a six-column set. Every set opens with a wide lead tile,
 * and the rows that follow always fill exactly, so a filtered set never
 * leaves a ragged hole where a tile used to be.
 */
export function bentoSpans(total: number): number[] {
  if (total < 1) return [];
  if (total === 1) return [6];
  const spans = [4, 2];
  for (let rest = total - 2; rest > 0;) {
    if (rest >= 3) {
      spans.push(2, 2, 2);
      rest -= 3;
    } else if (rest === 2) {
      spans.push(3, 3);
      rest -= 2;
    } else {
      spans.push(6);
      rest -= 1;
    }
  }
  return spans;
}
/** Every flow reads "in → out", the two ends a typed judgment connects. */
export function flowEnds(flow: string): { input: string; output: string } {
  const [input, output] = flow.split("→");
  return {
    input: (input ?? flow).trim(),
    output: (output ?? "").trim(),
  };
}
export const homePage = { href: "/", label: "Home", icon: House };
export const playgroundPages = [
  homePage,
  ...playgroundGroups.flatMap((group) => group.examples),
];
