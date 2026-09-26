# AST-aware governance

Open `/governance/ast-governance` to trace a proposed change through a supplied symbol index. **Analyze changes** runs local parsing and deterministic checks. **Classify with Jev** submits focused, closed-set questions for ambiguous findings. **Run mock demo** performs the full walkthrough with labeled mock predictions and no API call.

The demo adds `organizationId` to `createUser`, updates the registration caller, leaves the invitation caller unchanged, touches authentication code, and changes no tests. Its recommendation is `needs_review`: owner review, caller compatibility, and test evidence remain unresolved.

## Read the result

The top card explains the recommendation and next step. Before/after signatures show interface changes. The dependency graph reads as “caller uses function”; purple nodes changed in the diff. Select a node for its path and parameters, or expand the text connections. Unchanged callers are questions to investigate, not proven bugs.

Every policy finding includes why it matters, what to do next, and links to the original diff hunks. Jev labels have separate confidence and selected-label probability scores. Both must meet the threshold; a high model score cannot remove a deterministic finding. Editing input invalidates previous results. Exports preserve the analysis, source evidence, prediction provenance, and simulated cache state.

## Input and limits

The diff parser accepts unified diffs with up to 512 KB, 100 files and 200 hunks. Oversized or incomplete hunks require human review. The mock parser recognizes simple named functions, parenthesized arrow functions, classes, parameters and imports. It observes direct call names but only explicit manifest relationships establish call edges; unindexed calls require more context. Multiple functions in one hunk, member calls, unresolved names and complex signatures require compiler-backed analysis. It does not execute code or inspect a checked-out repository.

The optional manifest is JSON with `symbols`, `tests`, `complete`, and `environmentHash`. Each symbol has `id`, `filePath`, `kind`, `name`, and optionally `parameters`, `calls`, `imports`, `exported`, `hash`, `startLine`, and `endLine`. Calls preferably reference exact symbol IDs. Tests map `filePath` to `symbolIds`. Limits: 100 input symbols, 100 test mappings, 200 resulting nodes and 500 edges. `complete: true` is a user-supplied assertion for this simulation, not independently verified repository coverage.

Optional policy is an array of at most 20 rules:

```json
[
  {
    "id": "auth_owner",
    "kind": "protected_path",
    "paths": ["src/auth/*"],
    "description": "Auth changes require owner review."
  }
]
```

Kinds: `protected_path`, `test_requirement`, `security`, `style`. Optional `symbols` restricts matching IDs or names. Only matching rules activate. Built-in sensitive-file, protected-path, API and test checks cannot be disabled. Repository rules are review requirements; Jev never interprets them as authority to merge.

## Classification and routing

Jev receives PR metadata, compact impact/graph data, activated rules, deterministic findings, and one original hunk per focused question. Up to three requests run concurrently. Outcomes are `safe_change`, `possible_breaking_change`, `missing_test_coverage`, `security_or_policy_risk`, `needs_human_review`, and `needs_more_context`. No code, comments, call sites, tests or policies are generated.

Sensitive environment/credential file changes produce `block_candidate` before any Jev call. Other deterministic findings or uncertain, missing, failed or cancelled classifications produce `needs_review`. `merge_candidate` only means no remaining finding within this supplied mock snapshot; normal review and CI still apply.

## Simulated test cache

Test scope comes solely from manifest mappings. **Simulate verified test run** records a mock snapshot; it runs no tests. A later match requires the same relevant symbol/dependency hashes, diff, graph edges, policy, environment hash and test scope. Missing context requires human confirmation. A changed snapshot suggests rerunning tests. A matching snapshot shows a simulated skip, never bypassing governance findings. Use real CI verification before relying on a cache in production.

The modular implementation is in `lib/{parseDiff,buildSymbolGraph,analyzeImpact,selectRelevantPolicies,evaluateHardRules,classifyWithJev,resolveReviewStatus,testCache}.ts`, with types in `types/` and presentation in `components/AstGovernanceLab.tsx`, `DiffInput.tsx`, `ImpactGraph.tsx`, `PolicyFindings.tsx`, and `ReviewResults.tsx`.
