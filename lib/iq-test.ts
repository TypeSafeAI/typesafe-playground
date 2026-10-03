import type { RunPayload } from "./api";
import { estimateIq } from "./iq-estimate";

export const IQ_TEST_VERSION = "reasoning-v2";
export const IQ_CATEGORIES = ["Numerical", "Logical", "Patterns"] as const;
export type IqMode = "demo" | "live";
export type IqOption = "a" | "b" | "c" | "d";
export interface IqQuestion {
  id: string;
  category: (typeof IQ_CATEGORIES)[number];
  title: string;
  difficulty: "Warm-up" | "Intermediate" | "Challenge";
  prompt: string;
  assumption: string;
  options: Record<IqOption, string>;
  expected: IqOption;
  explanation: string;
}

/** Original teaching puzzles. Version changes when the questions or key change. */
export const IQ_QUESTIONS: readonly IqQuestion[] = [
  {
    id: "growing-gaps",
    category: "Numerical",
    difficulty: "Warm-up",
    title: "Growing gaps",
    prompt: "What comes next? 6, 11, 18, 27, ?",
    assumption: "Each successive gap is 2 larger than the previous gap.",
    options: { a: "36", b: "38", c: "40", d: "42" },
    expected: "b",
    explanation: "The gaps are 5, 7, 9, then 11. Adding 11 to 27 gives 38.",
  },
  {
    id: "repeated-rule",
    category: "Numerical",
    difficulty: "Warm-up",
    title: "One repeated rule",
    prompt: "What comes next? 4, 7, 13, 25, ?",
    assumption:
      "Use the same rule at every step: multiply by 2, then subtract 1.",
    options: { a: "47", b: "48", c: "50", d: "49" },
    expected: "d",
    explanation:
      "Every term is twice the previous term minus 1. The next is 25 × 2 − 1 = 49.",
  },
  {
    id: "interleaved",
    category: "Numerical",
    difficulty: "Intermediate",
    title: "Two tracks",
    prompt: "What comes next? 2, 20, 5, 18, 8, 16, ?",
    assumption:
      "Odd and even positions form separate arithmetic sequences, each with its own constant step.",
    options: { a: "11", b: "14", c: "10", d: "12" },
    expected: "a",
    explanation:
      "Odd positions are 2, 5, 8, 11; even positions are 20, 18, 16. The missing term is at an odd position.",
  },
  {
    id: "ribbon-rate",
    category: "Numerical",
    difficulty: "Intermediate",
    title: "Ribbon machines",
    prompt:
      "Four machines together produce 6 metres of ribbon in 3 minutes. How many metres do 10 machines produce in 5 minutes?",
    assumption:
      "Every machine produces ribbon continuously at the same constant rate. They work independently with no setup time or interruptions. Partial metres count.",
    options: { a: "20", b: "30", c: "25", d: "50" },
    expected: "c",
    explanation:
      "The rate is 6 ÷ (4 × 3) = 0.5 metres per machine-minute. Ten machines working for 5 minutes produce 25 metres in total.",
  },
  {
    id: "wugs",
    category: "Logical",
    difficulty: "Warm-up",
    title: "Invented classes",
    prompt:
      "All wugs are daxes. No daxes are mips. Which statement must be true?",
    assumption:
      "Wug, dax and mip are arbitrary classes. Use only the two premises; the classes may be empty.",
    options: {
      a: "All mips are wugs.",
      b: "Some wugs are mips.",
      c: "No wugs are mips.",
      d: "Some daxes are not wugs.",
    },
    expected: "c",
    explanation:
      "Every wug is inside the dax class, which has no overlap with mips. Therefore no wug is a mip, even if there are no wugs.",
  },
  {
    id: "box-labels",
    category: "Logical",
    difficulty: "Warm-up",
    title: "One true label",
    prompt:
      'A coin is in one of three boxes. Gold says: "The coin is in Silver." Silver says: "The coin is not in Silver." Wood says: "The coin is not in Gold." Exactly one label is true. Where is the coin?',
    assumption:
      "Exactly one box contains the coin. All three labels refer to this same placement.",
    options: {
      a: "Gold box",
      b: "Silver box",
      c: "Wood box",
      d: "No placement satisfies the rules",
    },
    expected: "a",
    explanation:
      "In Gold, the labels are false, true, false: exactly one true. In Silver they are true, false, true; in Wood they are false, true, true. Only Gold works.",
  },
  {
    id: "insufficient-overlap",
    category: "Logical",
    difficulty: "Intermediate",
    title: "An unproven overlap",
    prompt:
      "Every glass token is round. Some round tokens are blue. Are any glass tokens blue?",
    assumption:
      "Use only these premises. Do not assume that the round blue tokens are glass.",
    options: {
      a: "Yes, all glass tokens are blue",
      b: "Yes, at least one glass token is blue",
      c: "No glass tokens are blue",
      d: "Cannot be determined",
    },
    expected: "d",
    explanation:
      "The round blue tokens might all be nonglass, or some might be glass. Both arrangements satisfy the premises, so the overlap cannot be determined.",
  },
  {
    id: "beacon",
    category: "Logical",
    difficulty: "Intermediate",
    title: "The relay",
    prompt:
      "If the beacon is on, the relay is closed. The relay is open. What follows?",
    assumption:
      "The rule has no exceptions. The relay is either open or closed, never both; the beacon is either on or off.",
    options: {
      a: "The beacon is on.",
      b: "The beacon is off.",
      c: "The relay is closed.",
      d: "The beacon state cannot be determined.",
    },
    expected: "b",
    explanation:
      "An on beacon requires a closed relay. The open relay rules out an on beacon, so the beacon is off.",
  },
  {
    id: "bit-pattern",
    category: "Patterns",
    difficulty: "Warm-up",
    title: "Different bits",
    prompt:
      "Complete the last row:\n1010 | 1100 | 0110\n0011 | 1010 | 1001\n1110 | 0101 | ????",
    assumption:
      "In each row, the third string has a 1 exactly where the first two strings differ, and a 0 where they match.",
    options: { a: "1011", b: "1111", c: "0100", d: "1001" },
    expected: "a",
    explanation:
      "Compare 1110 with 0101 position by position: different, same, different, different. This gives 1011.",
  },
  {
    id: "row-rule",
    category: "Patterns",
    difficulty: "Warm-up",
    title: "Row arithmetic",
    prompt: "Complete the last row:\n3 | 4 | 10\n5 | 2 | 12\n6 | 5 | ?",
    assumption:
      "In every row, the third number is twice the first number plus the second number.",
    options: { a: "16", b: "22", c: "17", d: "30" },
    expected: "c",
    explanation:
      "The row rule gives 2 × 6 + 5 = 17. It also gives 10 and 12 for the first two rows.",
  },
  {
    id: "rotation",
    category: "Patterns",
    difficulty: "Intermediate",
    title: "Quarter turn",
    prompt:
      "Rotate this grid 90 degrees clockwise:\n1 2\n3 4\nWhich grid results? Options separate the top and bottom rows with /.",
    assumption:
      "Move the positions as a rigid square; do not change the digits or reflect the grid.",
    options: { a: "2 4 / 1 3", b: "4 3 / 2 1", c: "2 1 / 4 3", d: "3 1 / 4 2" },
    expected: "d",
    explanation:
      "The bottom-left 3 moves to top-left, the top-left 1 to top-right, the top-right 2 to bottom-right, and the bottom-right 4 to bottom-left.",
  },
  {
    id: "symbol-rule",
    category: "Patterns",
    difficulty: "Intermediate",
    title: "A new operator",
    prompt: "For the operation A △ B = 2A + B, what is (3 △ 4) △ 5?",
    assumption:
      "Evaluate the parentheses first, and apply the given definition each time. △ is a defined operation, not multiplication.",
    options: { a: "21", b: "25", c: "29", d: "35" },
    expected: "b",
    explanation:
      "First, 3 △ 4 = 2 × 3 + 4 = 10. Then 10 △ 5 = 2 × 10 + 5 = 25.",
  },
  {
    id: "successive-percentages",
    category: "Numerical",
    difficulty: "Intermediate",
    title: "Two percentage changes",
    prompt:
      "A quantity starts at 160. It increases by 15%, then the new quantity decreases by 15%. What is the final quantity?",
    assumption:
      "Each percentage uses the quantity immediately before that change. Use exact arithmetic, with no rounding between steps.",
    options: {
      a: "160",
      b: "156.4",
      c: "157.6",
      d: "184",
    },
    expected: "b",
    explanation:
      "The factors multiply: 160 × 1.15 × 0.85 = 156.4. Equal percentage increases and decreases do not cancel because their bases differ.",
  },
  {
    id: "unequal-journey",
    category: "Numerical",
    difficulty: "Intermediate",
    title: "Average journey speed",
    prompt:
      "A traveller covers 12 km at 4 km/h, then 12 km at 6 km/h. What is the average speed for the whole journey?",
    assumption:
      "Average speed is total distance divided by total elapsed travel time. There are no stops.",
    options: {
      a: "5 km/h",
      b: "4.5 km/h",
      c: "5.2 km/h",
      d: "4.8 km/h",
    },
    expected: "d",
    explanation:
      "The two legs take 12/4 = 3 hours and 12/6 = 2 hours. The average is 24/5 = 4.8 km/h, not the arithmetic mean of the speeds.",
  },
  {
    id: "replacement-bag",
    category: "Numerical",
    difficulty: "Challenge",
    title: "A changing bag",
    prompt:
      "A bag has 3 red and 2 blue counters. Draw one counter uniformly, remove it permanently, and put one blue counter into the bag. Then draw uniformly again. What is the probability that the second counter is red?",
    assumption:
      "Counters of the same colour are interchangeable. Each draw chooses uniformly among the five counters then present. The inserted counter is always blue.",
    options: {
      a: "12/25",
      b: "9/25",
      c: "3/5",
      d: "3/10",
    },
    expected: "a",
    explanation:
      "After a red first draw (3/5), 2 of 5 are red. After a blue first draw (2/5), 3 of 5 are red. Total: (3/5)(2/5) + (2/5)(3/5) = 12/25.",
  },
  {
    id: "remainders",
    category: "Numerical",
    difficulty: "Challenge",
    title: "Two remainders",
    prompt:
      "What is the smallest positive whole number that leaves remainder 2 when divided by 5 and remainder 4 when divided by 7?",
    assumption:
      "Use ordinary nonnegative division remainders. The number must satisfy both conditions simultaneously.",
    options: {
      a: "12",
      b: "22",
      c: "32",
      d: "39",
    },
    expected: "c",
    explanation:
      "Numbers that leave remainder 2 modulo 5 begin 2, 7, 12, 17, 22, 27, 32. Their remainders modulo 7 are 2, 0, 5, 3, 1, 6, 4. The first match is 32.",
  },
  {
    id: "audit-logic",
    category: "Logical",
    difficulty: "Intermediate",
    title: "What must follow?",
    prompt:
      "Every approved file is signed or audited, or both. No archived file is audited. File K is approved and archived. What must be true?",
    assumption:
      "Use only these premises. 'Or' is inclusive. File K exists; being signed does not itself imply being audited.",
    options: {
      a: "K is audited but not signed.",
      b: "K is both signed and audited.",
      c: "K is signed and not audited.",
      d: "K is neither signed nor audited.",
    },
    expected: "c",
    explanation:
      "Archived rules out audited. Approval still requires signed or audited, so K must be signed. It therefore is signed and not audited.",
  },
  {
    id: "reversed-implication",
    category: "Logical",
    difficulty: "Intermediate",
    title: "A rule in reverse",
    prompt:
      "If a panel is cracked, its indicator is red. If its indicator is red, the panel is inspected. This panel was inspected. Must its indicator have been red?",
    assumption:
      "The implications are one-way and have no exceptions. Panels may also be inspected for other reasons.",
    options: {
      a: "No; a red indicator is possible but not required.",
      b: "Yes; every inspected panel has a red indicator.",
      c: "No; its indicator must not have been red.",
      d: "Yes; the panel must also have been cracked.",
    },
    expected: "a",
    explanation:
      "Inspection is a consequence of a red indicator, not a sufficient condition for one. Both red-and-inspected and not-red-but-inspected satisfy the premises.",
  },
  {
    id: "two-active-switches",
    category: "Logical",
    difficulty: "Challenge",
    title: "Two active switches",
    prompt:
      "Exactly two of switches A, B, C and D are on. If A is on, B is on. If B is on, C is off. If C is on, D is on. If D is on, B is off. Which statement must be true?",
    assumption:
      "Every switch is either on or off. All four implications hold simultaneously; they are one-way rules.",
    options: {
      a: "A is on.",
      b: "C is off.",
      c: "A and D are both on.",
      d: "Exactly one of B and D is on.",
    },
    expected: "d",
    explanation:
      "The only allowed on-pairs are A with B, or C with D. A with C or D would also force B; B with C violates the second rule; B with D violates the fourth. Both allowed pairs have exactly one of B and D on.",
  },
  {
    id: "constrained-order",
    category: "Logical",
    difficulty: "Challenge",
    title: "Four places",
    prompt:
      "Four different tiles A, B, C and D fill positions 1 to 4 from left to right. A is left of B. C is immediately right of D. B is not at either end. Which order is possible?",
    assumption:
      "Use each tile exactly once. 'Left of' does not require adjacency; 'immediately right' does.",
    options: {
      a: "D C A B",
      b: "A B D C",
      c: "A D C B",
      d: "B A D C",
    },
    expected: "b",
    explanation:
      "A B D C has A left of B, D immediately before C, and B in position 2. The first and third put B at the right end; the fourth puts B before A and at the left end.",
  },
  {
    id: "rotate-reflect",
    category: "Patterns",
    difficulty: "Intermediate",
    title: "Turn, then reflect",
    prompt:
      "Start with this grid:\n1 2 3\n4 5 6\n7 8 9\nRotate it 90 degrees clockwise, then reflect the result left-to-right. Which grid results? Options separate rows with /.",
    assumption:
      "Apply the two transformations in the stated order. Left-to-right reflection reverses the entries in each row of the current grid.",
    options: {
      a: "7 4 1 / 8 5 2 / 9 6 3",
      b: "9 6 3 / 8 5 2 / 7 4 1",
      c: "3 6 9 / 2 5 8 / 1 4 7",
      d: "1 4 7 / 2 5 8 / 3 6 9",
    },
    expected: "d",
    explanation:
      "Clockwise rotation gives 7 4 1 / 8 5 2 / 9 6 3. Reversing each row gives 1 4 7 / 2 5 8 / 3 6 9. Reversing the order of the operations gives a different grid.",
  },
  {
    id: "alternating-updates",
    category: "Patterns",
    difficulty: "Intermediate",
    title: "Alternating operations",
    prompt: "What comes next? 3, 8, 4, 9, 4.5, 9.5, ?",
    assumption:
      "Apply +5, then divide by 2, and repeat those two operations alternately. Fractions are retained exactly.",
    options: {
      a: "4.75",
      b: "4.5",
      c: "5",
      d: "14.5",
    },
    expected: "a",
    explanation:
      "The last step shown adds 5 to 4.5. The next step divides 9.5 by 2, giving 4.75.",
  },
  {
    id: "xor-rotate",
    category: "Patterns",
    difficulty: "Challenge",
    title: "Combine, then shift",
    prompt:
      "Take the four-bit strings 1011 and 0110. First mark 1 where their bits differ and 0 where they match. Then rotate that result one place to the left. What is the final string?",
    assumption:
      "A left rotation moves the first bit to the end and preserves all four positions, including leading zeros. It is not a shift that discards a bit.",
    options: {
      a: "1101",
      b: "1011",
      c: "1010",
      d: "1110",
    },
    expected: "b",
    explanation:
      "The strings differ in positions 1, 2 and 4, producing 1101. Moving its first bit to the end produces 1011. 1101 stops too soon; 1010 incorrectly discards the rotated bit.",
  },
  {
    id: "nested-operator",
    category: "Patterns",
    difficulty: "Challenge",
    title: "An ordered operator",
    prompt: "Define A ◇ B = 3A − 2B. What is (5 ◇ 2) ◇ (2 ◇ 5)?",
    assumption:
      "Evaluate each parenthesized expression first. The operator is ordered: swapping its inputs may change the result. Negative numbers are allowed.",
    options: {
      a: "25",
      b: "29",
      c: "41",
      d: "49",
    },
    expected: "c",
    explanation:
      "5 ◇ 2 = 15 − 4 = 11, while 2 ◇ 5 = 6 − 10 = −4. Then 11 ◇ (−4) = 33 + 8 = 41; subtracting a negative adds.",
  },
];

export type IqStatus =
  "correct" | "incorrect" | "invalid" | "failed" | "cancelled";
export interface IqResult {
  id: string;
  status: IqStatus;
  choice: IqOption | null;
  confidence: number | null;
  probabilities: Record<IqOption, number> | null;
  latencyMs?: number | null;
  error?: string;
}

export function buildIqPayload(question: IqQuestion) {
  return {
    model: "jev-latest",
    // Deliberate allowlist: never spread the question with its reference key.
    state: { prompt: question.prompt, assumption: question.assumption },
    questions: {
      answer: {
        type: "choice" as const,
        instructions:
          "Solve the reasoning question under its stated assumption. Select exactly one of the offered answers.",
        criteria: { ...question.options },
      },
    },
  } satisfies RunPayload;
}

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const unit = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

export function unscoredIqResult(
  id: string,
  status: "failed" | "invalid" | "cancelled",
  error: string,
): IqResult {
  return {
    id,
    status,
    choice: null,
    confidence: null,
    probabilities: null,
    error,
  };
}

export function resolveIqAnswer(
  question: IqQuestion,
  response: unknown,
): IqResult {
  const answers =
    object(response) && object(response.answers) ? response.answers : null;
  const answer = answers && object(answers.answer) ? answers.answer : null;
  const probabilities =
    answer && object(answer.probabilities) ? answer.probabilities : null;
  const choices = Object.keys(question.options);
  if (
    !answer ||
    answer.type !== "choice" ||
    typeof answer.choice !== "string" ||
    !Object.hasOwn(question.options, answer.choice) ||
    !unit(answer.confidence) ||
    !probabilities ||
    Object.keys(probabilities).length !== choices.length ||
    !choices.every(
      (choice) =>
        Object.hasOwn(probabilities, choice) && unit(probabilities[choice]),
    ) ||
    Math.abs(
      Object.values(probabilities).reduce<number>(
        (sum, p) => sum + (p as number),
        0,
      ) - 1,
    ) > 0.02
  ) {
    return unscoredIqResult(
      question.id,
      "invalid",
      "Incomplete or invalid choice response. This question is unscored; start a new run to try again.",
    );
  }
  return {
    id: question.id,
    status: answer.choice === question.expected ? "correct" : "incorrect",
    choice: answer.choice as IqOption,
    confidence: answer.confidence,
    probabilities: Object.fromEntries(
      choices.map((choice) => [choice, probabilities[choice]]),
    ) as Record<IqOption, number>,
  };
}

export function summarizeIq(results: readonly IqResult[]) {
  const ids = new Set<string>();
  const categories = IQ_CATEGORIES.map((category) => ({
    category,
    total: IQ_QUESTIONS.filter((q) => q.category === category).length,
    answered: 0,
    correct: 0,
  }));
  let correct = 0,
    answered = 0;
  for (const result of results) {
    if (ids.has(result.id)) throw Error("Duplicate question result.");
    ids.add(result.id);
    const question = IQ_QUESTIONS.find((q) => q.id === result.id);
    if (!question) throw Error("Unknown question result.");
    if (
      (result.status === "correct" || result.status === "incorrect") &&
      result.choice &&
      Object.hasOwn(question.options, result.choice)
    ) {
      answered++;
      const category = categories.find(
        (c) => c.category === question.category,
      )!;
      category.answered++;
      if (result.choice === question.expected) {
        correct++;
        category.correct++;
      }
    }
  }
  const complete = answered === IQ_QUESTIONS.length;
  return {
    correct,
    incorrect: answered - correct,
    unscored: IQ_QUESTIONS.length - answered,
    answered,
    total: IQ_QUESTIONS.length,
    complete,
    percentage: complete ? (correct / IQ_QUESTIONS.length) * 100 : null,
    iqEstimate: complete ? estimateIq(correct, IQ_QUESTIONS.length) : null,
    categories: categories.map((category) => ({
      ...category,
      incorrect: category.answered - category.correct,
      unscored: category.total - category.answered,
      percentage:
        category.answered === category.total
          ? (category.correct / category.total) * 100
          : null,
    })),
  };
}
