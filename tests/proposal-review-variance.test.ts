import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("the shared decision table preserves the four historical canonical receipt sweeps", () => {
  const output = execFileSync(process.execPath, ["--import", "tsx", "scripts/proposal-review-variance.ts"], {
    cwd: new URL("..", import.meta.url), encoding: "utf8",
  });
  const rows = output.split("\n").filter((line) => /^\| 0\.[5-9]\d(?: \(current\))? \|/.test(line));
  assert.deepEqual(rows, [
    "| 0.50 | 72/80 | 0/80 | — |",
    "| 0.55 | 72/80 | 0/80 | — |",
    "| 0.60 | 71/80 | 0/80 | — |",
    "| 0.65 | 67/80 | 0/80 | — |",
    "| 0.70 | 64/80 | 0/80 | — |",
    "| 0.75 | 64/80 | 0/80 | — |",
    "| 0.80 (current) | 62/80 | 0/80 | — |",
    "| 0.85 | 34/80 | 0/80 | — |",
    "| 0.90 | 28/80 | 0/80 | — |",
  ]);
});
