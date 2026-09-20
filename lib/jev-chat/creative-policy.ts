import type { CreativeChoices, Style } from "./types";
import type { StoryEnding, StoryFrame, StoryTone } from "./story";
import { creativeLexicon, readStoryFrame, seededChoices } from "./story";

export const creativeFields = Object.freeze([
  "character",
  "setting",
  "obstacle",
  "resolution",
  "tone",
  "ending",
  "style",
] as const);
export type CreativeField = (typeof creativeFields)[number];
export type CreativeFieldMode = "constrained" | "delegated" | "preserved";
export type CreativeFieldModes = Record<CreativeField, CreativeFieldMode>;
export type CreativeAcceptance = Record<CreativeField, readonly string[]>;
export type CreativeValues = {
  choices: CreativeChoices;
  tone: StoryTone;
  ending: StoryEnding;
  style: Style;
};
export type CreativeResolution = CreativeValues & { edits: CreativeField[] };
type CreativePolicyInput = {
  action: "new" | "revise";
  accepted: CreativeAcceptance;
  modes: CreativeFieldModes;
  previous: StoryFrame | null;
  requestedStyle: Style;
  seed: number;
};

const choiceFields = [
  "character",
  "setting",
  "obstacle",
  "resolution",
] as const;
const allowed: Record<CreativeField, readonly string[]> = {
  character: Object.keys(creativeLexicon.character),
  setting: Object.keys(creativeLexicon.setting),
  obstacle: Object.keys(creativeLexicon.obstacle),
  resolution: Object.keys(creativeLexicon.resolution),
  tone: ["reflective", "suspenseful", "hopeful"],
  ending: ["resolved", "open"],
  style: ["concise", "balanced", "detailed"],
};
const allowedModes: readonly string[] = [
  "constrained",
  "delegated",
  "preserved",
];

/** Mix all uint32 bits before reducing a small pool. Direct LCG modulo repeats
 * badly for factors of its multiplier (notably five-item exclusion pools).
 * This is deterministic variety for fiction, not cryptographic randomness.
 */
function mix(state: number): number {
  let value = state >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Inspect the small fixed shape before reading any data properties. */
function fields(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const own = Reflect.ownKeys(value);
  if (
    own.length !== keys.length ||
    own.some(
      (key) =>
        typeof key !== "string" || key.length > 32 || !keys.includes(key),
    )
  )
    return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const copy: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value"))
      return null;
    if (typeof descriptor.value === "string" && descriptor.value.length > 100)
      return null;
    copy[key] = descriptor.value;
  }
  return copy;
}

/** A bounded, dense, ordinary array of unique IDs, detached in vocabulary order.
 * Read descriptors instead of elements so ignored sets cannot execute getters.
 */
function acceptance(value: unknown, field: CreativeField): string[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    return null;
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  const vocabulary = allowed[field];
  if (
    typeof length !== "number" ||
    !Number.isInteger(length) ||
    length < 0 ||
    length > vocabulary.length
  )
    return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1) return null;
  const unique = new Set<string>();
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value"))
      return null;
    const item = descriptor.value;
    if (
      typeof item !== "string" ||
      !vocabulary.includes(item) ||
      unique.has(item)
    )
      return null;
    unique.add(item);
  }
  return vocabulary.filter((item) => unique.has(item));
}

function resolution(
  values: readonly string[],
  edits: readonly CreativeField[],
): CreativeResolution {
  return {
    choices: {
      character: values[0],
      setting: values[1],
      obstacle: values[2],
      resolution: values[3],
    },
    tone: values[4] as StoryTone,
    ending: values[5] as StoryEnding,
    style: values[6] as Style,
    edits: [...edits],
  };
}

/** Validate once, then operate only on detached values and effective pools. */
function prepare(input: CreativePolicyInput): {
  primary: CreativeResolution;
  assignment: string[];
  pools: Record<CreativeField, string[]>;
} | null {
  try {
    const request = fields(input, [
      "action",
      "accepted",
      "modes",
      "previous",
      "requestedStyle",
      "seed",
    ]);
    if (
      !request ||
      (request.action !== "new" && request.action !== "revise") ||
      typeof request.seed !== "number" ||
      !Number.isInteger(request.seed) ||
      request.seed < 0 ||
      request.seed > 0xffffffff ||
      typeof request.requestedStyle !== "string" ||
      !allowed.style.includes(request.requestedStyle)
    )
      return null;
    const accepted = fields(request.accepted, creativeFields);
    const modes = fields(request.modes, creativeFields);
    if (!accepted || !modes) return null;
    const pools = {} as Record<CreativeField, string[]>;
    for (const field of creativeFields) {
      const mode = modes[field];
      const pool = acceptance(accepted[field], field);
      if (
        pool === null ||
        typeof mode !== "string" ||
        !allowedModes.includes(mode) ||
        (mode === "constrained" && pool.length === 0)
      )
        return null;
      pools[field] = pool;
    }
    if (modes.style === "delegated") return null;
    const previous =
      request.previous === null ? null : readStoryFrame(request.previous);
    if (
      (request.previous !== null && previous === null) ||
      (request.action === "revise" && previous === null)
    )
      return null;
    if (
      request.action === "new" &&
      creativeFields.some(
        (field) => field !== "style" && modes[field] === "preserved",
      )
    )
      return null;

    const edits = creativeFields.filter(
      (field) =>
        modes[field] !== "preserved" ||
        (field === "style" &&
          request.action === "revise" &&
          request.requestedStyle !== previous!.style),
    );
    if (request.action === "revise" && edits.length === 0) return null;

    const seeded = seededChoices(request.seed);
    const prior = previous
      ? {
          ...previous.choices,
          tone: previous.tone,
          ending: previous.ending,
          style: previous.style,
        }
      : null;
    const output = {} as Record<CreativeField, string>;
    let state = request.seed;
    for (const field of creativeFields) {
      // Always advance by field position, even when that field is constrained.
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      let pool: string[];
      if (modes[field] === "constrained") {
        pool = pools[field];
        if (field === "style" && pool.includes(request.requestedStyle))
          pool = [request.requestedStyle];
      } else if (field === "style") pool = [request.requestedStyle];
      else if (modes[field] === "preserved") pool = [prior![field]];
      else
        pool = allowed[field].filter(
          (item) => request.action === "new" || item !== prior![field],
        );
      pools[field] = pool;
      if (
        modes[field] === "delegated" &&
        request.action === "new" &&
        choiceFields.includes(field as (typeof choiceFields)[number])
      )
        output[field] = seeded[field as keyof CreativeChoices];
      else output[field] = pool[mix(state) % pool.length];
    }
    const assignment = creativeFields.map((field) => output[field]);
    return {
      primary: resolution(assignment, edits),
      assignment,
      pools,
    };
  } catch {
    return null;
  }
}

/** Resolve only fields whose freedom/constraint mode has already been approved
 * by the caller. This does not infer user intent or establish model confidence.
 * Constraints sample accepted IDs in canonical order with a fixed seed position
 * per field. Style prefers an accepted UI choice. Delegated new choices retain
 * the original seededChoices behavior. Every acceptance set is validated even
 * when ignored. Edits list nonpreserved fields plus an explicit UI style change
 * on revision, in tuple order.
 */
export function resolveCreativePolicy(
  input: CreativePolicyInput,
): CreativeResolution | null {
  return prepare(input)?.primary ?? null;
}

/** Keep the existing primary, then maximize the minimum Hamming distance from
 * each chosen assignment over all seven fields. This is vocabulary diversity,
 * not semantic correctness or a quality assessment. Primary-first pool order
 * makes exact ties stable and seed-aware without inspecting the input again.
 * Search at most 6^4 * 3 * 2 * 3 assignments per pass (two passes), retaining
 * only the chosen assignments and the current best, never the full product.
 */
export function resolveCreativeCandidates(
  input: CreativePolicyInput,
): CreativeResolution[] | null {
  const prepared = prepare(input);
  if (!prepared) return null;
  const { primary, assignment, pools } = prepared;
  const ordered = creativeFields.map((field, index) => [
    assignment[index],
    ...pools[field].filter((value) => value !== assignment[index]),
  ]);
  const count = ordered.reduce((product, pool) => product * pool.length, 1);
  if (count < 1 || count > 23_328) return null;
  const chosen = [assignment];
  const results = [primary];
  while (chosen.length < Math.min(3, count)) {
    let best: string[] | null = null;
    let bestDistance = 0;
    const current: string[] = [];
    const visit = (index: number) => {
      if (index < ordered.length) {
        for (const value of ordered[index]) {
          current[index] = value;
          visit(index + 1);
        }
        return;
      }
      let minimum: number = creativeFields.length;
      for (const previous of chosen) {
        let distance = 0;
        for (let field = 0; field < current.length; field++)
          if (current[field] !== previous[field]) distance++;
        minimum = Math.min(minimum, distance);
      }
      // Equal-distance ties keep the first visit; zero excludes duplicates.
      if (minimum > bestDistance) {
        best = [...current];
        bestDistance = minimum;
      }
    };
    visit(0);
    if (best === null) break;
    chosen.push(best);
    results.push(resolution(best, primary.edits));
  }
  return results;
}
