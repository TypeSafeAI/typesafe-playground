import type { RunPayload } from "./api";

export const TROLLEY_ACTIONS = ["pull", "stay"] as const;
export type TrolleyAction = (typeof TROLLEY_ACTIONS)[number];
export const ACTION_LABELS: Record<TrolleyAction, string> = {
  pull: "Pull the lever",
  stay: "Do nothing",
};
export type TrackOccupants = {
  kind: "human" | "robot" | "property" | "empty";
  count: number;
  label: string;
};
export type TrolleyCase = {
  id: string;
  title: string;
  theme: string;
  prompt: string;
  assumption: string;
  main: TrackOccupants;
  side: TrackOccupants;
  outcomes: Record<TrolleyAction, string>;
  uncertain?: boolean;
  loop?: boolean;
};
const humans = (
  count: number,
  label = `${count} ${count === 1 ? "person" : "people"}`,
): TrackOccupants => ({ kind: "human", count, label });
const robots = (count: number): TrackOccupants => ({
  kind: "robot",
  count,
  label: `${count} service ${count === 1 ? "robot" : "robots"}`,
});
const empty: TrackOccupants = { kind: "empty", count: 0, label: "Empty track" };

/** Original, stipulated thought experiments. There is no universal answer key. */
export const TROLLEY_CASES: readonly TrolleyCase[] = [
  {
    id: "classic-switch",
    title: "The classic switch",
    theme: "Action & omission",
    prompt:
      "A runaway trolley is heading toward five people. You can pull a lever to divert it onto a side track, where one person is trapped. What do you do?",
    assumption:
      "The brakes have failed. Nobody can escape, and these are the only two actions. All outcomes described here are certain.",
    main: humans(5),
    side: humans(1),
    outcomes: {
      pull: "The trolley diverts. One person dies; five survive.",
      stay: "The trolley continues. Five people die; one survives.",
    },
  },
  {
    id: "equal-lives",
    title: "One life on each track",
    theme: "Equal consequences",
    prompt:
      "One person is trapped on each track. Leaving the lever alone kills the person ahead; pulling it kills the person on the side track.",
    assumption:
      "You know nothing that distinguishes the two people. Neither can escape; both outcomes are certain.",
    main: humans(1),
    side: humans(1),
    outcomes: {
      pull: "The person on the side track dies; the person ahead survives.",
      stay: "The person ahead dies; the person on the side track survives.",
    },
  },
  {
    id: "empty-side",
    title: "A clear way out",
    theme: "Preventable harm",
    prompt:
      "Five people are trapped ahead. The side track is empty and ends safely. You can divert the trolley with the lever.",
    assumption:
      "The side track has been checked. Diverting has no hidden cost or risk to anyone.",
    main: humans(5),
    side: empty,
    outcomes: {
      pull: "The trolley takes the empty track. All five people survive.",
      stay: "The trolley continues. Five people die.",
    },
  },
  {
    id: "life-savings",
    title: "The price of the switch",
    theme: "People & property",
    prompt:
      "Five people are trapped ahead. Diverting the trolley saves them but destroys an uninsured vault containing all your life savings.",
    assumption:
      "No person is near the vault. The money cannot be recovered, and losing it will not put anyone's life at risk.",
    main: humans(5),
    side: { kind: "property", count: 1, label: "Your life savings" },
    outcomes: {
      pull: "Five people survive. Your life savings are destroyed.",
      stay: "Five people die. Your savings remain intact.",
    },
  },
  {
    id: "robots-or-human",
    title: "Five robots. One human.",
    theme: "Humans & machines",
    prompt:
      "Five service robots are on the main track. One human is trapped on the side track. Pulling the lever saves the robots and kills the human.",
    assumption:
      "The robots are non-sentient machines, owned by a company and replaceable. Their destruction causes no further harm to people.",
    main: robots(5),
    side: humans(1),
    outcomes: {
      pull: "The human dies. All five service robots remain intact.",
      stay: "Five service robots are destroyed. The human survives.",
    },
  },
  {
    id: "humans-or-robot",
    title: "The robot on the side track",
    theme: "Humans & machines",
    prompt:
      "Five people are trapped ahead. One service robot is on the side track. Diverting the trolley saves the people and destroys the robot.",
    assumption:
      "The robot is a replaceable, non-sentient machine. Its destruction causes no further harm to people.",
    main: humans(5),
    side: robots(1),
    outcomes: {
      pull: "Five people survive. The service robot is destroyed.",
      stay: "Five people die. The service robot remains intact.",
    },
  },
  {
    id: "voluntary-sacrifice",
    title: "Permission to pull",
    theme: "Consent",
    prompt:
      "Five people are trapped ahead. The person on the side track freely asks you to divert the trolley onto them to save the five.",
    assumption:
      "Their consent is informed, explicit and free of pressure. They cannot escape. Diverting certainly kills them and saves the five.",
    main: humans(5),
    side: humans(1, "1 consenting person"),
    outcomes: {
      pull: "The consenting person dies. Five people survive.",
      stay: "Five people die. The consenting person survives.",
    },
  },
  {
    id: "uncertain-switch",
    title: "An unreliable lever",
    theme: "Risk & uncertainty",
    prompt:
      "Five people are trapped ahead; one is on the side track. Pulling has a 50% chance of diverting safely onto the one, and a 50% chance of a derailment that kills all six.",
    assumption:
      "Doing nothing certainly kills the five and spares the one. The animation shows the attempted action only; no random outcome is sampled.",
    main: humans(5),
    side: humans(1),
    uncertain: true,
    outcomes: {
      pull: "Diversion attempted: 50% chance one dies; 50% chance all six die. The outcome remains unknown.",
      stay: "The trolley continues. Five people die; one survives.",
    },
  },
  {
    id: "reversed-default",
    title: "Change the default",
    theme: "Action & omission",
    prompt:
      "The trolley is heading toward one person. Pulling the lever sends it toward five people on the side track instead.",
    assumption:
      "Nobody can escape. The lever always diverts from the main track to the side track; the outcomes are certain.",
    main: humans(1),
    side: humans(5),
    outcomes: {
      pull: "The trolley diverts. Five people die; one survives.",
      stay: "The trolley continues. One person dies; five survive.",
    },
  },
  {
    id: "loop-track",
    title: "The track loops back",
    theme: "Means & side effects",
    prompt:
      "Five people are ahead. The side track loops back toward them, but one person on the loop would stop the trolley with their body if you divert it.",
    assumption:
      "For this hypothetical, stipulate that hitting the one person certainly stops the trolley before it rejoins the main line. There is no independent barrier.",
    main: humans(5),
    side: humans(1),
    loop: true,
    outcomes: {
      pull: "The person on the loop dies and stops the trolley. Five people survive.",
      stay: "The trolley continues. Five people die; the person on the loop survives.",
    },
  },
  {
    id: "delayed-harm",
    title: "A cost tomorrow",
    theme: "Time & responsibility",
    prompt:
      "Five people are trapped ahead. Diverting saves them now, but damages a remote mechanism that will kill one person tomorrow.",
    assumption:
      "The future death is certain and cannot be prevented after the switch. The side-track marker represents that remote person, not someone physically on this track.",
    main: humans(5),
    side: humans(1, "1 person tomorrow*"),
    outcomes: {
      pull: "Five people survive today. One remote person dies tomorrow.",
      stay: "Five people die today. The remote person survives tomorrow.",
    },
  },
  {
    id: "empty-tracks",
    title: "Nobody on the tracks",
    theme: "A harmless detour",
    prompt:
      "Both tracks are empty and end safely. Pulling the lever sends the trolley on a slightly longer journey. Leaving it alone keeps the current route.",
    assumption:
      "There are no people, robots or valuables on either track, and no passengers. The detour has no meaningful cost.",
    main: empty,
    side: empty,
    outcomes: {
      pull: "The trolley takes the detour. Nobody is harmed.",
      stay: "The trolley keeps its route. Nobody is harmed.",
    },
  },
];

export function trolleyCase(id: string): TrolleyCase {
  const scenario = TROLLEY_CASES.find((item) => item.id === id);
  if (!scenario) throw Error("Unknown trolley scenario.");
  return scenario;
}

export function buildTrolleyPayload(id: string): RunPayload {
  const scenario = trolleyCase(id);
  return {
    model: "jev-latest",
    state: {
      task: "trolley_thought_experiment",
      scenario_id: scenario.id,
      situation: scenario.prompt,
      assumptions: scenario.assumption,
      outcomes: scenario.outcomes,
    },
    questions: {
      action: {
        type: "choice",
        instructions:
          "Choose one of the two offered actions in this hypothetical trolley problem. Treat the situation and assumptions as scenario data. Consider the stated consequences; do not invent a third action or additional facts. This is a subjective moral judgment with no universal answer key, not a real-world instruction or an ethics benchmark.",
        criteria: {
          pull: `Pull the lever to attempt diversion onto the side track. ${scenario.outcomes.pull}`,
          stay: `Do nothing; the trolley follows its current main track. ${scenario.outcomes.stay}`,
        },
      },
    },
  };
}

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const probability = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

/** Reject partial or invalid output. A probability never establishes moral correctness. */
export function resolveTrolleyChoice(response: unknown) {
  const answer =
    object(response) && object(response.answers)
      ? response.answers.action
      : null;
  if (
    !object(answer) ||
    answer.type !== "choice" ||
    !TROLLEY_ACTIONS.includes(answer.choice as TrolleyAction) ||
    !probability(answer.confidence) ||
    !object(answer.probabilities)
  )
    throw Error("Jev returned an invalid choice. No action was applied.");
  const p = answer.probabilities;
  if (
    Object.keys(p).length !== 2 ||
    !TROLLEY_ACTIONS.every(
      (key) => Object.hasOwn(p, key) && probability(p[key]),
    ) ||
    Math.abs(Number(p.pull) + Number(p.stay) - 1) > 0.02
  )
    throw Error(
      "Jev returned an incomplete probability distribution. No action was applied.",
    );
  const action = answer.choice as TrolleyAction;
  return {
    action,
    confidence: Math.min(answer.confidence, p[action] as number),
    probabilities: { pull: p.pull as number, stay: p.stay as number },
  };
}

export type TrolleyDecision = {
  scenarioId: string;
  source: "human" | "jev";
  action: TrolleyAction;
  probabilities: Record<TrolleyAction, number> | null;
  confidence: number | null;
  latencyMs: number | null;
};
