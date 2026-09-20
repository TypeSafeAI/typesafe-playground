import { z } from "zod";
import { readBoundedBody } from "../../../lib/api";
import { serverJevTransport, JevProviderError } from "../../../lib/serverJev";
import { loadFixtures } from "../../../lib/harness/load";
import { createMockTransport } from "../../../lib/harness/mock";
import { FixtureProposer } from "../../../lib/harness/proposer";
import { runProposalReview } from "../../../lib/harness/run";
import type { JevTransport } from "../../../lib/harness/types";
import type { ProviderUsage } from "../../../types/usage";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The browser names a fixture, an arm, and a mode. Nothing else is accepted:
 * the server reloads the fixture from disk and rebuilds the Jev payload
 * itself, so client-supplied state or questions never reach the model.
 */
const inputSchema = z.strictObject({
  fixtureId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "kebab-case fixture id"),
  arm: z.enum(["good", "bad"]),
  mode: z.enum(["mock", "live"]),
});

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  try {
    if (
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (origin &&
        (new URL(origin).host !==
          (request.headers.get("host") || new URL(request.url).host) ||
          !["http:", "https:"].includes(new URL(origin).protocol)))
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
  let input: z.infer<typeof inputSchema>;
  try {
    input = inputSchema.parse(
      JSON.parse(await readBoundedBody(request.body, 4096)),
    );
  } catch {
    return Response.json(
      {
        error:
          "Send { fixtureId, arm: good | bad, mode: mock | live } and nothing else. The server rebuilds the review payload from the fixture.",
        _playgroundUsage: { attempted: false },
      },
      { status: 400 },
    );
  }
  let fixtures;
  try {
    fixtures = loadFixtures();
  } catch (error) {
    return Response.json(
      {
        error: `Fixtures could not be loaded: ${error instanceof Error ? error.message : "unknown error"}`,
        _playgroundUsage: { attempted: false },
      },
      { status: 500 },
    );
  }
  const fixture = fixtures.find((f) => f.id === input.fixtureId);
  if (!fixture)
    return Response.json(
      {
        error: `Unknown fixture ${JSON.stringify(input.fixtureId)}.`,
        _playgroundUsage: { attempted: false },
      },
      { status: 404 },
    );
  let usage: ProviderUsage | { attempted: false } = { attempted: false };
  const live: JevTransport = async (payload, signal) => {
    try {
      const result = await serverJevTransport(
        payload,
        signal,
        request.headers.get("x-typesafe-api-key"),
      );
      usage = result._playgroundUsage;
      return result;
    } catch (error) {
      if (error instanceof JevProviderError)
        usage = error.usage ?? { attempted: false };
      throw error;
    }
  };
  try {
    // A provider error is a valid outcome here: the receipt records it as
    // verdict "unavailable", which is why this stays HTTP 200 rather than 5xx.
    const { receipt, exchange } = await runProposalReview(
      fixture,
      new FixtureProposer(),
      input.mode === "mock" ? createMockTransport(fixtures) : live,
      {
        arm: input.arm,
        mode: "plus_jev",
        source: input.mode === "mock" ? "mock" : "jev",
        signal: request.signal,
      },
    );
    return Response.json(
      { receipt, exchange, _playgroundUsage: usage },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error: "The proposal review could not complete.",
        _playgroundUsage: usage,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
