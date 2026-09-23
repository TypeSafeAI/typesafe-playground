/**
 * Fixture schema. Fixtures are synthetic; nothing here comes from a real repo.
 * Pure (zod only). Extracted from TypeSafeAI/typesafe-playground
 * `lib/harness/fixtures.ts` at 6fe5967dc020521a0731682b06c4d8eeeab95ffb.
 */
import { z } from "zod";
import { proposalSchema } from "../contract/validate";
import { REVIEW_QUESTION_IDS, type Fixture, type FixtureCategory, type Proposal } from "../contract/types";

export const FIXTURE_CATEGORIES = Object.freeze([
  "clean",
  "off_scope",
  "missing_evidence",
  "prompt_injection",
  "ambiguous",
] as const satisfies readonly FixtureCategory[]);

/**
 * The mix the bench reports against: the Week 1 set of 20 extracted from the
 * playground, one `clean` fixture for issue #4, and four prospective pairs for #5.
 */
export const EXPECTED_CATEGORY_MIX: Readonly<Record<FixtureCategory, number>> = Object.freeze({
  clean: 10,
  off_scope: 4,
  missing_evidence: 4,
  prompt_injection: 4,
  ambiguous: 3,
});

const verdict = z.enum(["permit", "proposal_only", "reject", "unavailable"]);
const probability = z.number().min(0).max(1);
const mockAnswers = z.strictObject(
  Object.fromEntries(REVIEW_QUESTION_IDS.map((id) => [id, probability])) as Record<
    (typeof REVIEW_QUESTION_IDS)[number],
    typeof probability
  >,
);

export const fixtureSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "kebab-case id"),
  category: z.enum(FIXTURE_CATEGORIES),
  task: z.string().min(1).max(2_000),
  files: z.record(z.string().min(1).max(200), z.string().max(8_000)).refine(
    (files) => Object.keys(files).length >= 1 && Object.keys(files).length <= 6,
    "between 1 and 6 files",
  ),
  evidence: z.array(z.string().max(2_000)).max(20),
  proposals: z.strictObject({ good: proposalSchema, bad: proposalSchema }),
  expected: z.strictObject({ good: verdict, bad: verdict }),
  mock: z.strictObject({ good: mockAnswers, bad: mockAnswers }),
});

/** zod reports an absent optional key as `patch?: string | undefined`; drop it. */
function proposal(value: z.infer<typeof proposalSchema>): Proposal {
  const { patch, ...rest } = value;
  return patch === undefined ? rest : { ...rest, patch };
}

export function parseFixture(value: unknown, source = "fixture"): Fixture {
  const result = fixtureSchema.safeParse(value);
  if (!result.success)
    throw Error(
      `${source}: ${result.error.issues
        .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
        .join("; ")}`,
    );
  const data = result.data;
  return {
    ...data,
    proposals: { good: proposal(data.proposals.good), bad: proposal(data.proposals.bad) },
  };
}

export function parseFixtureSet(values: unknown[], sources?: string[]): Fixture[] {
  const fixtures = values.map((v, i) => parseFixture(v, sources?.[i] ?? `fixture[${i}]`));
  const ids = new Set<string>();
  for (const f of fixtures) {
    if (ids.has(f.id)) throw Error(`Duplicate fixture id ${f.id}.`);
    ids.add(f.id);
  }
  return fixtures;
}
