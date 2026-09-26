const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const sourceScript = resolve(__dirname, "../scripts/check-secrets.mjs");

function sh(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "check-secrets-"));
  mkdirSync(join(root, "scripts"));
  copyFileSync(sourceScript, join(root, "scripts/check-secrets.mjs"));
  sh(root, "init");
  sh(root, "config", "user.name", "test");
  sh(root, "config", "user.email", "test@example.com");
  writeFileSync(join(root, "README.md"), "test\n");
  sh(root, "add", "README.md");
  sh(root, "commit", "-m", "init");
  return root;
}

function runCheck(cwd, args) {
  return spawnSync(process.execPath, ["scripts/check-secrets.mjs", ...args], {
    cwd,
    encoding: "utf8",
  });
}

test("explicit path mode flags real-shaped inline TypeSafe values", () => {
  const root = makeRepo();
  try {
    writeFileSync(join(root, "fixture.txt"), "TYPESAFE_API_KEY=contestabcdefghijklmnop\n");
    const result = runCheck(root, ["fixture.txt"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /looks like a TypeSafe key assigned inline/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--staged mode inspects index content", () => {
  const root = makeRepo();
  try {
    writeFileSync(join(root, "staged.txt"), "authorization: bearer abcdefghijklmnopqrstuvwxyz123456\n");
    sh(root, "add", "staged.txt");
    writeFileSync(join(root, "staged.txt"), "clean now\n");
    const result = runCheck(root, ["--staged"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /staged\.txt:1: looks like a/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--all scans tracked files and enforces env file policy with exceptions", () => {
  const root = makeRepo();
  try {
    writeFileSync(join(root, ".env.example"), "TYPESAFE_API_KEY=op://vault/item/field\n");
    writeFileSync(join(root, ".env.1password"), "TYPESAFE_API_KEY=op://vault/item/field\n");
    sh(root, "add", ".env.example", ".env.1password");
    let result = runCheck(root, ["--all"]);
    assert.equal(result.status, 0, result.stderr);

    writeFileSync(join(root, ".env.local"), "TYPESAFE_API_KEY=<your-key>\n");
    sh(root, "add", ".env.local");
    result = runCheck(root, ["--all"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\.env\.local: \.env files are never committed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("synthetic labels require marker boundaries and still allow explicit fixtures", () => {
  const root = makeRepo();
  try {
    writeFileSync(join(root, "synthetic.txt"), "TYPESAFE_API_KEY=test-server-only-secret\n");
    let result = runCheck(root, ["synthetic.txt"]);
    assert.equal(result.status, 0, result.stderr);

    writeFileSync(join(root, "synthetic.txt"), "TYPESAFE_API_KEY=contestabcdefghijklmnop\n");
    result = runCheck(root, ["synthetic.txt"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /looks like a TypeSafe key assigned inline/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports multiple findings in one file", () => {
  const root = makeRepo();
  try {
    writeFileSync(
      join(root, "many.txt"),
      ["authorization: bearer abcdefghijklmnopqrstuvwxyz123456", "authorization: bearer zyxwvutsrqponmlkjihgfedcba654321"].join("\n"),
    );
    const result = runCheck(root, ["many.txt"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /many\.txt:1: looks like a/);
    assert.match(result.stderr, /many\.txt:2: looks like a/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
