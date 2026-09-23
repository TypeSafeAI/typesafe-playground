/**
 * Unified-diff parsing used by the proposal validator. Pure; no I/O.
 *
 * Extracted from TypeSafeAI/typesafe-playground `src/pr-review/parse.ts`
 * (`parsePullRequest`) at 6fe5967dc020521a0731682b06c4d8eeeab95ffb, which the
 * playground validator imports. Only the diff handling is kept: the pull-request
 * title/description fields are not part of a proposal. Parsing logic, limits,
 * and hunk issue messages are unchanged so reject reasons stay identical.
 */

export const MAX_DIFF_BYTES = 512 * 1024;
export const MAX_HUNKS = 200;

export interface DiffHunk {
  id: string;
  path: string;
  previousPath: string | undefined;
  header: string;
  diff: string;
  oldStart: number;
  newStart: number;
  complete: boolean;
  issue?: string;
}

export interface DiffFile {
  path: string;
  previousPath: string | undefined;
  hunks: DiffHunk[];
}

function pathValue(raw: string, prefixed = true): string {
  const value = raw.split("\t")[0] ?? "";
  // JSON-compatible quoted paths are supported; unsupported Git octal escapes fail closed.
  const decoded: unknown = value.startsWith('"') ? JSON.parse(value) : value;
  if (typeof decoded !== "string" || decoded.length > 1024 || /[\x00-\x1f]/.test(decoded))
    throw Error("Unsupported file path.");
  return prefixed ? decoded.replace(/^[ab]\//, "") : decoded;
}

/** Split a unified diff into files and hunks, or throw on unsupported input. */
export function parseUnifiedDiff(diff: string): { files: DiffFile[] } {
  if (typeof diff !== "string" || new TextEncoder().encode(diff).length > MAX_DIFF_BYTES)
    throw Error("Paste a diff of at most 512 KB.");
  const normalized = diff.replace(/\r\n/g, "\n");
  if (/^diff --(?:cc|combined) /m.test(normalized))
    throw Error("Combined merge diffs are unsupported. Paste a standard unified diff.");
  let blocks = normalized
    .split(/(?=^diff --git )/m)
    .filter((block) => block.startsWith("diff --git "));
  if (!blocks.length && normalized.startsWith("--- "))
    blocks = normalized.split(/(?=^--- .+\n\+\+\+ )/m);
  if (!blocks.length || blocks.length > 100)
    throw Error("Use a unified diff with 1–100 files.");
  const files: DiffFile[] = blocks.map((block, fileIndex) => {
    const lines = block.split("\n");
    const first = lines[0] ?? "";
    const firstHunk = lines.findIndex((line) => line.startsWith("@@"));
    const metadata = lines.slice(0, firstHunk < 0 ? lines.length : firstHunk);
    const oldLine = metadata.find((line) => line.startsWith("--- "));
    const newLine = metadata.find((line) => line.startsWith("+++ "));
    const renameFrom = metadata.find((line) => line.startsWith("rename from "))?.slice(12);
    const renameTo = metadata.find((line) => line.startsWith("rename to "))?.slice(10);
    const headerPaths = /^diff --git a\/(.+) b\/(.+)$/.exec(first);
    const quotedPaths = /^diff --git ("(?:\\.|[^"\\])*") ("(?:\\.|[^"\\])*")$/.exec(first);
    const oldPath = pathValue(
      renameFrom ||
        oldLine?.slice(4) ||
        (headerPaths ? `a/${headerPaths[1]}` : undefined) ||
        quotedPaths?.[1] ||
        "unknown",
      !renameFrom,
    );
    const newPath = pathValue(
      renameTo ||
        newLine?.slice(4) ||
        (headerPaths ? `b/${headerPaths[2]}` : undefined) ||
        quotedPaths?.[2] ||
        "unknown",
      !renameTo,
    );
    const path = newPath === "/dev/null" ? oldPath : newPath;
    const previousPath = oldPath !== path && oldPath !== "/dev/null" ? oldPath : undefined;
    const starts = lines.flatMap((line, i) => (line.startsWith("@@") ? [i] : []));
    const hunks: DiffHunk[] = starts.map((start, index) => {
      const raw = lines.slice(start, starts[index + 1] ?? lines.length);
      while (raw.at(-1) === "") raw.pop();
      const header = raw[0] ?? "";
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(header);
      const body = raw.slice(1).filter((line) => !line.startsWith("\\ No newline at end of file"));
      const oldCount = body.filter((line) => /^[ -]/.test(line)).length;
      const newCount = body.filter((line) => /^[ +]/.test(line)).length;
      const valid =
        !!match &&
        oldCount === Number(match[2] ?? 1) &&
        newCount === Number(match[4] ?? 1) &&
        body.every((line) => /^[ +\-]/.test(line));
      const text = raw.join("\n");
      const complete = valid && text.length <= 12000 && path !== "unknown";
      return {
        id: `f${fileIndex}-h${index}`,
        path,
        previousPath,
        header,
        diff: text,
        oldStart: Number(match?.[1] || 0),
        newStart: Number(match?.[3] || 0),
        complete,
        ...(!complete
          ? {
              issue:
                text.length > 12000
                  ? "Hunk exceeds the 12,000-character classifier limit; preserved for human review."
                  : "Incomplete or unsupported hunk; review the original diff.",
            }
          : {}),
      };
    });
    if (!hunks.length)
      hunks.push({
        id: `f${fileIndex}-metadata`,
        path,
        previousPath,
        header: "File metadata / no text patch",
        diff: block.trimEnd(),
        oldStart: 0,
        newStart: 0,
        complete: false,
        issue: "Binary, rename-only, mode-only, or unavailable patch. Human review required.",
      });
    return { path, previousPath, hunks };
  });
  if (files.reduce((n, file) => n + file.hunks.length, 0) > MAX_HUNKS)
    throw Error("This prototype supports at most 200 hunks. Use a smaller diff.");
  return { files };
}
