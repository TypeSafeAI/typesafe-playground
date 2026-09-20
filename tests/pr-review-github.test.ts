import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGitHubPrUrl,
  loadGitHubPullRequest,
} from "../src/pr-review/github";
import { POST } from "../app/api/pull-request/route";
test("GitHub loader accepts only canonical public GitHub PR URLs", () => {
  assert.deepEqual(
    parseGitHubPrUrl(
      "https://github.com/TypeSafeAI/typesafe-playground/pull/5/files",
    ),
    { owner: "TypeSafeAI", repo: "typesafe-playground", number: "5" },
  );
  for (const url of [
    "http://github.com/a/b/pull/1",
    "https://github.com.evil.test/a/b/pull/1",
    "https://user@github.com/a/b/pull/1",
    "https://127.0.0.1/a/b/pull/1",
    "https://github.com/a/b/issues/1",
  ])
    assert.throws(() => parseGitHubPrUrl(url));
});
test("missing GitHub patches stay in the file inventory and cannot skip review", async () => {
  const metadata = {
    title: "Binary",
    body: "",
    head: { sha: "abc" },
    base: { sha: "def", repo: { private: false } },
    changed_files: 1,
  };
  const fetcher = async (url: string | URL | Request) =>
    Response.json(
      String(url).includes("/files?")
        ? [{ filename: "logo.png", status: "modified" }]
        : metadata,
    );
  const parsed = await loadGitHubPullRequest(
    "https://github.com/a/b/pull/1",
    undefined,
    fetcher as typeof fetch,
  );
  assert.equal(parsed.files[0].path, "logo.png");
  assert.equal(parsed.files[0].hunks[0].complete, false);
});
test("GitHub snapshot races and incomplete file inventories reject the load", async () => {
  let reads = 0;
  const meta = {
    title: "X",
    body: "",
    head: { sha: "a" },
    base: { sha: "b", repo: { private: false } },
    changed_files: 1,
  };
  const fetcher = async (url: string | URL | Request) =>
    Response.json(
      String(url).includes("/files?")
        ? [{ filename: "a.ts", status: "modified" }]
        : { ...meta, head: { sha: ++reads === 1 ? "a" : "new" } },
    );
  await assert.rejects(
    loadGitHubPullRequest(
      "https://github.com/a/b/pull/1",
      undefined,
      fetcher as typeof fetch,
    ),
    /changed while/,
  );
  await assert.rejects(
    loadGitHubPullRequest("https://github.com/a/b/pull/1", undefined, (async (
      url: any,
    ) =>
      Response.json(
        String(url).includes("/files?") ? [] : meta,
      )) as typeof fetch),
    /incomplete/,
  );
});
test("PR endpoint rejects cross-origin requests and invalid URLs before networking", async () => {
  assert.equal(
    (
      await POST(
        new Request("https://example.test/api/pull-request", {
          method: "POST",
          headers: {
            origin: "https://evil.test",
            "content-type": "application/json",
          },
          body: JSON.stringify({ url: "https://github.com/a/b/pull/1" }),
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await POST(
        new Request("https://example.test/api/pull-request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: "https://localhost/x" }),
        }),
      )
    ).status,
    400,
  );
});

test("valid-looking but partial GitHub patches remain human-review evidence", async () => {
  const metadata = {
    title: "Partial",
    body: "",
    head: { sha: "a" },
    base: { sha: "b", repo: { private: false } },
    changed_files: 1,
  };
  const fetcher = async (url: any) =>
    Response.json(
      String(url).includes("/files?")
        ? [
            {
              filename: "a.ts",
              status: "modified",
              additions: 5,
              deletions: 5,
              patch: "@@ -1 +1 @@\n-old\n+new",
            },
          ]
        : metadata,
    );
  const parsed = await loadGitHubPullRequest(
    "https://github.com/a/b/pull/1",
    undefined,
    fetcher as typeof fetch,
  );
  assert.equal(parsed.files[0].hunks[0].complete, false);
});
