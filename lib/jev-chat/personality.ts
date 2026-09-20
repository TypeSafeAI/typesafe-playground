export const personalityIds = [
  "default",
  "friendly",
  "playful",
  "professional",
] as const;
export type Personality = (typeof personalityIds)[number];
export const personalityLabels: Record<Personality, string> = {
  default: "Default",
  friendly: "Friendly",
  playful: "Playful",
  professional: "Professional",
};

export function isPersonality(value: unknown): value is Personality {
  return typeof value === "string" && personalityIds.some((id) => id === value);
}

// Only owned conversational phrasing varies. Evidence, fallbacks, story frames,
// and calculation renderings keep their original wording and verification rules.
export const personalityPhrasing = {
  default: {
    greeting: "Hello. ",
    capabilities: "I can",
    acknowledge:
      "You’re welcome. We can continue with a follow-up or explore a new question.",
    help: "",
    compare: "Here is the available evidence side by side.",
    summarize: "Selected points from your notes, in their original wording:",
    support: "For this synthetic support scenario:",
    source: "Your notes state:",
    sources: "These passages address the question:",
    excerpts: "Exact excerpts from your notes:",
  },
  friendly: {
    greeting: "Hi! Good to have you here. ",
    capabilities: "Here’s what we can explore together: I can",
    acknowledge:
      "You’re welcome! Happy to keep exploring with you. Ask a follow-up whenever you’re ready.",
    help: "Happy to walk you through it.",
    compare: "Let’s look at the available evidence together, side by side.",
    summarize:
      "Here are selected points from your notes, keeping your original wording:",
    support: "Let’s work through this synthetic support scenario together:",
    source: "Here’s what your notes say:",
    sources:
      "Here are the passages from your notes that address your question:",
    excerpts:
      "Here are exact excerpts from your notes to look through together:",
  },
  playful: {
    greeting: "Hey there! Ready to follow a trail of ideas? ",
    capabilities: "Pick a trail: I can",
    acknowledge: "You’re welcome! Where shall our curiosity take us next?",
    help: "Let’s peek under the hood.",
    compare: "Time for a side-by-side look at the evidence.",
    summarize: "A little tour of your notes, with the original wording intact:",
    support: "Let’s unpack this synthetic support scenario:",
    source: "A clue from your notes, in its own words:",
    sources: "A few clues from your notes to explore:",
    excerpts: "A closer look at the clues — exact excerpts from your notes:",
  },
  professional: {
    greeting: "Hello. Let’s review your request. ",
    capabilities: "Available assistance: I can",
    acknowledge:
      "You’re welcome. Please provide a follow-up question or the next topic.",
    help: "Here is the documented explanation.",
    compare: "The available evidence is presented side by side below.",
    summarize: "Selected source statements, reproduced verbatim:",
    support: "Assessment of the synthetic support scenario:",
    source: "The supplied source states:",
    sources: "The following supplied passages address the question:",
    excerpts: "Verbatim excerpts from the supplied notes:",
  },
} satisfies Record<Personality, Record<string, string>>;
