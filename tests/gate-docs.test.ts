import test from "node:test";
import assert from "node:assert/strict";
import { parseDocumentation, lookupDocumentation } from "../lib/gateDocs";
import { runDocsFirst } from "../lib/docsFirstTriage";
const document =
  "# API\nSource: https://docs.typesafe.ai/api\n\n## Authentication\nSend the API key using the Authorization header.\n\n# Unsafe\nSource: https://evil.example/fake\n\nInvented documentation.\n";
test("documentation preserves citable source URLs and excludes foreign sources", () => {
  const snippets = parseDocumentation(document);
  assert.equal(snippets.length, 1);
  assert.equal(snippets[0].sourceUrl, "https://docs.typesafe.ai/api");
  assert.match(snippets[0].content, /Authorization header/);
});
test("full-feed retrieval shortlists relevant passages instead of sending the entire feed", async () => {
  const result = await lookupDocumentation(
    ["How do I authenticate using an API key?"],
    async () => new Response(document),
  );
  assert.equal(result.mode, "full");
  assert.equal(result.snippets.length, 1);
});
test("index fallback fetches actual relevant pages, never treating link descriptions as answers", async () => {
  const visited: string[] = [];
  const result = await lookupDocumentation(
    ["API authentication"],
    async (url) => {
      visited.push(String(url));
      if (String(url).endsWith("llms-full.txt"))
        return new Response("", { status: 503 });
      if (String(url).endsWith("llms.txt"))
        return new Response(
          "- [API authentication](https://docs.typesafe.ai/api.md): Reference\n- [evil](https://evil.example/api.md): API authentication",
        );
      return new Response("# Authentication\n\nUse the Authorization header.");
    },
  );
  assert.equal(result.mode, "linked_pages");
  assert.equal(result.snippets[0].sourceUrl, "https://docs.typesafe.ai/api");
  assert.ok(!visited.some((url) => url.includes("evil.example")));
});
test("docs answer stops before community classification; unsupported docs fall through", async () => {
  const input = {
    question: "API key?",
    transcript: "Val: Use a key",
    docs: "",
    format: "auto",
    model: "jev-latest",
    historyLimit: 20,
  };
  const snippets = parseDocumentation(document);
  let calls = 0;
  const classify = async (request: any) => {
    calls++;
    assert.equal(request.payload.state.history.length, 0);
    return {
      answers: {
        decision: {
          type: "choice",
          choice: "answerable_by_docs",
          confidence: 0.99,
        },
        evidence: { type: "choice", choice: request.candidates[0].id },
      },
    };
  };
  const result = await runDocsFirst(input, snippets, classify, 0.7);
  assert.equal(calls, 1);
  assert.equal(result.stage, "docs");
  calls = 0;
  const fallback = await runDocsFirst(
    input,
    snippets,
    async (request) => {
      calls++;
      return {
        answers: {
          decision: { type: "choice", choice: "needs_human", confidence: 0.99 },
          evidence: { type: "choice", choice: "none" },
        },
      };
    },
    0.7,
  );
  assert.equal(calls, 2);
  assert.equal(fallback.stage, "community");
});

test("authentication wording retrieves Authorization instructions ahead of generic API mentions", async () => {
  const feed =
    "# Overview\nSource: https://docs.typesafe.ai/concepts/state\n\n" +
    Array.from(
      { length: 10 },
      (_, i) => `An API request can include context ${i}.`,
    ).join("\n\n") +
    "\n\n# Evaluation endpoint\nSource: https://docs.typesafe.ai/api\n\nAuthorization: Bearer <API_KEY>\n";
  const result = await lookupDocumentation(
    ["How do I authenticate an API request?"],
    async () => new Response(feed),
  );
  assert.ok(
    result.snippets.some(
      (snippet) => snippet.sourceUrl === "https://docs.typesafe.ai/api",
    ),
  );
});
