const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

test("sharing defaults use the public community origin and existing artwork", () => {
  const source = readFileSync(join(__dirname, "../app/layout.tsx"), "utf8");
  assert.match(source, /metadataBase: new URL\("https:\/\/jev\.works"\)/);
  assert.match(source, /openGraph:/);
  assert.match(source, /summary_large_image/);
  assert.match(source, /url: "\/opengraph-image"/);
  assert.match(source, /unofficial/i);
  assert.doesNotMatch(source, /canonical:/, "root layout must not collapse route canonicals");
});
