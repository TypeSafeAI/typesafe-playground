import { renderStory, storyPlanId } from "./story";
import type { StoryFrame, StoryTone, StoryEnding } from "./story";
import type { Context, CreativeChoices, Plan, Style } from "./types";
import { creativeFields } from "./creative-policy";
import type { CreativeField, CreativeResolution } from "./creative-policy";

export const storyControls = {
  tone: {
    reflective: "Reflective observation and deliberate pacing.",
    suspenseful: "Urgent pacing, uncertain sounds and anticipation.",
    hopeful: "Encouragement, cooperation and possibility.",
  },
  ending: {
    resolved: "The obstacle reaches a concrete resolution.",
    open: "Leave the central outcome unresolved, with a possible next step.",
  },
  style: {
    concise: "Keep the essential causal beats with little elaboration.",
    balanced: "A short scene with some atmosphere and development.",
    detailed: "Expand the same scene with observations and detail.",
  },
} as const;
export const storyFields = creativeFields;
export type StoryField = CreativeField;
export type StoryDecision = {
  action: "new" | "revise" | "clarify";
  tone: StoryTone;
  ending: StoryEnding;
  style: Style;
  edits: StoryField[];
};
export function hasStoryRequest(context: Context): boolean {
  return (
    !!context.previousStory ||
    context.input.topic === "creative" ||
    /\b(story|fiction|tale|scene|imagine)\b/i.test(context.question)
  );
}
export function looksLikeStoryRevision(question: string): boolean {
  return /^(?:please\s+)?(?:make|give|revise|rewrite|change|keep|add|remove|shorten|expand|continue)\b/i.test(
    question,
  );
}
// Local demo understands this small, explicit editing grammar. Extra clauses
// must match too: recognizing one adjective never authorizes ignoring the rest.
export function demoStoryDecision(context: Context): StoryDecision {
  const decision: StoryDecision = {
    action: "new",
    tone: "reflective",
    ending: "resolved",
    style: context.input.style,
    edits: [],
  };
  const question = context.question
    .toLowerCase()
    .replace(/[.!?]+$/, "")
    .trim();
  const newStory =
    /\b(write|create|imagine|tell|compose)\b/.test(question) &&
    /\b(story|fiction|tale|scene)\b/.test(question) &&
    !/\b(rewrite|revise|same|this|that|it)\b/.test(question);
  if (newStory) {
    const tones = Object.keys(storyControls.tone).filter((tone) =>
      new RegExp(`\\b${tone}\\b`).test(question),
    );
    if (tones.length > 1) return { ...decision, action: "clarify" };
    if (tones.length) decision.tone = tones[0] as StoryTone;
    if (/\bopen ending\b/.test(question)) decision.ending = "open";
    return decision;
  }
  decision.action = "revise";
  if (!context.previousStory) return { ...decision, action: "clarify" };
  const parts = question.replace(/^please\s+/, "").split(/\s+and\s+|,\s*/);
  for (const part of parts) {
    let field: StoryField | undefined;
    const tone =
      /^(?:make (?:it|the (?:story|scene)) (?:more )?)?(reflective|suspenseful|hopeful)$/.exec(
        part,
      );
    const ending =
      /^(?:(?:give (?:it|the (?:story|scene))|use) (?:an? )?)(open|resolved) ending$/.exec(
        part,
      );
    if (tone) {
      field = "tone";
      decision.tone = tone[1] as StoryTone;
    } else if (ending) {
      field = "ending";
      decision.ending = ending[1] as StoryEnding;
    } else if (
      /^(?:make (?:it|the (?:story|scene)) (?:shorter|more concise)|shorten it)$/.test(
        part,
      )
    ) {
      field = "style";
      decision.style = "concise";
    } else if (
      /^make (?:it|the (?:story|scene)) (?:longer|more detailed)$/.test(part)
    ) {
      field = "style";
      decision.style = "detailed";
    }
    if (!field || decision.edits.includes(field))
      return { ...decision, action: "clarify" };
    decision.edits.push(field);
  }
  return decision;
}
export function storyClarification(): Plan {
  return {
    id: "clarify_story",
    intent: "clarify",
    title: "Story direction needed",
    sections: [
      {
        provenance: "authored",
        text: "I need a supported story direction to make that change reliably. Start a fictional scene, or revise the current scene’s tone, ending, or detail. Changes outside the available story vocabulary need a different direction.",
      },
    ],
    sources: [],
    options: ["Write a short story"],
    status: "clarify",
  };
}
export function storyPlans(
  context: Context,
  selection: CreativeChoices,
  decision?: StoryDecision,
  alternatives?: CreativeResolution[],
): Plan[] {
  if (
    !decision ||
    decision.action === "clarify" ||
    (decision.action === "revise" && !context.previousStory)
  )
    return [storyClarification()];
  const revising = decision.action === "revise";
  const theme = revising
    ? null
    : (/\babout\s+(.+?)(?:[.!?]|$)/i.exec(context.question)?.[1]?.trim() ??
      null);
  if (theme && theme.length > 100) return [storyClarification()];
  const resolutions = alternatives ?? [{ choices: selection, ...decision }];
  const frames = resolutions.map((values): StoryFrame => {
    if (revising) {
      const frame = {
        ...context.previousStory!,
        choices: { ...context.previousStory!.choices },
      };
      for (const field of values.edits) {
        if (field === "tone") frame.tone = values.tone;
        else if (field === "ending") frame.ending = values.ending;
        else if (field === "style") frame.style = values.style;
        else frame.choices[field] = values.choices[field];
      }
      // An explicit interface detail change also applies to the revision.
      if (!values.edits.includes("style")) frame.style = context.input.style;
      return frame;
    }
    const frame: StoryFrame = {
      version: "jev-story-v1",
      choices: { ...values.choices },
      theme,
      tone: values.tone,
      ending: values.ending,
      style: values.style,
      variant: 0,
    };
    if (context.input.mode === "demo") {
      const q = context.question.toLowerCase();
      if (/\blighthouse\b/.test(q)) {
        frame.choices.character = "keeper";
        frame.choices.setting = "coast";
      } else if (/\bmechanic\b/.test(q)) frame.choices.character = "mechanic";
      else if (/\bcartographer\b/.test(q))
        frame.choices.character = "cartographer";
    }
    return frame;
  });
  const candidates = revising
    ? frames
    : ([0, 1, 2] as const).map((variant) => ({
        ...frames[variant % frames.length],
        variant,
      }));
  return candidates.map((story, index) => {
    const alternative = revising ? (index as 0 | 1 | 2) : 0;
    return {
      id: storyPlanId(story.variant, alternative),
      intent: "create",
      title: `${story.tone} scene · ${story.ending} ending · variation ${story.variant + 1}${alternative ? ` · alternative ${alternative + 1}` : ""}`,
      sections: renderStory(story),
      sources: [],
      status: "answered",
      story,
      options: [
        "Make it more suspenseful",
        "Give it an open ending",
        "Make it shorter",
        "Write another short story",
        "Explain how this story was composed",
      ],
    };
  });
}
