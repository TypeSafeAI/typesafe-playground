import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateNeweggBrowserUrl,
  requireLocalBrowser,
} from "../lib/localBrowser";
test("local browser accepts observed Newegg product slugs and listing URLs only", () => {
  for (const url of [
    "https://www.newegg.com/p/pl?d=AM5",
    "https://www.newegg.com/p/N82E16814150900",
    "https://www.newegg.com/xfx-swift-rx-97tswf3b9-radeon-rx-9070-xt-16gb-graphics-card-triple-fans/p/N82E16814150900?Item=123",
  ])
    assert.doesNotThrow(() => validateNeweggBrowserUrl(url));
  for (const url of [
    "http://www.newegg.com/p/pl",
    "https://evil.example/p/pl",
    "https://www.newegg.com/account",
    "https://user:pass@www.newegg.com/p/pl",
    "https://www.newegg.com/p/pl/evil",
  ])
    assert.throws(() => validateNeweggBrowserUrl(url));
});
test("local browser refuses hosted and cross-origin access", () => {
  assert.throws(() =>
    requireLocalBrowser(new Request("https://example.com/api/local-browser")),
  );
  assert.throws(() =>
    requireLocalBrowser(
      new Request("http://localhost/api/local-browser", {
        headers: { origin: "https://evil.example" },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    requireLocalBrowser(
      new Request("http://localhost/api/local-browser", {
        headers: { origin: "http://localhost" },
      }),
    ),
  );
});

test("local browser validates the actual loopback Host when Next canonicalizes the URL", () => {
  for (const host of ["localhost:3121", "127.0.0.1:3121", "[::1]:3121"]) {
    assert.doesNotThrow(
      () =>
        requireLocalBrowser(
          new Request("http://localhost:3121/api/local-browser", {
            headers: {
              host,
              origin: `http://${host}`,
              "sec-fetch-site": "same-origin",
            },
          }),
        ),
      host,
    );
  }
});

test("local browser does not trust public Hosts, forwarded hosts, or another origin", () => {
  for (const headers of [
    { host: "public.example", origin: "http://public.example" },
    { host: "public.example" },
    { host: "127.0.0.1:3121", origin: "http://127.0.0.1:3000" },
    { host: "127.0.0.1:3121", origin: "http://localhost:3121" },
    { host: "127.0.0.1:3121", origin: "https://evil.example" },
    { host: "127.0.0.1:3121", origin: "null" },
    { host: "127.0.0.1:3121", "sec-fetch-site": "cross-site" },
    { host: "public.example", "x-forwarded-host": "localhost:3121" },
    {
      host: "127.0.0.1:3121",
      origin: "http://localhost:3121",
      "x-forwarded-host": "localhost:3121",
    },
    { host: "localhost:3121/path" },
    { host: "user@localhost:3121" },
  ]) {
    assert.throws(() =>
      requireLocalBrowser(
        new Request("http://localhost:3121/api/local-browser", {
          headers: headers as Record<string, string>,
        }),
      ),
    );
  }
  assert.throws(() =>
    requireLocalBrowser(
      new Request("https://public.example/api/local-browser", {
        headers: { host: "localhost", origin: "https://localhost" },
      }),
    ),
  );
});

test("hosted execution remains unavailable even with loopback request headers", () => {
  const previous = process.env.VERCEL;
  try {
    process.env.VERCEL = "1";
    assert.throws(() =>
      requireLocalBrowser(
        new Request("http://localhost:3121/api/local-browser", {
          headers: { host: "127.0.0.1:3121", origin: "http://127.0.0.1:3121" },
        }),
      ),
    );
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});

test("retired public research routes cannot spend text-model credits", async () => {
  const helper = await import("../app/api/text-helper/route");
  const research = await import("../app/api/browser-research/route");
  assert.equal(helper.POST().status, 410);
  assert.equal(research.POST().status, 410);
  assert.deepEqual(await helper.GET().json(), {
    configured: false,
    model: null,
  });
});
