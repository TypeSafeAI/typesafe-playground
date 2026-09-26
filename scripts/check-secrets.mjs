#!/usr/bin/env node
/**
 * Dependency-free secret check for staged files (pre-commit) or a path list (CI).
 * It is a floor, not the ceiling: gitleaks runs in CI and GitHub push protection
 * runs on the remote. This exists so a commit made on a machine without gitleaks
 * still gets the obvious cases stopped before they leave the laptop.
 *
 *   node scripts/check-secrets.mjs --staged          # pre-commit
 *   node scripts/check-secrets.mjs <file> [<file>…]  # explicit
 *   node scripts/check-secrets.mjs --all             # every tracked file
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/],
  ["GitHub fine-grained PAT", /\bgithub_pat_[A-Za-z0-9_]{80,}\b/],
  ["OpenAI-style key", /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_\-]{20,}\b/],
  ["Anthropic key", /\bsk-ant-[A-Za-z0-9_\-]{20,}\b/],
  ["AWS access key id", /\bAKIA[0-9A-Z]{16}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9\-]{10,}\b/],
  ["Private key block", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/],
  ["TypeSafe key assigned inline", /TYPESAFE_API_KEY\s*[:=]\s*["']?(?!op:\/\/)(?!\$)(?!<)(?!your\b)(?!xxx)[A-Za-z0-9_\-.]{16,}/i],
  ["Bearer literal", /authorization["']?\s*[:=]\s*["']?bearer\s+(?!\$)(?!<)(?!\{)[A-Za-z0-9_\-.=]{20,}/i],
  [".env file staged", null], // handled by path check
];
/** Values that announce themselves as fake using explicit marker boundaries. */
const SYNTHETIC = /(^|[^A-Za-z0-9_])(test|synthetic|example|placeholder|dummy|fake|unused|sample|your-?key|changeme|redacted|xxx)([^A-Za-z0-9_]|$)/i;
const ENV_PATH = /(^|\/)\.env(\..+)?$/;
const ENV_ALLOW = /(^|\/)\.env\.(example|1password)$/; // .env.1password holds op:// references, never values
const SKIP = /^(pnpm-lock\.yaml|package-lock\.json|.*\.svg|.*\.png|.*\.jpg|.*\.webp|.*\.gif|.*\.woff2?|.*\.lock)$/;

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function targets(argv) {
  if (argv.includes("--staged"))
    return git("diff", "--cached", "--name-only", "--diff-filter=ACMR").split("\n").filter(Boolean);
  if (argv.includes("--all")) return git("ls-files").split("\n").filter(Boolean);
  return argv.filter((a) => !a.startsWith("--"));
}

function staged(path) {
  try {
    return execFileSync("git", ["show", `:${path}`], { encoding: "utf8" });
  } catch {
    return readFileSync(path, "utf8");
  }
}

const isStaged = process.argv.includes("--staged");
const findings = [];
for (const path of targets(process.argv.slice(2))) {
  if (ENV_PATH.test(path) && !ENV_ALLOW.test(path)) {
    findings.push(`${path}: .env files are never committed (only .env.example and .env.1password)`);
    continue;
  }
  if (SKIP.test(path)) continue;
  let text;
  try {
    text = isStaged ? staged(path) : readFileSync(path, "utf8");
  } catch {
    continue;
  }
  const lines = text.split("\n");
  for (const [name, re] of PATTERNS) {
    if (!re) continue;
    lines.forEach((line, i) => {
      const m = re.exec(line);
      if (!m) return;
      // A private-key block is never synthetic; everything else may be a labelled fixture.
      if (!name.startsWith("Private key") && SYNTHETIC.test(m[0])) return;
      findings.push(`${path}:${i + 1}: looks like a ${name}`);
    });
  }
}

if (findings.length) {
  console.error("\n✖ Possible secret(s) — commit blocked:\n");
  for (const f of findings) console.error("  " + f);
  console.error(
    "\nIf this is a false positive, fix the text so it is unambiguous (placeholders like <your-key>, $ENV, or op:// references pass).\nNever bypass with --no-verify for a real key: rotate it first.\n",
  );
  process.exit(1);
}
console.log(`✔ secret check: ${isStaged ? "staged files" : "inputs"} clean`);
