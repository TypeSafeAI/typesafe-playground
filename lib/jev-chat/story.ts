import type { CreativeChoices, Section, Style } from "./types";
import { z } from "zod";

export type StoryTone = "reflective" | "suspenseful" | "hopeful";
export type StoryEnding = "resolved" | "open";
export type StoryFrame = {
  version: "jev-story-v1";
  choices: CreativeChoices;
  theme: string | null;
  tone: StoryTone;
  ending: StoryEnding;
  variant: 0 | 1 | 2;
  style: Style;
};
/** Primary IDs retain compatibility; alternate revisions keep the same wording variant. */
export function storyPlanId(
  variant: StoryFrame["variant"],
  alternative: 0 | 1 | 2 = 0,
): string {
  return `story_${variant}${alternative ? `_alt_${alternative}` : ""}`;
}
export function isStoryPlanId(
  id: string,
  variant: StoryFrame["variant"],
): boolean {
  return ([0, 1, 2] as const).some(
    (alternative) => id === storyPlanId(variant, alternative),
  );
}
export const creativeLexicon = {
  character: {
    keeper: "a lighthouse keeper",
    cartographer: "a cartographer",
    mechanic: "a clockwork mechanic",
    gardener: "a night gardener",
    courier: "a wandering courier",
    archivist: "an archivist",
  },
  setting: {
    coast: "on a coast where the stars reflected before they appeared",
    city: "in a city that changed its streets at dawn",
    station: "at an abandoned station above the clouds",
    island: "on an island drawn on no surviving map",
    library: "in a library that collected unfinished journeys",
    valley: "in a valley where echoes arrived a day late",
  },
  obstacle: {
    silence: "the only warning bell had fallen silent",
    map: "every route home ended at the same locked door",
    light: "the last guiding light was fading",
    message: "a message arrived with tomorrow’s date",
    memory: "everyone remembered a different version of yesterday",
    storm: "a storm was erasing the landmarks",
  },
  resolution: {
    listen: "listening for the small sounds everyone else ignored",
    share: "sharing the missing pieces instead of guarding them",
    build: "building a path from things others had discarded",
    wait: "waiting long enough to notice the pattern",
    return: "returning to the place where the story first changed",
    question: "asking the one question nobody had thought to ask",
  },
} as const;
for (const slot of Object.values(creativeLexicon)) Object.freeze(slot);
Object.freeze(creativeLexicon);

/** Same four-slot LCG and key order as the original scripted story selector. */
export function seededChoices(seed: number): CreativeChoices {
  let state = seed >>> 0;
  const pick = (values: Record<string, string>) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const keys = Object.keys(values);
    return keys[state % keys.length];
  };
  return {
    character: pick(creativeLexicon.character),
    setting: pick(creativeLexicon.setting),
    obstacle: pick(creativeLexicon.obstacle),
    resolution: pick(creativeLexicon.resolution),
  };
}

const frameSchema = z.strictObject({
  version: z.literal("jev-story-v1"),
  choices: z.strictObject({
    character: z.enum(
      Object.keys(creativeLexicon.character) as [string, ...string[]],
    ),
    setting: z.enum(
      Object.keys(creativeLexicon.setting) as [string, ...string[]],
    ),
    obstacle: z.enum(
      Object.keys(creativeLexicon.obstacle) as [string, ...string[]],
    ),
    resolution: z.enum(
      Object.keys(creativeLexicon.resolution) as [string, ...string[]],
    ),
  }),
  theme: z.string().max(100).nullable(),
  tone: z.enum(["reflective", "suspenseful", "hopeful"]),
  ending: z.enum(["resolved", "open"]),
  variant: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  style: z.enum(["concise", "balanced", "detailed"]),
});

function fields(
  value: unknown,
  names: string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== names.length ||
    keys.some(
      (key) =>
        typeof key !== "string" || key.length > 32 || !names.includes(key),
    )
  )
    return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const copy: Record<string, unknown> = {};
  for (const name of names) {
    const descriptor = descriptors[name];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value"))
      return null;
    const item = descriptor.value;
    if (typeof item === "string" && item.length > 100) return null;
    copy[name] = item;
  }
  return copy;
}

/** Strict bounded data import; no coercion, custom serializers, or accessors.
 * Zod sees only detached plain records and primitive field values.
 */
export function readStoryFrame(value: unknown): StoryFrame | null {
  try {
    const outer = fields(value, [
      "version",
      "choices",
      "theme",
      "tone",
      "ending",
      "variant",
      "style",
    ]);
    if (!outer) return null;
    const choices = fields(outer.choices, [
      "character",
      "setting",
      "obstacle",
      "resolution",
    ]);
    if (
      !choices ||
      Object.values(choices).some((item) => typeof item !== "string")
    )
      return null;
    if (
      Object.entries(outer).some(
        ([key, item]) =>
          key !== "choices" &&
          item !== null &&
          !["string", "number"].includes(typeof item),
      )
    )
      return null;
    const parsed = frameSchema.safeParse({ ...outer, choices });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

type Character = keyof typeof creativeLexicon.character;
type Setting = keyof typeof creativeLexicon.setting;
type Obstacle = keyof typeof creativeLexicon.obstacle;
type Resolution = keyof typeof creativeLexicon.resolution;
type Variant = StoryFrame["variant"];
type Recipe = {
  setup: string;
  detail: string;
  approaches: Record<Resolution, string>;
  attempt: string;
  resolved: string;
  open: string;
  tone: Record<StoryTone, string>;
};

const characterDetail: Record<Character, string> = {
  keeper:
    "Years of tending lamps had taught the keeper to check a wick before blaming the dark.",
  cartographer:
    "The cartographer carried a pencil worn almost to the wood, and left room at the edge of every map for corrections.",
  mechanic:
    "The mechanic laid a folded cloth beneath the work, unwilling to lose even a broken part.",
  gardener:
    "The gardener's thumbnail was still edged with soil; delicate things, experience suggested, rarely improved when pulled harder.",
  courier:
    "The courier checked each pocket in turn, as carefully as if the night's trouble were an undelivered letter.",
  archivist:
    "The archivist numbered a fresh sheet of paper and put the observations before the explanation.",
};
const settingDetail: Record<Setting, string> = {
  coast:
    "Below the path, a reflected constellation trembled in the water. The sky above it was still empty.",
  city: "Street names had been chalked on loose boards so that, when the roads moved, somebody could carry the names after them.",
  station:
    "Clouds pressed against the underside of the platform. The departure board still held a row of destinations, but no times.",
  island:
    "An old chart ended where the island began. A thumbprint in the margin was the only mark near its shore.",
  library:
    "A half-packed suitcase stood beneath the shelves. Nobody remembered which unfinished journey had left it there.",
  valley:
    "A voice from yesterday drifted down the slope, answering a question nobody was asking tonight.",
};

function bell(v: Variant): Recipe {
  const obstruction = [
    "a cracked leather strap",
    "a loop of fishing line",
    "a bent length of wire",
  ][v];
  return {
    setup:
      "Two travellers needed the bell's warning before they could cross the dark passage. The rope moved, but the clapper stayed pressed against the rim.",
    detail: `Inside the bronze shell, ${obstruction} had wound around the clapper's hinge. Pulling harder only tightened it.`,
    approaches: {
      listen: `An ear against the bell caught a dry scrape on each pull. Following that small sound, they found ${obstruction} caught behind the hinge.`,
      share: `One traveller held the rope slack while the other described the hinge from below. Putting their two views together exposed ${obstruction} behind the clapper.`,
      build: `A discarded spoon became a narrow hook. Its bent handle reached behind the clapper and snagged ${obstruction}, where fingers would not fit.`,
      wait: `They let the rope hang and watched three slow swings. At the same point in each swing, ${obstruction} tightened behind the clapper.`,
      return: `Retracing their steps to the bell's threshold, they found a matching scrap on the ground. It explained how ${obstruction} had slipped into the hinge.`,
      question: `“Why does the rope come back twisted?” The question sent their eyes behind the clapper, where ${obstruction} had caught around its hinge.`,
    },
    attempt:
      "They supported the clapper with one hand and worked the obstruction toward the hinge's open side, keeping the rope slack.",
    resolved:
      "The obstruction slipped free. The bell rang once, then again at the keeper's count, and the two travellers crossed while its warning carried ahead of them.",
    open: "The obstruction shifted, but would not come free. Beyond the silent bell, the travellers waited; one kept hold of the slack rope while the other shielded the working hand from the cold.",
    tone: {
      reflective:
        "The silence made an old habit visible: everyone had watched the rope, and nobody the small piece of metal that actually made the sound.",
      suspenseful:
        "The travellers stopped at the passage's edge. One pull. Another. No warning reached the darkness ahead.",
      hopeful:
        "The travellers had brought no spare bell, but they could lend two steady hands. For the first time that night, somebody let go of the rope instead of pulling harder.",
    },
  };
}

function door(v: Variant): Recipe {
  const mark = [
    "two crescents worn into the paint",
    "two lines of pale dust",
    "two thumb-shaped dents",
  ][v];
  return {
    setup:
      "Two travellers had tied a thread to the door handle and walked away. Now they stood before it again, the thread leading back through the same streets. A narrow slot was the only opening in the door.",
    detail: `Beneath the slot were ${mark}. A single lifted catch clicked back as soon as a hand moved to the other side.`,
    approaches: {
      listen: `They put an ear to the slot. A scrape on the left was answered by one on the right; ${mark} showed where two catches had to be held together.`,
      share: `The travellers compared sketches made on their separate walks. Each drawing showed only half of ${mark}; together, they located two catches below the slot.`,
      build: `They bent two discarded umbrella ribs into hooks. Through the slot, each hook found a separate catch beside ${mark}.`,
      wait: `They watched a narrow bar of light move across ${mark}. In its shadow, one catch rose and fell while a second stayed locked.`,
      return: `They followed the thread back to the first wrong turn. From that angle, ${mark} lined up beneath the slot, revealing the two catches that had looked like one.`,
      question: `“What if the lock needs two hands in two places?” Examining ${mark}, they found a separate catch at either end of the slot.`,
    },
    attempt:
      "They worked two thin hooks through the slot and counted aloud, ready to lift both catches at once.",
    resolved:
      "Both catches lifted. The door opened onto a road with a broken white milestone; they passed it, kept walking, and reached the familiar gate of home without meeting the door again.",
    open: "The left catch rose. The right one stayed down. Beyond the slot there was only a line of dark road, and the thread still led back to the locked door.",
    tone: {
      reflective:
        "Their maps had recorded every turn accurately. What they had left out was the door itself, treating it as the end of the problem instead of part of it.",
      suspenseful:
        "The thread tightened behind them. Somewhere on the other side, a footstep stopped. The handle did not move.",
      hopeful:
        "The two travellers spread their maps on the same patch of ground. Neither map offered a way home, but there was finally room for both sets of marks.",
    },
  };
}

function lantern(v: Variant): Recipe {
  const blockage = [
    "a bead of hardened wax",
    "a plug of black soot",
    "a crust of dried salt",
  ][v];
  return {
    setup:
      "The lantern still held oil, yet its flame had dwindled to a blue point. Two travellers waited beside the unlit steps; carrying the lantern forward would leave the person behind in darkness.",
    detail: `Under the oil cup, ${blockage} sealed the tiny air vent. With no air entering above it, the oil could not feed the wick.`,
    approaches: {
      listen: `They held the lantern still and heard the wick hiss each time the base was tilted. Turning it over revealed ${blockage} across the air vent.`,
      share: `One traveller described the flame while the other inspected the base. Matching the flicker to a change in angle led them to ${blockage} across the vent.`,
      build: `From a discarded spool they unwound a fine brass pin. It stopped against ${blockage} in a hole beneath the oil cup.`,
      wait: `They counted the breaths between flickers. Each tilt gave one brief flare, enough to trace the interrupted air supply to ${blockage} at the vent.`,
      return: `They carried the lantern back to the ledge where it had first dimmed. A loose cap there fitted beneath the cup, beside the vent sealed by ${blockage}.`,
      question: `“If there is oil, what cannot get in?” They checked the air hole under the cup and found ${blockage} closing it.`,
    },
    attempt:
      "Holding the lantern level, they eased a fine pin into the vent, careful to push the blockage outward rather than into the oil.",
    resolved:
      "The vent opened with a small click. Oil reached the wick and the flame rose yellow and steady, lighting every step until the travellers had both reached the far landing.",
    open: "The pin bent. The vent remained sealed, and the blue point on the wick drew smaller. The travellers stayed together on the first step while another tool was sought.",
    tone: {
      reflective:
        "The full cup had seemed reassuring. It took the shrinking flame to distinguish having enough from being able to use it.",
      suspenseful:
        "Blue light. Black glass. For a moment the wick disappeared entirely, and both travellers stopped breathing.",
      hopeful:
        "One traveller cupped a hand around the glass without touching it. The other set a spare pin on the ledge; the little flame was still there to work beside.",
    },
  };
}

function letter(v: Variant): Recipe {
  const sign = [
    "a triangular ink mark",
    "a green ink blot",
    "a crooked final letter",
  ][v];
  return {
    setup:
      "The letter bore the protagonist's own handwriting: “Keep the brass delivery tube open until dawn.” Two travellers stood beside the delivery ledge. The tube's latch was already closing; each fraction it moved made the ink on the page a little fainter.",
    detail: `The paper carried ${sign}, a small imperfection that seemed too familiar to be a stranger's imitation. A blank sheet waited beside the tube.`,
    approaches: {
      listen: `They listened at the brass tube. It whispered the scratch of a pen a heartbeat before the pen moved; on the blank sheet they began to reproduce ${sign}.`,
      share: `The two travellers compared the letter with a fresh line the protagonist had written. Both noticed ${sign} appearing on the old page as it was made on the new one.`,
      build: `They made a writing rest from the tube's discarded wooden packing. A line written there appeared on the letter in their other hand, including ${sign}.`,
      wait: `They set the letter beside the blank sheet and watched. A mark appeared on the letter just before the pen made it on the fresh paper: ${sign}.`,
      return: `They returned to the delivery ledge where the letter had arrived. On the delivered page, ${sign} darkened a heartbeat before the pen traced it on a fresh sheet.`,
      question: `“What if I have not written it yet?” They copied one line onto the blank sheet. The fading letter darkened along that same line, down to ${sign}.`,
    },
    attempt:
      "The protagonist wrote the warning in full, dated it for tomorrow, and placed a wooden wedge beside the closing latch. The fresh letter was held at the tube's mouth.",
    resolved:
      "The wedge held the latch open through the night. At dawn, the tube drew the fresh letter inward and delivered it into yesterday; the letter already in their hand became dark and complete. They removed the wedge, with the warning's journey accounted for.",
    open: "The wedge slid against the brass. The tube would not take the fresh letter, and another word vanished from the one already delivered. They held both sheets tightly as the latch crept lower.",
    tone: {
      reflective:
        "The handwriting preserved an old hesitation before every capital letter. Whatever tomorrow wanted, it had not taught its author to write differently.",
      suspenseful:
        "A word disappeared. Then the date began to pale. The latch scraped downward, too slowly to hear unless everyone kept quiet.",
      hopeful:
        "The warning was still legible, and there was paper enough to answer it. One traveller held the page flat while the other brought the ink closer.",
    },
  };
}

function memories(v: Variant): Recipe {
  const event = [
    "a red kite crossing the square",
    "a bowl breaking on a doorstep",
    "a white cart arriving at noon",
  ][v];
  return {
    setup: `Two travellers disagreed about ${event}; the protagonist remembered a third account. Beneath a glass clock face, three date wheels all displayed yesterday. Each person could remember only one of its versions.`,
    detail:
      "A narrow window below each wheel held a different trace of the same afternoon. The hands had completed three circuits, but the wheels had never been brought back into line.",
    approaches: {
      listen:
        "They listened through the clock's wooden case. Three distinct ticks answered one another, leading to three date wheels that could be set separately.",
      share:
        "They wrote all three accounts on separate sheets without crossing anything out. The details matched the three windows beneath the clock's date wheels, one account to each circuit.",
      build:
        "From discarded card they cut three small pointers, one for each wheel. Turning them separately brought a different remembered afternoon into each glass window.",
      wait: "They watched the clock complete its pattern. On every third tick, the windows showed the afternoons in order, then returned to their mismatched positions.",
      return:
        "They went back to the clock where their recollections had first diverged. Touching each wheel brought one of the three afternoons sharply to mind.",
      question:
        "“Are we disagreeing about one afternoon, or remembering different ones?” They turned the three wheels separately and saw each account appear in its own window.",
    },
    attempt:
      "They placed the three accounts below their matching windows and began turning the date wheels into chronological order.",
    resolved:
      "The third wheel clicked into place. Everyone remembered the three afternoons, in order: yesterday had repeated, and each had carried away only one pass. They pinned all three accounts beneath the clock, including the details they had nearly erased.",
    open: "The first two wheels turned together; the third slipped back. Each person still remembered a different yesterday, and the three accounts remained side by side, waiting for a sequence they could all recall.",
    tone: {
      reflective:
        "The painful part was how ordinary each memory felt. Nobody had expected certainty to have the texture of three incompatible afternoons.",
      suspenseful:
        "A clock ticked inside a clock tick. The oldest date wheel moved backward. One traveller reached for a sheet that had begun to lose its words.",
      hopeful:
        "Nobody tore up another person's account. Three sheets took more space than one, but the table was wide enough.",
    },
  };
}

function storm(v: Variant): Recipe {
  const anchor = [
    "a low stone post",
    "an iron ring in a stone wall",
    "a buried mooring block",
  ][v];
  return {
    setup:
      "Two travellers stood at the last visible marker, with shelter somewhere beyond the blowing grit. A length of rope lay between them; setting out separately would make it impossible to find one another again.",
    detail: `The painted arrows were gone, but ${anchor} still held beneath the weathered surface. A short line of old anchors led toward a stone arch.`,
    approaches: {
      listen: `They crouched below the wind and heard loose rope tapping against ${anchor}. Following the taps led them to the first sheltered fastening.`,
      share: `One traveller remembered the low markers, the other the arch above them. Comparing those pieces brought their hands to ${anchor} beneath the vanished arrow.`,
      build: `They joined discarded cord with the rope they had, testing every knot. A weighted end caught around ${anchor}, giving them a line they could follow by touch.`,
      wait: `They held position through three gusts. In the brief hollow after each one, ${anchor} appeared in the same place beneath the blown-out marker.`,
      return: `They retraced their last safe steps on their hands and knees. Beneath the marker where the path first disappeared, they found ${anchor} still fixed in place.`,
      question: `“What stays when the painted arrow goes?” Instead of searching the blowing grit for color, they felt below it and found ${anchor}.`,
    },
    attempt:
      "They tied the rope to the anchor and advanced together, one hand on the line, stopping at every fastening before anyone moved farther.",
    resolved:
      "The final length reached the stone arch. Both travellers passed beneath it into shelter, then tied the free end at the entrance so the route could be found without seeing a single painted mark.",
    open: "The rope ended short of the next fastening. No arch was visible. They tied themselves to the last secure anchor and stayed together, with the storm still swallowing the route ahead.",
    tone: {
      reflective:
        "They had trusted the arrows because arrows looked like instructions. The unpainted fastenings, worn smooth by older hands, had seemed hardly worth noticing.",
      suspenseful:
        "The nearest arrow vanished. Grit struck teeth and glass. A traveller took one step away and nearly disappeared with it.",
      hopeful:
        "One traveller placed the rope in the other's hand before moving. Whatever the wind hid next, they had agreed how to keep in reach.",
    },
  };
}

const recipes: Record<Obstacle, (variant: Variant) => Recipe> = {
  silence: bell,
  map: door,
  light: lantern,
  message: letter,
  memory: memories,
  storm,
};

/** Deterministic bounded fiction assembled from authored recipes. This does not
 * assert general creative ability or execute any story/theme text as code.
 */
export function renderStory(frame: StoryFrame): Section[] {
  const valid = readStoryFrame(frame);
  if (!valid) throw new Error("Invalid story frame.");
  const { choices, theme, variant, style, tone, ending } = valid;
  const character = choices.character as Character;
  const setting = choices.setting as Setting;
  const obstacle = choices.obstacle as Obstacle;
  const resolution = choices.resolution as Resolution;
  const person = creativeLexicon.character[character];
  const place = creativeLexicon.setting[setting];
  const problem = creativeLexicon.obstacle[obstacle];
  const capitalPerson = person[0].toUpperCase() + person.slice(1);
  const openings = [
    `${capitalPerson} was closing up for the evening ${place} when ${problem}.`,
    `By dusk, ${person} had stopped ${place}: ${problem}.`,
    `${capitalPerson} had planned to leave before dark. But ${place}, ${problem}.`,
  ];
  const recipe = recipes[obstacle](variant);
  // Recipe references use this one protagonist; a profession-specific title
  // must not accidentally introduce a second character when choices change.
  const actor = person.replace(/^(?:a|an) /, "");
  const adapt = (text: string) =>
    text
      .replaceAll("the protagonist", `the ${actor}`)
      .replaceAll("The protagonist", `The ${actor}`)
      .replaceAll("the keeper's count", `the ${actor}'s count`);
  const body = [openings[variant]];
  if (style !== "concise")
    body.push(characterDetail[character] + " " + settingDetail[setting]);
  body.push(recipe.setup);
  if (style === "detailed") body.push(recipe.detail);
  body.push(recipe.tone[tone]);
  body.push(recipe.approaches[resolution] + " " + recipe.attempt);
  body.push(recipe[ending]);
  const sections: Section[] = [
    {
      text: theme
        ? `A fictional scene inspired by “${theme}”.`
        : "A fictional scene.",
      provenance: "authored",
    },
    ...body.map((paragraph) => ({
      text: adapt(paragraph),
      provenance: "hypothetical" as const,
    })),
  ];
  if (
    sections.length > 40 ||
    sections.reduce((sum, section) => sum + section.text.length + 2, 0) > 24000
  )
    throw new Error("Story exceeds output bounds.");
  return sections;
}
