import test from "node:test";
import assert from "node:assert/strict";
import {
  videoId,
  chunkCaptions,
  cleanFillers,
  selectExtract,
  scoringPayload,
  readScores,
} from "../lib/youtubeExtract";
import { fetchTranscript } from "../lib/youtubeTranscript";
import { validatePayload } from "../lib/api";

test("accepts YouTube URL forms and rejects arbitrary hosts and credentials", () => {
  for (const url of [
    "https://youtu.be/abcdefghijk?t=1",
    "https://www.youtube.com/watch?v=abcdefghijk",
    "https://youtube.com/shorts/abcdefghijk",
  ])
    assert.equal(videoId(url), "abcdefghijk");
  for (const url of [
    "https://youtube.com.evil/watch?v=abcdefghijk",
    "http://localhost/",
    "https://evil@youtube.com/watch?v=abcdefghijk",
  ])
    assert.throws(() => videoId(url));
});
test("natural chunks retain caption provenance and split at punctuation, gaps and speakers", () => {
  const lines = [
    { text: "Um, Water stores", start: 0, duration: 1 },
    { text: "heat. Ice melts.", start: 1, duration: 1 },
    { text: ">> Pat: A different point", start: 5, duration: 1 },
    { text: "follows.", start: 6, duration: 1 },
  ];
  const chunks = chunkCaptions(lines);
  assert.deepEqual(
    chunks.map((c) => c.text),
    ["Water stores heat.", "Ice melts.", ">> Pat: A different point follows."],
  );
  assert.deepEqual(chunks[0].lineIds, [0, 1]);
  assert.equal(chunks[1].start, 1);
  assert.equal(
    cleanFillers("I like ice. So water is cold. You know the answer."),
    "I like ice. So water is cold. You know the answer.",
  );
  assert.equal(
    cleanFillers("Uh, I- I think, you know, ice melts."),
    "I think, ice melts.",
  );
});
test("deduplicates by score and selects chronologically without inserting words", () => {
  const chunks = chunkCaptions([
    { text: "Water stores heat.", start: 0, duration: 1 },
    { text: "Ice melts slowly.", start: 3, duration: 1 },
    { text: "Water stores heat.", start: 6, duration: 1 },
  ]).map((c, i) => ({
    ...c,
    score: [0.7, 0.8, 0.9][i],
    keyClaim: true,
    confidence: 0.8,
  }));
  const result = selectExtract(chunks, 100);
  assert.equal(result.text, "Ice melts slowly. Water stores heat.");
  assert.equal(result.reasons[0], "duplicate");
  assert.equal(result.kept.length, 2);
  assert.equal(selectExtract(chunks, 15).kept[0].start, 6);
  assert.equal(
    selectExtract(
      chunks.map((c) => ({ ...c, score: null })),
      100,
    ).kept.length,
    0,
  );
});
test("typed questions validate; malformed or missing answers remain unscored", () => {
  const c = chunkCaptions([
    { text: "Water stores heat.", start: 0, duration: 2 },
  ])[0];
  assert.equal(
    validatePayload(scoringPayload(c, "Water", [c])).questions.relevance.type,
    "score",
  );
  assert.deepEqual(
    readScores({
      answers: {
        relevance: { type: "score", score: 0.8 },
        key_claim: { type: "choice", choice: "yes", confidence: 0.9 },
      },
    }),
    { score: 0.8, keyClaim: true, confidence: 0.9 },
  );
  assert.equal(
    readScores({ answers: { relevance: { type: "score", score: 4 } } }).score,
    null,
  );
  assert.equal(
    readScores({ answers: { relevance: { type: "score", score: 0.8 } } })
      .keyClaim,
    null,
  );
});
test("fetches only fixed YouTube hosts, parses timestamped existing captions, rejects redirects and malicious track URLs", async () => {
  const player = (baseUrl: string) =>
    JSON.stringify({
      videoDetails: { title: "Water" },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [{ baseUrl, languageCode: "en" }],
        },
      },
    });
  const track = "https://www.youtube.com/api/timedtext?v=abcdefghijk";
  const calls: string[] = [];
  const fake = async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(
      calls.length === 1
        ? `var ytInitialPlayerResponse = ${player(track)};`
        : '<transcript><text start="0" dur="2">Water &amp; ice.</text></transcript>',
    );
  };
  const data = await fetchTranscript(
    "https://youtu.be/abcdefghijk",
    new AbortController().signal,
    fake as typeof fetch,
  );
  assert.equal(data.lines[0].text, "Water & ice.");
  assert.equal(data.lines[0].duration, 2);
  assert.equal(calls.length, 2);
  await assert.rejects(
    fetchTranscript(
      "https://youtu.be/abcdefghijk",
      new AbortController().signal,
      (async () =>
        new Response(
          `var ytInitialPlayerResponse = ${player("https://localhost/secret")};`,
        )) as typeof fetch,
    ),
    /caption|track/i,
  );
  await assert.rejects(
    fetchTranscript(
      "https://youtu.be/abcdefghijk",
      new AbortController().signal,
      (async () =>
        new Response("", {
          status: 302,
          headers: { location: "https://localhost" },
        })) as typeof fetch,
    ),
  );
});
test("uses public player metadata when available, without executing page scripts", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fake = (async (url: URL | string | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    if (requests.length === 1)
      return new Response('"INNERTUBE_API_KEY":"public_test_key"');
    if (requests.length === 2)
      return Response.json({
        videoDetails: { title: "Water" },
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [
              {
                baseUrl: "https://www.youtube.com/api/timedtext?v=abcdefghijk",
                languageCode: "en",
              },
            ],
          },
        },
      });
    return new Response(
      '<transcript><text start="0" dur="1">Water stores heat.</text></transcript>',
    );
  }) as typeof fetch;
  const data = await fetchTranscript(
    "https://youtu.be/abcdefghijk",
    new AbortController().signal,
    fake,
  );
  assert.equal(data.lines.length, 1);
  assert.equal(requests[1].init?.method, "POST");
  assert.equal(
    JSON.parse(requests[1].init?.body as string).videoId,
    "abcdefghijk",
  );
});

test("rejects invalid timing and oversized natural units without fixed slicing", () => {
  assert.throws(
    () => chunkCaptions([{ text: "   ", start: 0, duration: 1 }]),
    /readable/,
  );
  assert.throws(() =>
    chunkCaptions([{ text: "A sentence.", start: NaN, duration: 1 }]),
  );
  assert.throws(
    () =>
      chunkCaptions([{ text: "word ".repeat(1300), start: 0, duration: 1 }]),
    /6,000/,
  );
  assert.throws(
    () =>
      chunkCaptions(
        Array.from({ length: 201 }, (_, i) => ({
          text: "A sentence.",
          start: i,
          duration: 1,
        })),
      ),
    /200/,
  );
  const chunks = chunkCaptions([
    { text: "First thought", start: 0, duration: 1 },
    { text: "new thought", start: 4, duration: 1 },
  ]);
  assert.equal(chunks.length, 2);
});
test("API rejects cross-origin and invalid requests without network access", async () => {
  const { POST } = await import("../app/api/youtube-transcript/route");
  const request = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/youtube-transcript", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await POST(request({ url: "https://localhost/" }))).status,
    400,
  );
  assert.equal(
    (
      await POST(
        request(
          { url: "https://youtu.be/abcdefghijk" },
          { origin: "https://evil.example" },
        ),
      )
    ).status,
    403,
  );
  assert.equal((await POST(request({ url: "x".repeat(3000) }))).status, 400);
});

test("chunking preserves decimals and punctuation-only source material", () => {
  const chunks = chunkCaptions([
    { text: "The value is 3.14, not 2.5. Why? ...", start: 0, duration: 5 },
  ]);
  assert.equal(
    chunks.map((c) => c.original).join(" "),
    "The value is 3.14, not 2.5. Why? ...",
  );
});

test("keeps existing non-English captions in their source language without translation", async () => {
  let call = 0;
  const transport = (async () =>
    new Response(
      ++call === 1
        ? "var ytInitialPlayerResponse = " +
            JSON.stringify({
              captions: {
                playerCaptionsTracklistRenderer: {
                  captionTracks: [
                    {
                      baseUrl:
                        "https://www.youtube.com/api/timedtext?v=abcdefghijk&lang=es",
                      languageCode: "es",
                    },
                  ],
                },
              },
            }) +
            ";"
        : '<transcript><text start="0" dur="2">El agua almacena calor.</text></transcript>',
    )) as typeof fetch;
  const data = await fetchTranscript(
    "https://youtu.be/abcdefghijk",
    new AbortController().signal,
    transport,
  );
  assert.equal(data.language, "es");
  assert.equal(data.lines[0].text, "El agua almacena calor.");
});
