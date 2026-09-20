/**
 * Every way caption retrieval can fail, named. The route used to collapse all
 * of them into one message that guessed at three causes at once, so a reader
 * could not tell a video with no captions from a track that overran a limit.
 */
export const transcriptLimits = {
  lines: 5000,
  characters: 60000,
  chunks: 200,
  unitCharacters: 6000,
  pageBytes: 2 * 1024 * 1024,
  deadlineMs: 20000,
} as const;
/** The limits a reader can actually hit, worded for display. */
export const limitNotes: { label: string; value: string; note: string }[] = [
  {
    label: "Caption lines",
    value: "5,000",
    note: "Cue count in the track, before cleanup.",
  },
  {
    label: "Characters",
    value: "60,000",
    note: "Whole transcript. Oversized tracks fail; nothing is truncated.",
  },
  {
    label: "Natural chunks",
    value: "200",
    note: "Split at gaps, terminal punctuation and speaker markers.",
  },
  {
    label: "Characters per chunk",
    value: "6,000",
    note: "An unpunctuated run stays whole, so it can exceed this alone.",
  },
  {
    label: "Watch page",
    value: "2 MiB",
    note: "Upstream body bound. A heavily decorated page can exceed it.",
  },
  {
    label: "Retrieval deadline",
    value: "20 s",
    note: "Covers the watch page, player and caption fetches together.",
  },
];
export type TranscriptCause =
  | "url_invalid"
  | "video_unavailable"
  | "rate_limited"
  | "youtube_error"
  | "page_too_large"
  | "metadata_missing"
  | "metadata_unreadable"
  | "no_caption_tracks"
  | "track_rejected"
  | "captions_empty"
  | "timed_out"
  | "cancelled"
  | "redirected"
  | "limit_lines"
  | "limit_characters"
  | "limit_chunks"
  | "limit_unit"
  | "unknown";
export interface LimitBreach {
  name: string;
  allowed: number;
  actual: number;
}
export interface TranscriptFailure {
  cause: TranscriptCause;
  /** One line naming what failed. */
  summary: string;
  /** Why it happened, and what it does not mean. */
  detail: string;
  /** The next thing worth trying, or why nothing will help. */
  fix: string;
  status: number;
  limit?: LimitBreach;
}
type Template = Omit<TranscriptFailure, "cause" | "limit">;
const templates: Record<TranscriptCause, Template> = {
  url_invalid: {
    summary: "That is not a YouTube video URL.",
    detail:
      "The address did not parse as a watch, youtu.be or shorts link over HTTPS, so no request was made.",
    fix: "Paste a link of the form https://www.youtube.com/watch?v=… or https://youtu.be/… .",
    status: 400,
  },
  video_unavailable: {
    summary: "YouTube says this video is not available.",
    detail:
      "The watch page came back 404 or 410. The video is private, deleted, region-blocked, or the id is wrong. Nothing about captions was reached.",
    fix: "Open the same link in a browser. If it does not play there, no caption track can be retrieved.",
    status: 404,
  },
  rate_limited: {
    summary: "YouTube rate-limited this server.",
    detail:
      "The request returned 429. YouTube throttles the unofficial endpoints this prototype reads, and the limit applies to the server's address, not to your key or account.",
    fix: "Wait a minute and retry. Repeated runs from one host make this more likely.",
    status: 429,
  },
  youtube_error: {
    summary: "YouTube refused or failed the request.",
    detail:
      "A non-success status came back from a fixed YouTube host. These are unofficial interfaces that can block server addresses or change without notice.",
    fix: "Retry once. If it persists, this video is not reachable from this deployment.",
    status: 502,
  },
  page_too_large: {
    summary: "The watch page exceeded the 2 MiB body limit.",
    detail:
      "Reading stops at 2 MiB so a single request cannot exhaust memory. A page with a long description, chapters and a full recommendation shelf can pass that on its own.",
    fix: "Try a video with a shorter description. The limit is on the page, not on the captions.",
    status: 413,
  },
  metadata_missing: {
    summary: "The page exposed no caption metadata.",
    detail:
      "Neither the player key nor the initial player response appeared in the HTML. YouTube serves a reduced page to unrecognized clients, and it also does this for private, age-restricted and consent-walled videos.",
    fix: "Confirm the video plays publicly without sign-in.",
    status: 502,
  },
  metadata_unreadable: {
    summary: "Caption metadata was present but unreadable.",
    detail:
      "The player response began but did not close as balanced JSON within the page that was read. The page is parsed as text and never executed, so a changed page shape stops retrieval rather than running anything.",
    fix: "Retry. A persistent failure means the page format changed and this prototype needs updating.",
    status: 502,
  },
  no_caption_tracks: {
    summary: "This video has no caption track.",
    detail:
      "The player response carried no caption list. The video genuinely has neither manual nor automatic captions published.",
    fix: "Choose a video showing the CC badge. This prototype never transcribes audio, so there is nothing to fall back to.",
    status: 404,
  },
  track_rejected: {
    summary: "The caption track URL failed its safety check.",
    detail:
      "A track was listed, but its address was not a plain timedtext URL on www.youtube.com, or it carried credentials or a translation parameter. Only the exact expected shape is fetched.",
    fix: "Nothing to change on your side. The track is refused deliberately rather than fetched.",
    status: 502,
  },
  captions_empty: {
    summary: "The caption track came back empty.",
    detail:
      "The track was listed and fetched, but contained no readable cues. This usually means the track requires sign-in, or YouTube served an empty document to this server.",
    fix: "Try another video, or the same one later.",
    status: 502,
  },
  timed_out: {
    summary: "Caption retrieval passed its 20 second deadline.",
    detail:
      "The watch page, player and caption requests share one 20 second budget. Nothing partial is used, because a truncated track would silently change what the extract can contain.",
    fix: "Retry. Repeated timeouts point at network reachability from this server.",
    status: 504,
  },
  cancelled: {
    summary: "Retrieval was cancelled.",
    detail: "The request was stopped before captions were read.",
    fix: "Run it again when ready.",
    status: 499,
  },
  redirected: {
    summary: "YouTube tried to redirect the request.",
    detail:
      "Redirects are refused rather than followed, so a fixed host cannot be used to reach somewhere else. A consent or region interstitial is the usual reason.",
    fix: "This video is not retrievable from this deployment.",
    status: 502,
  },
  limit_lines: {
    summary: "The track has more than 5,000 caption lines.",
    detail:
      "Cue count is checked before any other work. The cap keeps one run bounded; it is not a statement about the video.",
    fix: "Choose a shorter video. Nothing is truncated to fit.",
    status: 413,
  },
  limit_characters: {
    summary: "The transcript is longer than 60,000 characters.",
    detail:
      "Total characters are counted across the whole track. Scoring sends bounded transcript context with each call, so an unbounded track would grow every request.",
    fix: "Choose a shorter video. Nothing is truncated to fit.",
    status: 413,
  },
  limit_chunks: {
    summary: "The track splits into more than 200 natural chunks.",
    detail:
      "Each chunk costs one scored request, so the chunk cap is also the call cap for a run.",
    fix: "Choose a shorter video. Chunks are never merged to fit the cap.",
    status: 413,
  },
  limit_unit: {
    summary: "One natural chunk is longer than 6,000 characters on its own.",
    detail:
      "Chunks split at gaps, terminal punctuation and speaker markers. An unpunctuated run has no boundary to split on, so it stays whole and can exceed the cap by itself. This is common in automatic captions.",
    fix: "Choose a video with punctuated or manual captions. Fixed-length slicing is deliberately not used, since it would cut mid-sentence.",
    status: 413,
  },
  unknown: {
    summary: "Caption retrieval failed.",
    detail: "The failure did not match any known cause.",
    fix: "Retry once, then try another video.",
    status: 502,
  },
};
export class TranscriptError extends Error {
  readonly failure: TranscriptFailure;
  constructor(cause: TranscriptCause, limit?: LimitBreach) {
    const template = templates[cause] ?? templates.unknown;
    super(template.summary);
    this.name = "TranscriptError";
    this.failure = { cause, ...template, ...(limit ? { limit } : {}) };
  }
}
/** Maps an upstream status to the cause it actually indicates. */
export const causeForStatus = (status: number): TranscriptCause =>
  status === 404 || status === 410
    ? "video_unavailable"
    : status === 429
      ? "rate_limited"
      : "youtube_error";
/**
 * Names a thrown value. Aborts, deadlines, refused redirects and the body
 * bound all arrive as ordinary errors, so they are identified here rather
 * than collapsing into one unexplained failure.
 */
export function describeTranscriptError(error: unknown): TranscriptFailure {
  if (error instanceof TranscriptError) return error.failure;
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (name === "TimeoutError") return new TranscriptError("timed_out").failure;
  if (name === "AbortError")
    return new TranscriptError(
      /timeout|deadline/i.test(message) ? "timed_out" : "cancelled",
    ).failure;
  if (/exceeds the size limit/i.test(message))
    return new TranscriptError("page_too_large").failure;
  if (/redirect/i.test(message))
    return new TranscriptError("redirected").failure;
  return new TranscriptError("unknown").failure;
}
