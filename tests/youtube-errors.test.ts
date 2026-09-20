import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TranscriptError,
  causeForStatus,
  describeTranscriptError,
  limitNotes,
  transcriptLimits,
  type TranscriptCause,
} from "../lib/youtubeErrors";
import { chunkCaptions } from "../lib/youtubeExtract";
const line = (text: string, start: number) => ({ text, start, duration: 1 });
test("an upstream status maps to the cause it actually indicates", () => {
  assert.equal(causeForStatus(404), "video_unavailable");
  assert.equal(causeForStatus(410), "video_unavailable");
  assert.equal(causeForStatus(429), "rate_limited");
  assert.equal(causeForStatus(403), "youtube_error");
  assert.equal(causeForStatus(500), "youtube_error");
});
test("every cause carries a summary, a reason and a next step", () => {
  const causes: TranscriptCause[] = [
    "url_invalid",
    "video_unavailable",
    "rate_limited",
    "youtube_error",
    "page_too_large",
    "metadata_missing",
    "metadata_unreadable",
    "no_caption_tracks",
    "track_rejected",
    "captions_empty",
    "timed_out",
    "cancelled",
    "redirected",
    "limit_lines",
    "limit_characters",
    "limit_chunks",
    "limit_unit",
    "unknown",
  ];
  for (const cause of causes) {
    const { failure } = new TranscriptError(cause);
    assert.equal(failure.cause, cause);
    assert.ok(failure.summary.length > 10, `${cause} summary`);
    assert.ok(failure.detail.length > 30, `${cause} detail`);
    assert.ok(failure.fix.length > 10, `${cause} fix`);
    assert.ok(failure.status >= 400, `${cause} status`);
    // A cause that names a limit must say the number in its own summary.
    if (cause.startsWith("limit_"))
      assert.match(failure.summary, /[\d,]{3,}/, `${cause} states its number`);
  }
});
test("aborts, deadlines, size bounds and refused redirects are told apart", () => {
  const named = (name: string, message = "") => {
    const error = Error(message);
    error.name = name;
    return error;
  };
  assert.equal(
    describeTranscriptError(named("TimeoutError")).cause,
    "timed_out",
  );
  assert.equal(
    describeTranscriptError(named("AbortError")).cause,
    "cancelled",
    "a user stop is not reported as a timeout",
  );
  assert.equal(
    describeTranscriptError(named("AbortError", "signal timeout")).cause,
    "timed_out",
  );
  assert.equal(
    describeTranscriptError(Error("Body exceeds the size limit.")).cause,
    "page_too_large",
  );
  assert.equal(
    describeTranscriptError(Error("unexpected redirect")).cause,
    "redirected",
  );
  assert.equal(
    describeTranscriptError(Error("something else")).cause,
    "unknown",
  );
  assert.equal(describeTranscriptError(undefined).cause, "unknown");
});
test("a TranscriptError passes through describe unchanged", () => {
  const original = new TranscriptError("rate_limited");
  assert.deepEqual(describeTranscriptError(original), original.failure);
});
test("the two chunk caps are reported apart, each with what was measured", () => {
  const tooMany = Array.from({ length: transcriptLimits.chunks + 1 }, (_, i) =>
    line("A sentence.", i),
  );
  assert.throws(
    () => chunkCaptions(tooMany),
    (error: unknown) => {
      const failure = describeTranscriptError(error);
      assert.equal(failure.cause, "limit_chunks");
      assert.equal(failure.limit?.allowed, transcriptLimits.chunks);
      assert.ok(failure.limit!.actual > transcriptLimits.chunks);
      return true;
    },
    "too many chunks is its own cause, not a shared message",
  );
  assert.throws(
    () => chunkCaptions([line("word ".repeat(1300), 0)]),
    (error: unknown) => {
      const failure = describeTranscriptError(error);
      assert.equal(failure.cause, "limit_unit");
      assert.equal(failure.limit?.allowed, transcriptLimits.unitCharacters);
      assert.match(failure.summary, /6,000/);
      return true;
    },
    "one oversized chunk is a different cause from too many chunks",
  );
});
test("the line and character caps report the measured value", () => {
  const manyLines = Array.from({ length: transcriptLimits.lines + 1 }, (_, i) =>
    line("A sentence.", i),
  );
  assert.throws(
    () => chunkCaptions(manyLines),
    (error: unknown) => {
      const failure = describeTranscriptError(error);
      assert.equal(failure.cause, "limit_lines");
      assert.equal(failure.limit?.actual, transcriptLimits.lines + 1);
      return true;
    },
  );
  assert.throws(
    () => chunkCaptions([]),
    /readable/,
    "an empty track is not a limit breach",
  );
});
test("the limits shown before a run match the limits enforced", () => {
  const shown = limitNotes.map((n) => n.value.replace(/[^\d]/g, ""));
  for (const value of [
    transcriptLimits.lines,
    transcriptLimits.characters,
    transcriptLimits.chunks,
    transcriptLimits.unitCharacters,
  ])
    assert.ok(
      shown.includes(String(value)),
      `${value} is enforced but not shown to the reader`,
    );
  assert.equal(limitNotes.length, 6);
});
