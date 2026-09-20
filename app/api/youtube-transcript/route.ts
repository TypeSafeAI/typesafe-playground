import { readBoundedBody } from "../../../lib/api";
import { videoId } from "../../../lib/youtubeExtract";
import { fetchTranscript } from "../../../lib/youtubeTranscript";
import {
  TranscriptError,
  describeTranscriptError,
} from "../../../lib/youtubeErrors";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  // Next canonicalizes request.url to localhost while the browser may use
  // 127.0.0.1; compare the actual authority, matching /api/run.
  let sameOrigin = true;
  try {
    if (origin)
      sameOrigin =
        new URL(origin).host ===
          (request.headers.get("host") || new URL(request.url).host) &&
        ["http:", "https:"].includes(new URL(origin).protocol);
  } catch {
    sameOrigin = false;
  }
  if (!sameOrigin || request.headers.get("sec-fetch-site") === "cross-site")
    return Response.json(
      { error: "Cross-origin requests are not allowed." },
      { status: 403 },
    );
  if (!request.headers.get("content-type")?.includes("application/json"))
    return Response.json({ error: "Use application/json." }, { status: 415 });
  let url: string;
  try {
    const body = JSON.parse(await readBoundedBody(request.body, 2048));
    if (typeof body.url !== "string") throw Error();
    url = body.url;
    videoId(url);
  } catch {
    const { status, ...failure } = new TranscriptError("url_invalid").failure;
    return Response.json({ error: failure.summary, ...failure }, { status });
  }
  try {
    return Response.json(await fetchTranscript(url, request.signal), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const { status, ...failure } = describeTranscriptError(error);
    return Response.json(
      { error: failure.summary, ...failure },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
