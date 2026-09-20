import { capabilityVerbs, guideEvidence } from "./knowledge";
import { personalityPhrasing, type Personality } from "./personality";
import type { SourceExcerpt } from "./source-excerpts";
import type {
  Analysis,
  Context,
  Evidence,
  Plan,
  Section,
  Style,
} from "./types";

export { creativeLexicon, seededChoices } from "./story";
import { storyPlans } from "./creative";
export function joinList(items: string[]): string {
  if (items.length < 2) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}
const authored = (text: string): Section => ({ text, provenance: "authored" });
const quote = (e: Evidence): Section => ({
  text: e.text,
  provenance: e.provenance,
  ...(e.provenance === "source" ? { source: e.source } : {}),
});
const choices = [
  "Explain how Jev works",
  "Write a short story",
  "What happens to my data?",
];
const uncertainText =
  "I’m not sure which task you mean. Would you like an explanation, an answer from your notes, or a short fictional story?";
const recoveryText =
  "My selection checks still couldn’t produce a reliable response. Repeating the same clarification won’t help. Choose a documented help topic below, or add the relevant facts in Your notes and ask about those facts.";
const helpOptions = [
  "Explain how Jev works",
  "What happens to my data?",
  "Write a short story",
];
const helpKey = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "");
function guidePlan(
  question: string,
  personality: Personality = "default",
): Plan | null {
  const entries: Record<string, string[]> = {
    "explain how jev works": ["mechanism", "hashes"],
    "how does jev work": ["mechanism", "hashes"],
    "what happens to my data": ["privacy"],
    "what does confidence mean": ["confidence"],
  };
  const ids = entries[helpKey(question)];
  if (!Array.isArray(ids)) return null;
  return plan(
    `help_${ids[0]}`,
    "explain",
    "Documented chat help",
    [
      ...(personalityPhrasing[personality].help
        ? [authored(personalityPhrasing[personality].help)]
        : []),
      ...ids.map((id) =>
        authored(guideEvidence.find((entry) => entry.id === id)!.text),
      ),
    ],
    [],
    helpOptions,
  );
}
/** Exact owned help commands only. Extra instructions stay on the normal path. */
export function scriptedHelp(context: Context): Plan | null {
  const direct = guidePlan(context.question, context.input.personality);
  if (direct) return direct;
  if (
    ![
      "why are you repeating yourself",
      "why do you keep repeating yourself",
      "stop repeating yourself",
      "please stop repeating yourself",
      "you keep repeating yourself",
    ].includes(helpKey(context.originalQuestion))
  )
    return null;
  const preceding = context.input.messages.slice(0, -1);
  let index = preceding.length - 1;
  while (index >= 0 && preceding[index].role !== "assistant") index--;
  const previous = preceding[index];
  const wasFallback =
    previous && [uncertainText, recoveryText].includes(previous.text);
  if (wasFallback) {
    let user = index - 1;
    while (user >= 0 && preceding[user].role !== "user") user--;
    const recovered =
      user >= 0
        ? guidePlan(preceding[user].text, context.input.personality)
        : null;
    if (recovered)
      return {
        ...recovered,
        id: `help_recover_${recovered.id.slice(5)}`,
        sections: [
          authored(
            "You’re right — the previous reply didn’t answer your question. Here’s the explanation:",
          ),
          ...recovered.sections,
        ],
      };
  }
  return plan(
    "help_repetition",
    "explain",
    "Conversation recovery",
    [
      authored(
        wasFallback
          ? "The previous reply was a generic clarification: the selection checks didn’t produce a usable response. Repeating it wasn’t helpful. You can choose a documented help topic below, or add source material in Your notes for a factual question."
          : "This chat can repeat a fallback when its selection checks don’t find a supported response. It uses a bounded set of language rules. Choose a documented help topic below, or add source material in Your notes for a factual question.",
      ),
    ],
    [],
    helpOptions,
  );
}
function plan(
  id: string,
  intent: Plan["intent"],
  title: string,
  sections: Section[],
  sources: Evidence[] = [],
  options: string[] = [],
  status: Plan["status"] = "answered",
): Plan {
  return { id, intent, title, sections, sources, options, status };
}
export function clarification(
  reason: "reference" | "uncertain" | "conflict" | "missing",
  context: Context,
  evidence: Evidence[] = [],
): Plan {
  const texts = {
    reference:
      "I can’t resolve that reference yet. Name the option or topic you mean, and I can continue from there.",
    uncertain: (() => {
      const previous = context.input.messages
        .slice(0, -1)
        .reverse()
        .find((message) => message.role === "assistant");
      return previous && [uncertainText, recoveryText].includes(previous.text)
        ? recoveryText
        : uncertainText;
    })(),
    conflict:
      "The supplied passages appear to conflict. I’ve kept the wording below so you can compare them. Which source should apply to this question?",
    missing: context.input.notes
      ? "The supplied notes do not provide enough support for that answer. Add a passage that addresses the question, or ask about one of the facts already present."
      : "I need source material to answer that reliably. Add relevant text in Your notes, or choose an explanation of Jev or a fictional story.",
  };
  return plan(
    `clarify_${reason}`,
    "clarify",
    "Clarification",
    [authored(texts[reason]), ...evidence.slice(0, 3).map(quote)],
    evidence.slice(0, 3),
    reason === "uncertain" ? helpOptions : [],
    "clarify",
  );
}
function sourcePlan(
  intent: "answer" | "explain" | "compare" | "summarize" | "support",
  context: Context,
  evidence: Evidence[],
  style: Style,
  index: number,
): Plan {
  const limit = style === "concise" ? 2 : style === "balanced" ? 3 : 5;
  const selected = evidence.slice(0, limit);
  const sources = selected.filter((e) => e.provenance === "source");
  const sections: Section[] = [];
  const phrasing = personalityPhrasing[context.input.personality ?? "default"];
  if (intent === "compare") {
    sections.push(
      authored(
        `${phrasing.compare} These are source statements; they do not establish an overall winner.`,
      ),
    );
    selected.forEach((e, i) => {
      sections.push(
        authored(`${String.fromCharCode(65 + i)} · ${e.title}`),
        quote(e),
      );
    });
  } else if (intent === "summarize") {
    sections.push(authored(phrasing.summarize));
    selected.forEach((e) => sections.push(quote(e)));
  } else {
    if (intent === "support") sections.push(authored(phrasing.support));
    else if (sources.length)
      sections.push(
        authored(sources.length === 1 ? phrasing.source : phrasing.sources),
      );
    selected.forEach((e) => sections.push(quote(e)));
  }
  if (selected.length < evidence.length)
    sections.push(
      authored(
        `Showing ${selected.length} of ${evidence.length} selected passages. This extract may omit relevant detail.`,
      ),
    );
  if (style === "detailed" && sources.length)
    sections.push(
      authored(
        "These passages are evidence supplied to this chat, not independently verified facts. Check the source and its applicability before relying on them.",
      ),
    );
  return plan(
    `${intent}_${index}`,
    intent,
    `${style[0].toUpperCase() + style.slice(1)} ${intent}`,
    sections,
    sources,
    intent === "support"
      ? ["What if only the outer packaging is damaged?", "How do returns work?"]
      : [],
  );
}
function excerptPlan(
  context: Context,
  analysis: Analysis,
  evidence: Evidence[],
): Plan | null {
  if (!["answer", "explain", "compare", "summarize"].includes(analysis.intent))
    return null;
  const ranked = (analysis.relevantExcerpts ?? [])
    .map((id) => context.excerpts.find((excerpt) => excerpt.id === id))
    .filter(
      (excerpt): excerpt is SourceExcerpt =>
        !!excerpt &&
        evidence.some(
          (parent) =>
            parent.id === excerpt.sourceId && parent.provenance === "source",
        ),
    );
  if (!ranked.length) return null;
  const limit =
    context.input.style === "concise"
      ? 2
      : context.input.style === "balanced"
        ? 3
        : 5;
  const selected = ranked
    .slice(0, limit)
    .sort(
      (a, b) =>
        context.evidence.findIndex((source) => source.id === a.sourceId) -
          context.evidence.findIndex((source) => source.id === b.sourceId) ||
        a.start - b.start,
    );
  const sources = context.evidence.filter((source) =>
    selected.some((excerpt) => excerpt.sourceId === source.id),
  );
  if (analysis.intent === "compare" && sources.length < 2) return null;
  const sections: Section[] = [
    authored(
      personalityPhrasing[context.input.personality ?? "default"].excerpts,
    ),
  ];
  for (const excerpt of selected)
    sections.push({
      text: excerpt.text,
      provenance: "source",
      source: sources.find((source) => source.id === excerpt.sourceId)!.source,
      excerpt: { start: excerpt.start, end: excerpt.end },
    });
  if (selected.length < ranked.length)
    sections.push(
      authored(
        `Showing ${selected.length} of ${ranked.length} selected excerpts. This extract may omit relevant detail.`,
      ),
    );
  return plan(
    `${analysis.intent}_excerpts`,
    analysis.intent,
    "Focused exact excerpts with full source context",
    sections,
    sources,
  );
}
export function composePlans(context: Context, analysis: Analysis): Plan[] {
  if (context.referenceUnresolved) return [clarification("reference", context)];
  if (analysis.conflict)
    return [
      clarification(
        "conflict",
        context,
        context.evidence.filter(
          (e) => analysis.relevant.includes(e.id) && e.provenance === "source",
        ),
      ),
    ];
  const { intent } = analysis;
  const phrasing = personalityPhrasing[context.input.personality ?? "default"];
  if (intent === "capabilities" || intent === "greet")
    return [
      plan(
        intent,
        intent,
        "Available capabilities",
        [
          authored(
            `${intent === "greet" ? phrasing.greeting : ""}${phrasing.capabilities} ${joinList(capabilityVerbs)}.`,
          ),
          authored(
            "Choose a starting point, or tell me what you want to explore. For factual questions beyond the guide, add the source material in Your notes.",
          ),
        ],
        [],
        choices,
      ),
    ];
  if (intent === "acknowledge")
    return [
      plan("acknowledge", intent, "Acknowledgement", [
        authored(phrasing.acknowledge),
      ]),
    ];
  if (intent === "create")
    return storyPlans(
      context,
      analysis.creative,
      analysis.story,
      analysis.storyCandidates,
    );
  if (intent === "clarify") return [clarification("uncertain", context)];
  if (intent === "unsupported")
    return [
      plan(
        "unsupported",
        intent,
        "Source needed",
        [
          authored(
            "I don’t have the evidence or tools needed to answer that request. Add relevant source text for a factual answer, or describe a fictional scene to explore imaginatively.",
          ),
        ],
        [],
        ["What can you do?"],
        "unsupported",
      ),
    ];
  let evidence = analysis.relevant
    .map((id) => context.evidence.find((e) => e.id === id))
    .filter((e): e is Evidence => !!e);
  if (["compare", "summarize", "answer"].includes(intent))
    evidence = evidence.filter((e) => e.provenance === "source");
  if (!evidence.length || (intent === "compare" && evidence.length < 2))
    return [clarification("missing", context)];
  const styles: Style[] = [
    context.input.style,
    ...(["concise", "balanced", "detailed"] as Style[]).filter(
      (s) => s !== context.input.style,
    ),
  ];
  const candidates = styles.map((style, i) =>
    sourcePlan(intent, context, evidence, style, i),
  );
  const excerpts = excerptPlan(context, analysis, evidence);
  if (excerpts) candidates.unshift(excerpts);
  if (evidence.length > 5 && evidence.length <= 40) {
    const ordered = context.evidence.filter((e) =>
      evidence.some((selected) => selected.id === e.id),
    );
    candidates.push(
      plan(
        `${intent}_all`,
        intent,
        "All selected passages in source order",
        ordered.map(quote),
        ordered.filter((e) => e.provenance === "source"),
      ),
    );
  }
  const seen = new Set<string>();
  return candidates.filter((p) => {
    const text = p.sections.map((s) => s.text).join("\n\n");
    if (seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}
