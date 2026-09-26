# PR Review lab

Open `/governance/pr-review`, paste a public GitHub PR URL or unified diff, and click **Review PR**. A URL loads the PR title, description, changed-file inventory, and patches automatically. **Preview changes** lets you inspect them before making a Jev request. Optional metadata, repository rules, and thresholds live in disclosures.

**Run mock demo** loads a fixture that changes an auth function, adds a required bypass parameter, and updates no tests. Mock results are explicitly labeled and make no API calls. **Review PR** replaces those fixtures with live classifications using the existing server-only `TYPESAFE_API_KEY` in `.env.local` or deployment settings.

## Pipeline

The TypeScript modules in `src/pr-review/` export:

- `parsePullRequest(input)`: parses a diff string or `{diff, title, description}` into files and original hunks. The separate public GitHub loader resolves URLs into this input, checks snapshot stability, and compares patch coverage against GitHub addition/deletion counts.
- `buildHunkCandidates(hunk, repoRules)`: builds fixed labels and path-relevant rule candidates. Both previous and current paths are checked on renames.
- `classifyHunkWithJev(hunk, candidates, context)`: seven independent Choice questions permit multiple labels. Each includes the label, `not_applicable`, `unknown`, and `needs_human_review`. A separate Choice selects only a supplied candidate rule. Every question is closed-set.
- `routeForReview(result, thresholds)`: uses the lower of the selected probability and model confidence. Missing or malformed scores, incomplete evidence, conflicting labels, and protected paths cannot pass the safe gate. Test requirements require human verification even if test files exist.
- `aggregateReviewResults(results, expectedCount)`: returns `approve_candidate`, `needs_review`, or `block_candidate`. Empty or unfinished runs cannot approve.
- `reviewPullRequest(...)`: processes three hunks concurrently and preserves per-hunk failures. Cancelled and queued hunks remain explicitly unclassified.

High-confidence security/API risks become candidate blocks for human confirmation. Only high-confidence safe/generated changes with no conflicting decision or mandatory rule can skip expensive review. Uncertain cases enter the LLM or human queue. Threshold edits reroute existing results locally.

The queue export contains only escalated hunks, their exact paths/diffs, the PR snapshot, rules, thresholds, and fixed-label results. It does not call another LLM, run code, create GitHub comments, approve, block, or merge a PR. Jev scores are classifier estimates, not verified correctness or calibrated bug probabilities.

## Rules

```json
[
  {
    "id": "auth_owner",
    "kind": "protected_path",
    "path": "src/auth*",
    "text": "An auth owner must review these changes."
  },
  {
    "id": "behavior_tests",
    "kind": "test_requirement",
    "path": "src/service.ts",
    "text": "Behavior changes need corresponding tests."
  }
]
```

Use `[]` for none. Supported kinds are `protected_path`, `test_requirement`, `security`, and `style`. Paths are case-sensitive exact matches or `*` globs. Rules are data and cannot change the closed-set output contract. A selected rule is an evidence reference, not proof of a violation.

## Limits

- Public `github.com` PRs only; no GitHub token or private-repository access.
- At most 100 files, 200 hunks, and 512 KB of diff per run.
- Hunks over 12,000 characters, missing/binary patches, malformed hunks, and mode/rename-only changes stay in the human queue. Nothing is silently truncated.
- Pasted diffs cannot prove full PR coverage. The app has no repository checkout, AST, existing-test inventory, or test execution in this lab.
- GitHub and Jev rate limits produce explicit errors; they never become approvals. Cancelling preserves coverage gaps.

API references: [GitHub pull requests](https://docs.github.com/en/rest/pulls/pulls) and [TypeSafe Choice responses](https://docs.typesafe.ai/introduction/quickstart).

## Decision trace

The results panel shows priority hunk routes under **Why this decision**, with selected labels, conservative scores, thresholds and the exact routing reason. **Trace to line** clears filters, opens the original hunk and scrolls to its evidence. The expanded hunk explains completeness, the lowest label/rule score, protected-path and test policies, and the final route. This trace uses stored classification data and deterministic routing reasons; it generates no review commentary.
