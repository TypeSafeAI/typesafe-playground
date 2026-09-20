import { test } from "node:test";
import assert from "node:assert/strict";
import { safeMarkdownBlocks } from "../lib/markdown";

const DOCS = "https://docs.typesafe.ai/api/rate-limits";

/** Collects every link URL the renderer would put in an href. */
function links(blocks: ReturnType<typeof safeMarkdownBlocks>): string[] {
  const found: string[] = [];
  const walk = (list: typeof blocks) => {
    for (const block of list) {
      for (const span of block.content ?? [])
        if (span.styles?.link?.url) found.push(span.styles.link.url);
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
  return found;
}

test("hostile URL schemes never reach an href, but their text survives", () => {
  const hostile = [
    "[click](javascript:alert(1))",
    "[click](JaVaScRiPt:alert(1))",
    "[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
    "[click](vbscript:msgbox(1))",
    // Leading whitespace and embedded control characters are classic filter
    // bypasses; written as escapes so this file stays readable text.
    "[click](\u0000javascript:alert(1))",
    "[click]( javascript:alert(1))",
  ];
  for (const markdown of hostile) {
    const blocks = safeMarkdownBlocks(markdown, DOCS);
    assert.deepEqual(links(blocks), [], `scheme survived in: ${markdown}`);
    // Dropping the link must not drop the evidence.
    const text = blocks
      .flatMap((b) => b.content ?? [])
      .map((s) => s.text)
      .join("");
    assert.match(text, /click/, `link text lost in: ${markdown}`);
  }
});

test("relative documentation links resolve against their source document", () => {
  const blocks = safeMarkdownBlocks(
    "See [Handling rate limits](/api/handling-rate-limits) and [SDKs](../sdk).",
    DOCS,
  );
  assert.deepEqual(links(blocks), [
    "https://docs.typesafe.ai/api/handling-rate-limits",
    "https://docs.typesafe.ai/sdk",
  ]);
});

test("a relative link with no source document is dropped rather than pointed at this app", () => {
  // Left relative it would resolve against the playground's own origin and
  // link to a route that does not exist here.
  assert.deepEqual(links(safeMarkdownBlocks("[SDKs](/sdk)")), []);
});

test("ordinary http and https links are preserved", () => {
  const blocks = safeMarkdownBlocks(
    "[docs](https://docs.typesafe.ai/x) and [plain](http://example.com/y)",
    DOCS,
  );
  assert.deepEqual(links(blocks), [
    "https://docs.typesafe.ai/x",
    "http://example.com/y",
  ]);
});

test("an image with an unsafe source stops being an image", () => {
  const [block] = safeMarkdownBlocks("![alt](javascript:alert(1))", DOCS);
  assert.notEqual(block.type, "image");
});

test("an image with a relative source resolves against the document", () => {
  const [block] = safeMarkdownBlocks("![alt](/img/diagram.png)", DOCS);
  assert.equal(block.type, "image");
  assert.equal(
    (block.props as { url?: string }).url,
    "https://docs.typesafe.ai/img/diagram.png",
  );
});

test("empty and whitespace-only markdown render nothing at all", () => {
  assert.deepEqual(safeMarkdownBlocks(""), []);
  assert.deepEqual(safeMarkdownBlocks("   \n\t "), []);
});

test("markdown structure from real documentation survives scrubbing", () => {
  const blocks = safeMarkdownBlocks(
    "**Price:** Charged per input token.\n\n* Btok is a billion tokens\n* Mtok is a million tokens",
    DOCS,
  );
  assert.equal(blocks[0].type, "paragraph");
  assert.equal(blocks[0].content?.[0].styles?.bold, true);
  assert.equal(blocks[1].type, "bulletList");
});
