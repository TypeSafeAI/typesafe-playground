import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildToolPayload,
  CHOICE_OPTION_LIMIT,
  categoriesOf,
  contextBytes,
  groupMetrics,
  jsonBytes,
  markdownTable,
  metricsTable,
  mockTransport,
  NONE_OPTION,
  outcomeOf,
  parseCatalog,
  parseTasks,
  planRoute,
  rankLexically,
  routeTask,
  scoreOutcomes,
  SNIPPET_LIMIT,
  TOOL_ROUTER_MODEL,
  validateTools,
  type TaskOutcome,
  type ToolSnippet,
} from "../lib/tool-router";

const read = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../fixtures/tool-router/${name}`, import.meta.url),
      "utf8",
    ),
  );
const catalog = parseCatalog(read("catalog.json"));
const tools = catalog.tools;
const tasks = parseTasks(read("tasks.json"), tools).tasks;

const answer = (
  choice: string,
  probabilities: Record<string, number>,
  confidence = 0.9,
) => ({
  model: "jev-1.13.0",
  answers: { tool: { type: "choice", choice, probabilities, confidence } },
});

const synthetic = (count: number, categories: number): ToolSnippet[] =>
  Array.from({ length: count }, (_, i) => ({
    name: `tool_${i}`,
    category: `group_${i % categories}`,
    snippet: `Synthetic tool ${i} for group ${i % categories}.`,
    schema: { type: "object", properties: { i: { type: "integer" } } },
  }));

test("fixture shape: 40 tools in 8 categories, 6 distractor pairs, 30 tasks with 5 none", () => {
  assert.equal(tools.length, 40);
  assert.equal(categoriesOf(tools).length, 8);
  assert.equal(catalog.distractorPairs.length, 6);
  assert.equal(new Set(catalog.distractorPairs.flat()).size, 12);
  assert.equal(tasks.length, 30);
  assert.equal(tasks.filter((t) => t.expected === null).length, 5);
  for (const tool of tools) {
    assert.ok(tool.snippet.length <= SNIPPET_LIMIT, tool.name);
    assert.doesNotMatch(tool.snippet, /[\r\n]/);
    const bytes = jsonBytes(tool.schema);
    assert.ok(
      bytes >= 200 && bytes <= 900,
      `${tool.name} schema is ${bytes} bytes`,
    );
    assert.equal((tool.schema as { type?: string }).type, "object");
  }
  for (const category of categoriesOf(tools))
    assert.ok(
      tasks.some((t) => t.category === category),
      category,
    );
  for (const task of tasks.filter((t) => t.expected))
    assert.ok(task.acceptable.includes(task.expected!));
  assert.equal(planRoute(tools), "single");
});

test("catalog validation rejects malformed tools", () => {
  const base = tools[0];
  assert.throws(() => validateTools([base, base]), /Duplicate/);
  assert.throws(() => validateTools([{ ...base, name: NONE_OPTION }]));
  assert.throws(() => validateTools([{ ...base, snippet: "x".repeat(121) }]));
  assert.throws(() => validateTools([{ ...base, snippet: "two\nlines" }]));
  assert.throws(() => validateTools([{ ...base, schema: "not an object" }]));
  assert.throws(() =>
    parseTasks(
      {
        version: "tool-router-tasks-v1",
        tasks: [
          {
            id: "x",
            task: "y",
            category: "files",
            expected: "send_email",
            acceptable: ["send_email"],
          },
        ],
      },
      tools,
    ),
  );
  assert.throws(() =>
    parseCatalog({
      ...catalog,
      distractorPairs: [["read_file", "missing_tool"]],
    }),
  );
});

test("baseline is deterministic and matches hand cases", () => {
  const first = rankLexically(
    "Send an email to the finance list with the report attached",
    tools,
  );
  const second = rankLexically(
    "Send an email to the finance list with the report attached",
    tools,
  );
  assert.deepEqual(first, second);
  assert.equal(first.top1, "send_email");
  assert.equal(
    rankLexically("Run the unit tests for payments", tools).top1,
    "run_tests",
  );
  assert.equal(
    rankLexically("Load leads.csv into the crm table", tools).top1,
    "import_csv",
  );
  const none = rankLexically("zzz qqq xyzzy", tools);
  assert.equal(none.top1, null);
  assert.equal(none.none, true);
  assert.deepEqual(none.top3, []);
  for (const result of [first]) {
    assert.ok(result.top3.length <= 3);
    const scores = result.top3.map((n) => result.scores[n]);
    assert.deepEqual(
      scores,
      [...scores].sort((a, b) => b - a),
    );
  }
});

test("single-stage payload sends every tool plus none, snippets only, pinned model", async () => {
  let sent: unknown;
  const result = await routeTask(
    "Text Jordan that the deploy finished.",
    tools,
    {
      transport: async (payload) => {
        sent = payload;
        return answer("send_sms", {
          send_sms: 0.7,
          send_push_notification: 0.2,
          post_chat_message: 0.05,
          none: 0.05,
        });
      },
    },
  );
  const payload = sent as ReturnType<typeof buildToolPayload>;
  assert.equal(payload.model, TOOL_ROUTER_MODEL);
  assert.equal(TOOL_ROUTER_MODEL, "jev-1.13.0");
  assert.deepEqual(Object.keys(payload.questions), ["tool"]);
  assert.equal(payload.questions.tool.type, "choice");
  const criteria = payload.questions.tool.criteria as Record<string, string>;
  assert.equal(Object.keys(criteria).length, 41);
  assert.ok(criteria[NONE_OPTION]);
  for (const tool of tools) assert.equal(criteria[tool.name], tool.snippet);
  assert.deepEqual(payload.state, {
    task: "Text Jordan that the deploy finished.",
  });
  assert.doesNotMatch(JSON.stringify(payload), /"properties"/);
  assert.equal(result.top1, "send_sms");
  assert.deepEqual(result.top3, [
    "send_sms",
    "send_push_notification",
    "post_chat_message",
  ]);
  assert.equal(result.none, false);
  assert.equal(result.confidence, 0.9);
  assert.equal(result.confidences.send_sms, 0.7);
  assert.equal(result.path, "single");
  assert.equal(result.requests.length, 1);
  assert.equal(result.unavailable, undefined);
});

test("none is an explicit choice, not an absence", async () => {
  const result = await routeTask("What's the capital of Australia?", tools, {
    transport: async () => answer("none", { none: 0.8, web_search: 0.2 }),
  });
  assert.equal(result.none, true);
  assert.equal(result.top1, null);
  assert.deepEqual(result.top3, ["web_search"]);
  assert.equal(result.unavailable, undefined);
});

test("provider error, timeout, cancellation and out-of-set answers become unavailable with no pick", async () => {
  const cases: [string, Parameters<typeof routeTask>[2]][] = [
    [
      "boom",
      {
        transport: async () => {
          throw Error("boom");
        },
      },
    ],
    ["timed out", { transport: () => new Promise(() => {}), timeoutMs: 30 }],
    [
      "outside the closed set",
      { transport: async () => answer("rm_rf", { rm_rf: 1 }) },
    ],
    [
      "not a choice",
      {
        transport: async () => ({
          answers: { tool: { type: "noul", noul: 0.9 } },
        }),
      },
    ],
    ["no answer", { transport: async () => ({ answers: {} }) }],
    ["no answer", { transport: async () => "garbage" }],
  ];
  for (const [expected, options] of cases) {
    const result = await routeTask("Email the report", tools, options);
    assert.match(result.unavailable ?? "", new RegExp(expected), expected);
    assert.equal(result.top1, null);
    assert.deepEqual(result.top3, []);
    assert.equal(result.none, false);
    assert.deepEqual(result.confidences, {});
  }
  const controller = new AbortController();
  controller.abort();
  const cancelled = await routeTask("Email the report", tools, {
    transport: async () => answer("send_email", { send_email: 1 }),
    signal: controller.signal,
  });
  assert.match(cancelled.unavailable ?? "", /cancelled/);
  assert.equal(cancelled.top1, null);
});

test("probabilities outside [0,1] or unknown ids are dropped; the explicit choice stays first", async () => {
  const result = await routeTask("Email the report", tools, {
    transport: async () =>
      answer(
        "send_email",
        { send_email: 0.3, draft_reply: 0.5, ghost: 0.9, add_label: 2 },
        5,
      ),
  });
  assert.equal(result.top1, "send_email");
  assert.deepEqual(result.top3, ["send_email", "draft_reply"]);
  assert.deepEqual(result.confidences, { send_email: 0.3, draft_reply: 0.5 });
  assert.equal(result.confidence, null);
});

test("catalogs over the option limit route in two stages", async () => {
  const big = synthetic(CHOICE_OPTION_LIMIT + 45, 12);
  assert.equal(planRoute(big), "two-stage");
  const sent: Array<Record<string, unknown>> = [];
  const result = await routeTask("Synthetic tool 7 please", big, {
    transport: async (payload) => {
      sent.push(payload);
      if ("category" in payload.questions)
        return {
          answers: {
            category: {
              type: "choice",
              choice: "group_7",
              probabilities: { group_7: 0.6, group_1: 0.4 },
              confidence: 0.6,
            },
          },
        };
      return answer("tool_7", {
        tool_7: 0.5,
        tool_19: 0.3,
        tool_31: 0.1,
        tool_43: 0.05,
        none: 0.05,
      });
    },
  });
  assert.equal(result.path, "two-stage");
  assert.equal(result.stageCategory, "group_7");
  assert.equal(result.top1, "tool_7");
  assert.deepEqual(result.top3, ["tool_7", "tool_19", "tool_31"]);
  assert.equal(result.requests.length, 2);
  const stage1 = sent[0].questions as Record<
    string,
    { criteria: Record<string, string> }
  >;
  assert.equal(Object.keys(stage1.category.criteria).length, 13);
  assert.match(stage1.category.criteria.group_7, /tool_7, tool_19/);
  const stage2 = sent[1].questions as Record<
    string,
    { criteria: Record<string, string> }
  >;
  const stage2Names = Object.keys(stage2.tool.criteria);
  assert.equal(stage2Names.at(-1), NONE_OPTION);
  assert.ok(
    stage2Names
      .slice(0, -1)
      .every((n) => big.find((t) => t.name === n)!.category === "group_7"),
  );
  assert.equal(result.confidences["category:group_7"], 0.6);
  assert.equal(result.confidences.tool_7, 0.5);

  const noCategory = await routeTask("nothing", big, {
    transport: async () => ({
      answers: {
        category: {
          type: "choice",
          choice: "none",
          probabilities: { none: 1 },
        },
      },
    }),
  });
  assert.equal(noCategory.none, true);
  assert.equal(noCategory.requests.length, 1);
  assert.equal(noCategory.stageCategory, null);

  const failed = await routeTask("nothing", big, {
    transport: async () => {
      throw Error("stage one down");
    },
  });
  assert.match(failed.unavailable ?? "", /stage one down/);
  assert.equal(failed.path, "two-stage");

  const failedAfterCategory = await routeTask("nothing", big, {
    transport: async (payload) => {
      if ("category" in payload.questions)
        return {
          answers: {
            category: {
              type: "choice",
              choice: "group_7",
              probabilities: { group_7: 1 },
            },
          },
        };
      throw Error("stage two down");
    },
  });
  assert.match(failedAfterCategory.unavailable ?? "", /stage two down/);
  assert.equal(failedAfterCategory.path, "two-stage");
  assert.equal(failedAfterCategory.stageCategory, "group_7");

  assert.throws(() => planRoute(synthetic(600, 300)), /categories/);
  assert.throws(() => planRoute(synthetic(600, 2)), /Category group_0/);
});

test("mock transport is deterministic and answers inside the closed set for every fixture task", async () => {
  for (const task of tasks) {
    const a = await routeTask(task.task, tools, { transport: mockTransport });
    const b = await routeTask(task.task, tools, { transport: mockTransport });
    assert.equal(a.unavailable, undefined, task.id);
    assert.deepEqual({ ...a, latencyMs: 0 }, { ...b, latencyMs: 0 });
    assert.ok(a.none ? a.top1 === null : tools.some((t) => t.name === a.top1));
  }
});

test("metrics count accuracy over tool tasks and none precision/recall over all tasks", () => {
  const fixture = (
    id: string,
    expected: string | null,
    category: string | null,
    acceptable: string[],
  ) => ({
    id,
    task: id,
    expected,
    category,
    acceptable,
  });
  const outcomes: TaskOutcome[] = [
    outcomeOf(fixture("a", "send_email", "email", ["send_email"]), {
      top1: "send_email",
      top3: ["send_email"],
      none: false,
      latencyMs: 100,
    }),
    outcomeOf(
      fixture("b", "send_email", "email", ["send_email", "draft_reply"]),
      {
        top1: "draft_reply",
        top3: ["draft_reply", "send_email"],
        none: false,
        latencyMs: 300,
      },
    ),
    outcomeOf(fixture("c", "read_file", "files", ["read_file"]), {
      top1: null,
      top3: [],
      none: true,
      latencyMs: 200,
    }),
    outcomeOf(fixture("d", "read_file", "files", ["read_file"]), {
      top1: null,
      top3: [],
      none: false,
      unavailable: "down",
      latencyMs: 50,
    }),
    outcomeOf(fixture("e", null, null, []), {
      top1: null,
      top3: [],
      none: true,
      latencyMs: 200,
    }),
    outcomeOf(fixture("f", null, null, []), {
      top1: "web_search",
      top3: ["web_search"],
      none: false,
      latencyMs: 200,
    }),
  ];
  const m = scoreOutcomes(outcomes);
  assert.equal(m.tasks, 6);
  assert.equal(m.withTool, 4);
  assert.equal(m.top1Exact, 1);
  assert.equal(m.top1Acceptable, 2);
  assert.equal(m.top3, 2);
  assert.equal(m.noneTruePositive, 1);
  assert.equal(m.noneFalsePositive, 1);
  assert.equal(m.noneFalseNegative, 1);
  assert.equal(m.unavailable, 1);
  assert.equal(m.meanLatencyMs, 200);
  const grouped = groupMetrics(outcomes);
  assert.deepEqual(Object.keys(grouped.byCategory), ["email", "files", "none"]);
  assert.equal(grouped.byCategory.none.noneTruePositive, 1);
  const table = metricsTable("t", grouped, true);
  assert.match(
    table,
    /\| email \| 2 \| 50\.0% \(1\/2\) \| 100\.0% \(2\/2\) \| 100\.0% \(2\/2\) \|/,
  );
  assert.match(
    table,
    /\*\*Total\*\* \| 6 \| 25\.0% \(1\/4\) \| 50\.0% \(2\/4\) \| 50\.0% \(2\/4\) \| 50\.0% \(1\/2\) \| 50\.0% \(1\/2\) \| 1 \| 200 \|/,
  );
  assert.equal(
    markdownTable(["a", "b"], [["1", "2"]]),
    "| a | b |\n| --- | --- |\n| 1 | 2 |",
  );
});

test("context bytes: all schemas vs snippets vs snippets plus routed schemas", () => {
  const small = tools.slice(0, 3);
  const schemaBytes = (t: ToolSnippet) =>
    jsonBytes({ name: t.name, schema: t.schema });
  const all = small.reduce((s, t) => s + schemaBytes(t), 0);
  const snippets = jsonBytes(
    small.map((t) => ({ name: t.name, snippet: t.snippet })),
  );
  const fixture = {
    id: "x",
    task: "x",
    expected: small[0].name,
    category: small[0].category,
    acceptable: [small[0].name],
  };
  const routed = contextBytes(small, [
    outcomeOf(fixture, {
      top1: small[0].name,
      top3: [small[0].name, small[1].name],
      none: false,
    }),
  ]);
  assert.equal(routed.allSchemas, all);
  assert.equal(routed.snippetsOnly, snippets);
  assert.equal(
    routed.meanSnippetsPlusTop3,
    snippets + schemaBytes(small[0]) + schemaBytes(small[1]),
  );
  assert.equal(routed.meanSnippetsPlusTop1, snippets + schemaBytes(small[0]));
  const none = contextBytes(small, [
    outcomeOf(fixture, { top1: null, top3: [], none: true }),
  ]);
  assert.equal(none.meanSnippetsPlusTop3, snippets);
  const down = contextBytes(small, [
    outcomeOf(fixture, {
      top1: null,
      top3: [],
      none: false,
      unavailable: "down",
    }),
  ]);
  assert.equal(down.meanSnippetsPlusTop3, snippets + all);
  assert.ok(all > snippets);
});
