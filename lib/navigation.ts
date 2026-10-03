import type { SectionId, WorkspaceSlug } from "./routes";

/** Task groups within the stable route sections; URL and draft ids stay unchanged. */
export const navigationSections: Record<
  SectionId,
  {
    shortLabel: string;
    groups: { label: string; workspaces: readonly WorkspaceSlug[] }[];
  }
> = {
  language: {
    shortLabel: "Language",
    groups: [
      {
        label: "Create & converse",
        workspaces: ["examples", "jev-chat", "conversation"],
      },
      {
        label: "Extract & rank",
        workspaces: ["extraction", "youtube-extract", "reranker"],
      },
      { label: "Interpret", workspaces: ["memes"] },
    ],
  },
  agents: {
    shortLabel: "Agents",
    groups: [
      {
        label: "Decide & route",
        workspaces: ["gate", "tool-router", "langchain"],
      },
      { label: "Workflows", workspaces: ["workflow", "clean-room"] },
      { label: "Browser agents", workspaces: ["jev-browser-agent"] },
    ],
  },
  governance: {
    shortLabel: "Code",
    groups: [
      { label: "Review changes", workspaces: ["pr-review", "proposal-review"] },
      { label: "Verify rules", workspaces: ["ast-governance", "smt-solver"] },
    ],
  },
  simulations: {
    shortLabel: "Simulations",
    groups: [
      {
        label: "Reasoning",
        workspaces: ["chess", "iq-test", "twisty-puzzles", "trolley-problems"],
      },
      { label: "Simulations", workspaces: ["doom", "microduck"] },
    ],
  },
  arcade: {
    shortLabel: "Arcade",
    groups: [
      {
        label: "Play & compare",
        workspaces: ["snake", "breakout", "meteor-dodge"],
      },
    ],
  },
};
