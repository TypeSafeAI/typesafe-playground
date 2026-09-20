/**
 * Deterministic checks that run before Jev is consulted. A failure here is a
 * `reject`; Jev never sees the proposal.
 */
import { z } from "zod";
import { parsePullRequest } from "../../src/pr-review/parse";
import { PROPOSAL_TOOLS, type Proposal, type ValidationResult } from "./types";

export const MAX_PATCH_CHARS = 20_000;

export const proposalSchema = z.strictObject({
  tool: z.enum(PROPOSAL_TOOLS),
  path: z.string().min(1).max(200),
  patch: z.string().max(MAX_PATCH_CHARS).optional(),
  rationale: z.string().min(1).max(2_000),
  evidence: z.array(z.string().max(2_000)).max(20),
});

/**
 * A path is inside the fixture root when it is relative, uses forward slashes,
 * has no empty or `.`/`..` segments, and names a file the fixture contains.
 */
export function checkPath(
  path: string,
  files: Record<string, string>,
): string[] {
  const errors: string[] = [];
  if (/[\x00-\x1f\\]/.test(path))
    errors.push("path contains control characters or backslashes");
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path))
    errors.push("path is absolute; only paths inside the fixture root are allowed");
  const segments = path.split("/");
  if (segments.some((s) => s === ".."))
    errors.push("path contains `..` and could escape the fixture root");
  if (segments.some((s) => s === "" || s === "."))
    errors.push("path has empty or `.` segments");
  if (!errors.length && !Object.hasOwn(files, path))
    errors.push(`path ${JSON.stringify(path)} is not a file in the fixture`);
  return errors;
}

/** The old side of every hunk must appear contiguously in the fixture file. */
function checkHunkContext(
  hunkDiff: string,
  fileContent: string,
): string | null {
  const body = hunkDiff
    .split("\n")
    .slice(1)
    .filter((line) => !line.startsWith("\\ No newline at end of file"));
  const oldLines = body
    .filter((line) => /^[ -]/.test(line))
    .map((line) => line.slice(1));
  if (!oldLines.length) return null;
  const fileLines = fileContent.replace(/\r\n/g, "\n").split("\n");
  outer: for (let i = 0; i + oldLines.length <= fileLines.length; i++) {
    for (let j = 0; j < oldLines.length; j++)
      if (fileLines[i + j] !== oldLines[j]) continue outer;
    return null;
  }
  return "patch context does not match the fixture file";
}

export function validateProposal(
  value: unknown,
  files: Record<string, string>,
): ValidationResult {
  const parsed = proposalSchema.safeParse(value);
  if (!parsed.success)
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (issue) =>
          `${issue.path.length ? issue.path.join(".") : "proposal"}: ${issue.message}`,
      ),
    };
  const proposal: Proposal = parsed.data;
  const errors = checkPath(proposal.path, files);
  if (proposal.tool === "read_file") {
    if (proposal.patch !== undefined)
      errors.push("read_file must not carry a patch");
    return { ok: !errors.length, errors };
  }
  if (proposal.patch === undefined || !proposal.patch.trim()) {
    errors.push("propose_patch requires a unified diff");
    return { ok: false, errors };
  }
  let parsedDiff;
  try {
    parsedDiff = parsePullRequest({ diff: proposal.patch });
  } catch (e) {
    errors.push(
      `patch does not parse: ${e instanceof Error ? e.message : "unknown error"}`,
    );
    return { ok: false, errors };
  }
  if (parsedDiff.files.length !== 1)
    errors.push(
      `patch touches ${parsedDiff.files.length} files; exactly one is allowed`,
    );
  const file = parsedDiff.files[0];
  if (file && file.path !== proposal.path)
    errors.push(
      `patch header names ${JSON.stringify(file.path)} but the proposal path is ${JSON.stringify(proposal.path)}`,
    );
  if (file?.previousPath) errors.push("renames are not allowed");
  if (file) {
    for (const hunk of file.hunks) {
      if (!hunk.complete) {
        errors.push(hunk.issue ?? "patch has an incomplete hunk");
        continue;
      }
      const content = files[proposal.path];
      if (parsedDiff.files.length === 1 && content !== undefined) {
        const mismatch = checkHunkContext(hunk.diff, content);
        if (mismatch) errors.push(mismatch);
      }
    }
  }
  return { ok: !errors.length, errors: [...new Set(errors)] };
}
