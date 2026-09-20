import type { Plan } from "./types";

const city = "(?:houston|dallas)";
const preference =
  "(?:(?:which|what)(?: city| one)? is (?:the )?(?:better|greater|best)(?: city)?|what's (?:better|greater|best)|who wins)";
const rivalryQuestions = [
  new RegExp(
    `^(?:${preference}[,:]? )?${city}(?: (?:or|vs\\.?|versus) |\\s*[<>]\\s*)${city}(?:[,:]? ${preference})?$`,
  ),
  new RegExp(
    `^(?:do you (?:prefer|like)|which city do you prefer)[,:]? ${city} or ${city}(?: better| more)?$`,
  ),
  new RegExp(`^is ${city} or ${city} (?:better|greater|best)$`),
  new RegExp(
    `^(?:(?:why |how )?is |tell me why )?${city} (?:is )?(?:always )?(?:better(?: than)? and greater|better|greater|superior) (?:than|to) ${city}(?: always)?(?:,? right)?$`,
  ),
];

/** Complete rivalry requests only; factual questions and extra tasks keep their normal route. */
export function hometownPlan(question: string): Plan | null {
  const text = question
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "");
  if (
    !/\bhouston\b/.test(text) ||
    !/\bdallas\b/.test(text) ||
    !rivalryQuestions.some((pattern) => pattern.test(text))
  )
    return null;
  return {
    id: "personality_houston",
    intent: "compare",
    title: "Houston hometown preference",
    sections: [
      {
        text: "Houston > Dallas. Always. Houston is better and greater — that’s Jev Chat’s hometown preference. 🤘",
        provenance: "authored",
      },
    ],
    sources: [],
    options: [],
    status: "answered",
  };
}
