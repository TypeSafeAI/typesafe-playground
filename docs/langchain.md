# Jev × LangChain integration

Open `/agents/langchain` to invoke a real `@langchain/core` structured tool. This is a runnable local integration example, not a published plugin package. It wraps the same fixed graph and policy gates as Tool Router and returns routing data; downstream tools never execute.

**Invoke LangChain tool** uses live Jev through the server-only TypeSafe API key. **Try mock invocation** invokes the same LangChain tool with seeded classifier responses. Both exercise LangChain schema validation. Neither requires an OpenAI or LangSmith key.

## Run the example

```sh
pnpm install --frozen-lockfile
pnpm example:langchain
```

This runs `scripts/langchain-example.ts`: a real LangChain tool inside a `RunnableLambda` chain, with mock predictions. To use Jev, set `TYPESAFE_API_KEY` in the server environment or ignored `.env.local`, then run:

```sh
pnpm example:langchain --live
```

The script loads `.env.local` only for live mode and only if the process does not already have a key. No key is printed, returned, or placed in browser code.

## Use the adapter

```ts
import { createJevRoutingTool } from "./lib/langchain/jev-tool";
import { serverJevTransport } from "./lib/serverJev";

const jevRouter = createJevRoutingTool({ transport: serverJevTransport });
const decision = await jevRouter.invoke({
  request: "Check the current rate limit settings",
  current_node: "ops_agent",
});
```

The Zod schema accepts a 1–6,000-character request and either `start` or `ops_agent`. You can also pass this tool to a LangChain host; tool-call invocation returns a standard `ToolMessage` with JSON content. See [LangChain tools](https://docs.langchain.com/oss/javascript/langchain/tools) and the [`tool` API](https://reference.langchain.com/javascript/langchain-core/tools/tool).

Output includes `selected_node`, `final_node`, `status`, `confidence`, `probability`, `policy_override`, `requires_approval`, `excluded_candidates`, `source`, and `executed: false`. An operations read request can return `read_config_tool`; a write request returns `approval`; sensitive-data requests return `blocked` without calling Jev. Invalid or uncertain model choices return clarification.

The adapter makes one routing decision. Its host owns the next step, durable state and trusted approval. Do not treat the model's selected node as authorization. The playground links to the Tool Router page to demonstrate a separate mock approval flow.

## Boundaries

The classifier sees only outgoing permitted nodes plus clarification. Both confidence and selected-node probability must reach 0.85. Hard policy cannot be bypassed by the model or a tool-call argument. The broad sensitive-keyword rule is a demo safeguard, not complete intent understanding.

`/api/langchain-route` validates origin, content type, bounded body and schema. It accepts `mode: live | mock`. Live requests reuse `lib/serverJev.ts`, the same bounded provider transport as `/api/run`. Provider failures produce a stopped clarification result with a safe explanation. No arbitrary tool names, URLs, credentials, code, or execution arguments are accepted.
