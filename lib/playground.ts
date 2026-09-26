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
  Worm,
  BrickWall,
  Rocket,
} from "lucide-react";
import { sectionPath } from "./routes";

/** One catalog keeps the home screen, navigation and breadcrumbs in sync. */
export const playgroundGroups = [
  {
    id: "language",
    href: sectionPath("language"),
    label: "Language & data",
    description: "Turn unstructured context into a clear, grounded choice.",
    headline: ["Messy context.", "Grounded choices."],
    signal: ["Text or documents", "Fixed options", "Grounded answer"],
    examples: [
      {
        href: "/language/examples",
        label: "Example builder",
        icon: Blocks,
        detail:
          "Explore the original catalog, edit inputs and define your own closed-set questions.",
        flow: "Context → typed answer",
      },
      {
        href: "/language/jev-chat",
        label: "Jev Chat",
        icon: MessageSquare,
        detail:
          "Explore Jev-driven response composition, source passages, constrained fiction, and visible decisions.",
        flow: "Question → composed response",
      },
      {
        href: "/language/conversation",
        label: "Conversation lab",
        icon: MessageSquare,
        detail:
          "Rank messages and find the person your bot should answer next.",
        flow: "Messages → best reply target",
      },
      {
        href: "/language/extraction",
        label: "Document extraction",
        icon: FileScan,
        detail:
          "Select dates, vendors and amounts from values actually present in a document.",
        flow: "Document → selected fields",
      },
      {
        href: "/language/youtube-extract",
        label: "YouTube extract",
        icon: FileScan,
        detail:
          "Select original caption passages with Jev scores, cost tracking and timestamp-linked verification.",
        flow: "Video captions → chronological extract",
      },
      {
        href: "/language/reranker",
        label: "Vector reranker",
        icon: ArrowDownWideNarrow,
        detail:
          "Compare Jev, vector similarity and a lexical baseline on the same candidates.",
        flow: "Search results → relevance order",
      },
      {
        href: "/language/memes",
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
    href: sectionPath("agents"),
    label: "Agents & workflows",
    description:
      "Choose the next step, with explicit policy and approval gates.",
    headline: ["One next step.", "Policy stays in charge."],
    signal: ["Goal and state", "Allowed actions", "Next step"],
    examples: [
      {
        href: "/agents/gate",
        label: "Ask gate",
        icon: Inbox,
        detail:
          "Decide whether a request belongs with Jev or needs human attention.",
        flow: "Request → reviewer",
      },
      {
        href: "/agents/workflow",
        label: "Workflow chat",
        icon: GitBranch,
        detail:
          "Describe a scenario and see which action follows your process.",
        flow: "Scenario → next action",
      },
      {
        href: "/agents/tool-router",
        label: "Tool router",
        icon: Route,
        detail:
          "Follow a request through a graph with blocked tools and approval stops.",
        flow: "Request → permitted tool",
      },
      {
        href: "/agents/langchain",
        label: "LangChain",
        icon: Plug,
        detail:
          "Try a typed routing tool with live classification or a mocked response.",
        flow: "Tool call → governed route",
      },
      {
        href: "/agents/clean-room",
        label: "Clean-room rebuild",
        icon: Blocks,
        detail:
          "Rebuild observed screens and API contracts, then compare behavior in a real browser.",
        flow: "Observed app → verified rebuild",
      },
      {
        href: "/agents/jev-browser-agent",
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
    href: sectionPath("governance"),
    label: "Code & governance",
    description:
      "Surface risky changes and verify decisions against fixed rules.",
    headline: ["Typed judgments.", "Code has the last word."],
    signal: ["Change or constraint", "Typed questions", "Rule-checked verdict"],
    examples: [
      {
        href: "/governance/pr-review",
        label: "PR review",
        icon: GitPullRequest,
        detail:
          "Paste a PR or diff to separate routine changes from hunks needing review.",
        flow: "Diff → review gate",
      },
      {
        href: "/governance/proposal-review",
        label: "Proposal review",
        icon: ClipboardCheck,
        detail:
          "Let an agent propose one patch, ask Jev four questions about it, and let code decide.",
        flow: "Proposal → code verdict",
      },
      {
        href: "/governance/ast-governance",
        label: "AST governance",
        icon: Network,
        detail:
          "Trace changed symbols, affected callers and deterministic policy findings.",
        flow: "Symbols → change impact",
      },
      {
        href: "/governance/smt-solver",
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
    href: sectionPath("simulations"),
    label: "Games & simulations",
    description: "Watch small decisions play out—and discover their limits.",
    headline: ["Small decisions.", "Visible limits."],
    signal: ["World state", "One action", "Play it out"],
    examples: [
      {
        href: "/simulations/doom",
        label: "Jev plays Doom",
        icon: Gamepad2,
        detail:
          "Enter JevDoom’s fullscreen 3D arena and compare human, Jev and random play.",
        flow: "Arena state → one action",
      },
      {
        href: "/simulations/microduck",
        label: "MicroDuck arena",
        icon: Bird,
        detail:
          "Guide a robot through a 3D delivery floor with seven possible actions.",
        flow: "Robot sensors → movement",
      },
      {
        href: "/simulations/chess",
        label: "Jev attempts chess",
        icon: Crown,
        detail:
          "See why choosing a legal move without lookahead falls short of a chess engine.",
        flow: "Legal moves → one choice",
      },
    ],
  },
  {
    id: "arcade",
    href: sectionPath("arcade"),
    label: "Arcade",
    description:
      "Classic games Jev can actually play: one legal move at a time, scored against a random baseline.",
    headline: ["Insert coin.", "Jev takes the controls."],
    signal: ["Game state", "Legal moves", "Score vs. baseline"],
    examples: [
      {
        href: "/arcade/snake",
        label: "Snake",
        icon: Worm,
        detail:
          "Steer toward the apple without hitting a wall or your own tail, one turn per decision.",
        flow: "Board features → next direction",
      },
      {
        href: "/arcade/breakout",
        label: "Breakout",
        icon: BrickWall,
        detail:
          "Keep the ball in play and clear bricks by moving the paddle left, right or holding still.",
        flow: "Ball and paddle → paddle move",
      },
      {
        href: "/arcade/meteor-dodge",
        label: "Meteor dodge",
        icon: Rocket,
        detail:
          "Fly a ship through five lanes of falling meteors and survive as long as possible.",
        flow: "Lanes ahead → lane change",
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
export type PlaygroundGroup = (typeof playgroundGroups)[number];
export const playgroundPages = [
  homePage,
  ...playgroundGroups.flatMap((group) => group.examples),
];
/** The section a path belongs to: its own page, or any workspace inside it. */
export function groupForPath(path: string): PlaygroundGroup | undefined {
  return playgroundGroups.find(
    (group) => path === group.href || path.startsWith(`${group.href}/`),
  );
}
