import type { Plan } from "./types";

export const STATE_CAPITALS_REFERENCE =
  "https://www.50states.com/tools/thelist.htm";

// State/capital facts checked against the reference above on 2026-09-18.
// Postal abbreviations are aliases; territories and the federal district are not states.
const states = [
  ["AL", "Alabama", "Montgomery"],
  ["AK", "Alaska", "Juneau"],
  ["AZ", "Arizona", "Phoenix"],
  ["AR", "Arkansas", "Little Rock"],
  ["CA", "California", "Sacramento"],
  ["CO", "Colorado", "Denver"],
  ["CT", "Connecticut", "Hartford"],
  ["DE", "Delaware", "Dover"],
  ["FL", "Florida", "Tallahassee"],
  ["GA", "Georgia", "Atlanta"],
  ["HI", "Hawaii", "Honolulu"],
  ["ID", "Idaho", "Boise"],
  ["IL", "Illinois", "Springfield"],
  ["IN", "Indiana", "Indianapolis"],
  ["IA", "Iowa", "Des Moines"],
  ["KS", "Kansas", "Topeka"],
  ["KY", "Kentucky", "Frankfort"],
  ["LA", "Louisiana", "Baton Rouge"],
  ["ME", "Maine", "Augusta"],
  ["MD", "Maryland", "Annapolis"],
  ["MA", "Massachusetts", "Boston"],
  ["MI", "Michigan", "Lansing"],
  ["MN", "Minnesota", "Saint Paul"],
  ["MS", "Mississippi", "Jackson"],
  ["MO", "Missouri", "Jefferson City"],
  ["MT", "Montana", "Helena"],
  ["NE", "Nebraska", "Lincoln"],
  ["NV", "Nevada", "Carson City"],
  ["NH", "New Hampshire", "Concord"],
  ["NJ", "New Jersey", "Trenton"],
  ["NM", "New Mexico", "Santa Fe"],
  ["NY", "New York", "Albany"],
  ["NC", "North Carolina", "Raleigh"],
  ["ND", "North Dakota", "Bismarck"],
  ["OH", "Ohio", "Columbus"],
  ["OK", "Oklahoma", "Oklahoma City"],
  ["OR", "Oregon", "Salem"],
  ["PA", "Pennsylvania", "Harrisburg"],
  ["RI", "Rhode Island", "Providence"],
  ["SC", "South Carolina", "Columbia"],
  ["SD", "South Dakota", "Pierre"],
  ["TN", "Tennessee", "Nashville"],
  ["TX", "Texas", "Austin"],
  ["UT", "Utah", "Salt Lake City"],
  ["VT", "Vermont", "Montpelier"],
  ["VA", "Virginia", "Richmond"],
  ["WA", "Washington", "Olympia"],
  ["WV", "West Virginia", "Charleston"],
  ["WI", "Wisconsin", "Madison"],
  ["WY", "Wyoming", "Cheyenne"],
] as const;
type State = (typeof states)[number];
const stateNamed = (name: string) => {
  const key = name.replace(/^(?:the )?state of /, "");
  return states.find(
    ([code, state]) =>
      code.toLowerCase() === key || state.toLowerCase() === key,
  );
};
const cityKey = (name: string) =>
  name.toLowerCase().replace(/^st\.? /, "saint ");
const answer = ([, state, capital]: State) =>
  `The capital of ${state} is ${capital}.`;
function plan(text: string[], all = false): Plan {
  return {
    id: all ? "knowledge_state_capitals_all" : "knowledge_state_capital",
    intent: "answer",
    title: "U.S. state capitals",
    status: "answered",
    sections: text.map((text) => ({ text, provenance: "authored" })),
    sources: [],
    options: all ? [] : ["List all 50 state capitals"],
  };
}

/** Match complete capital questions without discarding qualifications or extra tasks. */
export function stateCapitalPlan(question: string): Plan | null {
  const text = question
    .trim()
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "");
  if (
    /^(?:(?:list|name|show(?: me)?|tell me|what are) (?:the )?)?(?:all )?(?:50 )?(?:(?:us|u\.s\.|united states|american) )?states? (?:and (?:their )?)?capitals$/.test(
      text,
    ) ||
    /^(?:(?:list|name|show(?: me)?|tell me|what are) (?:the )?)?capitals of (?:all(?: 50)?|the 50) (?:(?:us|u\.s\.|united states|american) )?states$/.test(
      text,
    )
  )
    return plan(
      [
        "Here are all 50 U.S. states and their capitals:",
        states.map(([, state, capital]) => `${state} — ${capital}`).join("\n"),
      ],
      true,
    );

  const forward =
    /^(?:(?:what is|what's|whats|where is|tell me|name|show me) (?:the )?)?(?:state )?capitals?(?: city)? (?:of|for) (.+)$/.exec(
      text,
    ) ??
    /^(?:(?:what is|what's|whats|tell me|name) )?(.+?)(?:'s|')? (?:state )?capital(?: city)?$/.exec(
      text,
    ) ??
    /^what are the capitals of (.+)$/.exec(text);
  if (forward) {
    const names = forward[1].split(/,\s*(?:and\s+)?|\s+(?:and|&)\s+/);
    const selected = names.map((name) => stateNamed(name.trim()));
    // Never return a partial answer if one of the requested states is unknown.
    if (selected.every((state): state is State => !!state))
      return plan([[...new Set(selected)].map(answer).join("\n")]);
  }
  const reverse =
    /^(?:what|which) (?:us )?state is (.+) the capital of$/.exec(text) ??
    /^(?:what|which) (?:us )?state has (.+) as (?:its|the) capital$/.exec(
      text,
    ) ??
    /^(.+) is the capital of (?:what|which) (?:us )?state$/.exec(text);
  if (reverse) {
    const state = states.find(
      ([, , capital]) => cityKey(capital) === cityKey(reverse[1]),
    );
    return state ? plan([`${state[2]} is the capital of ${state[1]}.`]) : null;
  }
  const confirmation =
    /^is (?:the city of )?([a-z .'-]+?) (?:still |currently )?the capital(?: city)? of (.+)$/.exec(
      text,
    );
  if (confirmation) {
    const state = stateNamed(confirmation[2]);
    const city = cityKey(confirmation[1]);
    // Unknown phrases may contain negation or compound requests, not city names.
    const knownCity =
      states.some(([, , capital]) => cityKey(capital) === city) ||
      ["houston", "dallas"].includes(city);
    if (state && knownCity)
      return plan([
        `${city === cityKey(state[2]) ? "Yes" : "No"}. ${answer(state)}`,
      ]);
  }
  return null;
}
