import {
  SNIPPET_LIMIT,
  type TaskFixture,
  type TaskSet,
  type ToolCatalog,
  type ToolSnippet,
} from "./types";

export const NONE_OPTION = "none";
const NAME = /^[a-z][a-z0-9_]{1,63}$/;

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Compact JSON byte size, the unit for every context measurement. */
export const jsonBytes = (value: unknown) =>
  Buffer.byteLength(JSON.stringify(value), "utf8");

export function validateTools(value: unknown): ToolSnippet[] {
  if (!Array.isArray(value) || !value.length)
    throw Error("Catalog needs at least one tool.");
  const seen = new Set<string>();
  return value.map((raw, i) => {
    if (
      !object(raw) ||
      typeof raw.name !== "string" ||
      !NAME.test(raw.name) ||
      raw.name === NONE_OPTION ||
      typeof raw.category !== "string" ||
      !NAME.test(raw.category) ||
      raw.category === NONE_OPTION ||
      typeof raw.snippet !== "string" ||
      !raw.snippet.trim() ||
      raw.snippet.length > SNIPPET_LIMIT ||
      /[\r\n]/.test(raw.snippet) ||
      !object(raw.schema)
    )
      throw Error(`Tool ${i} is malformed.`);
    if (seen.has(raw.name)) throw Error(`Duplicate tool name ${raw.name}.`);
    seen.add(raw.name);
    return {
      name: raw.name,
      category: raw.category,
      snippet: raw.snippet.trim(),
      schema: raw.schema,
    };
  });
}

export function parseCatalog(value: unknown): ToolCatalog {
  if (!object(value) || value.version !== "tool-router-catalog-v1")
    throw Error("Unsupported catalog version.");
  const tools = validateTools(value.tools);
  const names = new Set(tools.map((t) => t.name));
  if (
    !Array.isArray(value.distractorPairs) ||
    !value.distractorPairs.every(
      (pair) =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        pair[0] !== pair[1] &&
        pair.every((n) => typeof n === "string" && names.has(n)),
    )
  )
    throw Error("Distractor pairs must reference two distinct catalog tools.");
  return {
    version: "tool-router-catalog-v1",
    distractorPairs: value.distractorPairs as [string, string][],
    tools,
  };
}

export function parseTasks(value: unknown, tools: ToolSnippet[]): TaskSet {
  if (!object(value) || value.version !== "tool-router-tasks-v1")
    throw Error("Unsupported task set version.");
  if (!Array.isArray(value.tasks) || !value.tasks.length)
    throw Error("Task set needs at least one task.");
  const byName = new Map(tools.map((t) => [t.name, t]));
  const ids = new Set<string>();
  const tasks: TaskFixture[] = value.tasks.map((raw, i) => {
    if (
      !object(raw) ||
      typeof raw.id !== "string" ||
      !raw.id.trim() ||
      typeof raw.task !== "string" ||
      !raw.task.trim() ||
      !Array.isArray(raw.acceptable) ||
      !raw.acceptable.every((n) => typeof n === "string" && byName.has(n))
    )
      throw Error(`Task ${i} is malformed.`);
    if (ids.has(raw.id)) throw Error(`Duplicate task id ${raw.id}.`);
    ids.add(raw.id);
    const acceptable = raw.acceptable as string[];
    if (raw.expected === null) {
      if (raw.category !== null || acceptable.length)
        throw Error(
          `Task ${raw.id}: a none task has no category or acceptable tools.`,
        );
      return {
        id: raw.id,
        task: raw.task.trim(),
        category: null,
        expected: null,
        acceptable: [],
      };
    }
    const expected = byName.get(String(raw.expected));
    if (
      !expected ||
      raw.category !== expected.category ||
      !acceptable.includes(expected.name)
    )
      throw Error(
        `Task ${raw.id}: expected tool, category and acceptable set disagree.`,
      );
    return {
      id: raw.id,
      task: raw.task.trim(),
      category: expected.category,
      expected: expected.name,
      acceptable: [...new Set(acceptable)],
    };
  });
  return { version: "tool-router-tasks-v1", tasks };
}
