import { z } from "zod";
import { readBoundedBody } from "../../../lib/api";
import {
  createJevRoutingTool,
  mockRoutingTransport,
  routingToolSchema,
} from "../../../lib/langchain/jev-tool";
import { serverJevTransport, JevProviderError } from "../../../lib/serverJev";
export const runtime = "nodejs";
export const maxDuration = 60;
const inputSchema = routingToolSchema.extend({
  mode: z.enum(["live", "mock"]).default("live"),
});
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  try {
    if (
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (origin &&
        (!["http:", "https:"].includes(new URL(origin).protocol) ||
          new URL(origin).host !==
            (request.headers.get("host") || new URL(request.url).host)))
    )
      return Response.json(
        { error: "Cross-origin requests are not allowed." },
        { status: 403 },
      );
  } catch {
    return Response.json({ error: "Invalid origin." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.includes("application/json"))
    return Response.json({ error: "Use application/json." }, { status: 415 });
  let input;
  try {
    input = inputSchema.parse(
      JSON.parse(await readBoundedBody(request.body, 8192)),
    );
  } catch {
    return Response.json(
      {
        error:
          "Use a request of 1–6,000 characters, current_node start or ops_agent, and mode live or mock.",
      },
      { status: 400 },
    );
  }
  const start = performance.now();
  let usage: any = { attempted: false };
  let providerError: unknown;
  try {
    const router = createJevRoutingTool({
      transport:
        input.mode === "mock"
          ? mockRoutingTransport
          : async (payload, signal) => {
              try {
                const result = await serverJevTransport(
                  payload,
                  signal,
                  request.headers.get("x-typesafe-api-key"),
                );
                usage = result._playgroundUsage;
                return result;
              } catch (error) {
                providerError = error;
                if (error instanceof JevProviderError)
                  usage = error.usage ?? { attempted: false };
                throw error;
              }
            },
      mode: input.mode,
    });
    const output = await router.invoke(
      { request: input.request, current_node: input.current_node },
      { signal: request.signal },
    );
    if (providerError) throw providerError;
    return Response.json(
      {
        _playgroundUsage: usage,
        tool: router.name,
        mode: input.mode,
        latencyMs: performance.now() - start,
        output,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        _playgroundUsage: usage,
        error:
          error instanceof JevProviderError
            ? error.message
            : "The LangChain routing tool could not complete this invocation.",
      },
      {
        headers: {
          "Cache-Control": "no-store",
          ...(providerError instanceof JevProviderError &&
          providerError.usage?.retryAt
            ? {
                "Retry-After": String(
                  Math.max(
                    1,
                    Math.ceil(
                      (Date.parse(providerError.usage.retryAt) - Date.now()) /
                        1000,
                    ),
                  ),
                ),
              }
            : {}),
        },
        status:
          providerError instanceof JevProviderError
            ? providerError.status
            : 502,
      },
    );
  }
}
