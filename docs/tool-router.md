# Jev tool router

Open `/tool-router` to route a request one graph edge at a time. **Run Routing Step** asks Jev to choose a permitted next node. **Run mock scenario** follows a seeded path without an API call. Both modes mock all agent and tool execution. This is a small LangGraph-style state machine, not a LangGraph integration.

## Graph and policy

`start` connects to research, support and operations agents. Operations connects to read-configuration, modify-configuration and export-secrets tools. Research, support and permitted tools then connect to `end`. A sole end edge is deterministic and makes no model call.

Before any Jev request, a conservative keyword rule blocks requests mentioning passwords, secrets, credentials or private/API keys. This intentionally broad demonstration rule can reject benign discussion of these topics; it is not a production intent detector. `export_secrets_tool` is always removed from model candidates and cannot execute regardless of phrasing.

Every model decision includes `needs_clarification` alongside allowed outgoing nodes. Jev receives the user request, current node and complete permitted candidate list. It returns only a selected node, confidence and selected-node probability. Both scores must meet 0.85. Missing scores, invented nodes, provider failures and ambiguity stop for clarification. The model cannot generate actions or arguments.

After classification, graph membership and policy are checked again. Selecting `modify_config_tool` routes to a separate approval checkpoint. **Approve mock step** records a simulated change; **Decline** stops without executing it. There are no production credentials or real tools in this engine. Editing the request or changing the scenario resets the entire path, including pending approval.

## Seeded scenarios

- **Read settings:** operations → read configuration → complete. Output is a fixed demo rate limit and timeout, not your service configuration.
- **Change production:** operations → approval. Only explicit approval permits the mock configuration step.
- **Request a secret:** blocked before Jev, with no tool execution.

The result separates the proposed node from the final action and explains any policy override. The step log preserves transitions, scores, policy outcomes, prediction provenance and mock outputs. Export downloads this record as JSON; no messages are sent anywhere. Requests are limited to 6,000 characters and paths to 20 routing steps.

Implementation: `types/workflow.ts`, `lib/workflowGraph.ts`, `lib/routeStep.ts`, `lib/toolRouterRules.ts`, and `lib/toolRouterClassifier.ts`. The shared `evaluateHardRules.ts` and `classifyWithJev.ts` entry points also export the router helpers. UI modules: `ToolRouterLab`, `GraphView`, `RoutingResult`, and `StepLog`.

See also the separate [tool router benchmark](tool-router-bench.md), a command-line experiment that routes a task to one of 40 snippet-described tools in a single closed-set question and measures accuracy and context bytes against a lexical baseline.
