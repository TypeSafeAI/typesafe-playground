import type { RunPayload } from "./api";
import { estimateIq } from "./iq-estimate";

export const IQ_TEST_VERSION = "reasoning-v1";
export const IQ_CATEGORIES = ["Numerical", "Logical", "Patterns"] as const;
export type IqMode = "demo" | "live";
export type IqOption = "a" | "b" | "c" | "d";
export interface IqQuestion {
  id: string;
  category: (typeof IQ_CATEGORIES)[number];
  title: string;
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
    title: "A new operator",
    prompt: "For the operation A △ B = 2A + B, what is (3 △ 4) △ 5?",
    assumption:
      "Evaluate the parentheses first, and apply the given definition each time. △ is a defined operation, not multiplication.",
    options: { a: "21", b: "25", c: "29", d: "35" },
    expected: "b",
    explanation:
      "First, 3 △ 4 = 2 × 3 + 4 = 10. Then 10 △ 5 = 2 × 10 + 5 = 25.",
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
