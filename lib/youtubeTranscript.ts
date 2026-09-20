import { load } from "cheerio";
import { readBoundedBody } from "./api";
import {
  TranscriptError,
  causeForStatus,
  transcriptLimits,
} from "./youtubeErrors";
import {
  videoId,
  chunkCaptions,
  type Transcript,
  type Caption,
} from "./youtubeExtract";
/** Fixed hosts only; redirects are never followed. No supplied URL is fetched directly. */
export async function fetchTranscript(
  input: string,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
): Promise<Transcript> {
  const id = videoId(input);
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(transcriptLimits.deadlineMs)]);
  async function read(url: string, init: RequestInit = {}) {
    const response = await transport(url, {
      ...init,
      signal: boundedSignal,
      redirect: "error",
      cache: "no-store",
      headers: {
        Accept: "text/html, application/xml, text/xml",
        "Accept-Language": "en",
        ...init.headers,
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new TranscriptError(causeForStatus(response.status));
    }
    return readBoundedBody(response.body, transcriptLimits.pageBytes);
  }
  const html = await read(`https://www.youtube.com/watch?v=${id}`);
  const publicKey = /"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/.exec(html)?.[1];
  let player;
  if (publicKey) {
    player = JSON.parse(
      await read(
        `https://www.youtube.com/youtubei/v1/player?key=${publicKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: {
              client: { clientName: "ANDROID", clientVersion: "20.10.38" },
            },
            videoId: id,
          }),
        },
      ),
    );
  } else {
    // Parse a balanced JSON object without evaluating page scripts.
    const marker = /ytInitialPlayerResponse\s*=\s*/g.exec(html);
    if (!marker)
    throw new TranscriptError("metadata_missing");
    const start = marker.index + marker[0].length;
    let depth = 0,
      quoted = false,
      escaped = false,
      end = -1;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') quoted = false;
      } else if (ch === '"') quoted = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    if (end < 0) throw new TranscriptError("metadata_unreadable");
    player = JSON.parse(html.slice(start, end));
  }
  const tracks =
    player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks))
    throw new TranscriptError("no_caption_tracks");
  const english = tracks.filter(
    (t) =>
      typeof t.languageCode === "string" && /^en(?:-|$)/.test(t.languageCode),
  );
  const track =
    english.find((t) => t.kind !== "asr") ??
    english[0] ??
    tracks.find((t) => t.kind !== "asr") ??
    tracks[0];
  if (!track)
    throw new TranscriptError("no_caption_tracks");
  const url = new URL(track.baseUrl);
  if (
    url.origin !== "https://www.youtube.com" ||
    url.pathname !== "/api/timedtext" ||
    url.username ||
    url.password ||
    url.searchParams.has("tlang")
  )
    throw new TranscriptError("track_rejected");
  url.searchParams.delete("fmt");
  const xml = await read(url.toString());
  const $ = load(xml, { xmlMode: true });
  const lines: Caption[] = [];
  $("transcript > text").each((_, el) => {
    const node = $(el);
    lines.push({
      text: node.text(),
      start: Number(node.attr("start") ?? NaN),
      duration: Number(node.attr("dur") ?? NaN),
    });
  });
  if (!lines.length)
    throw new TranscriptError("captions_empty");
  chunkCaptions(lines);
  return {
    videoId: id,
    title:
      typeof player.videoDetails?.title === "string"
        ? player.videoDetails.title.slice(0, 500)
        : "YouTube video",
    language: track.languageCode,
    automatic: track.kind === "asr",
    lines,
  };
}
