# Security

This playground handles one real credential: a **TypeSafe API key**, read on the server from `TYPESAFE_API_KEY` (or supplied per-request by a visitor through the `x-typesafe-api-key` header as their own personal key). Everything below exists so that key never lands in a commit, a log, a response, or the browser bundle.

## Reporting

**Report privately.** Use [GitHub private vulnerability reporting](https://github.com/TypeSafeAI/typesafe-playground/security/advisories/new) for anything that could expose a key, bypass the SSRF defenses, widen a payload limit, or let a visitor's personal key reach anyone but the upstream API. Do not open a public issue for it.

**If a key leaks, rotate it first.** Then tell us. Rewriting git history does not un-leak a key; the rotation is the fix.

**Scope note.** Questions about the Jev model or the TypeSafe API itself belong with [TypeSafe AI's official channels](https://typesafe.ai). This is a community project.

## What stops a secret from leaving

| Layer | Where | What it does |
| --- | --- | --- |
| `pre-commit` hook | your machine (`.githooks/`, installed by `pnpm install`) | `scripts/check-secrets.mjs` blocks staged `.env` files and well-known key shapes with no dependencies; also runs `gitleaks protect --staged` if you have it (`brew install gitleaks`) |
| `.gitignore` | your machine | `.env`, `.env.*` except the two committed files below; competing lockfiles |
| CI `secret-scan` job | every push and PR | the built-in check over all tracked files plus **gitleaks** (pinned release, checksum-verified) over full history; a hit fails the build |
| GitHub secret scanning + **push protection** | the remote | known provider tokens are rejected at push time; alerts for anything that slips through |

Also on: Dependabot alerts and security updates, a `main` ruleset (no force-push, no deletion), read-only `GITHUB_TOKEN`, actions pinned to commit SHAs, `persist-credentials: false` on checkout.

## The two committed env files

- `.env.example` — placeholders only. Copy to `.env.local` (ignored) and fill in.
- `.env.1password` — **1Password references** (`op://Development/Jev API Key/password`), not values. `pnpm dev:op` runs the app through `op run`, which expands them at launch so no key ever sits in a file. The secret check knows this file is allowed; it still fails if a literal value is ever put in it.

## Key handling in the app

- The key is read on the server only (`lib/serverJev.ts`, the Python server, the CLI scripts). It is never prefixed `NEXT_PUBLIC_`, never returned in a response body, and error text is redacted before it reaches the client.
- A visitor's personal key (browser header override) is used for that request and not stored server-side. Browser `localStorage` is not a secret vault; the UI masks it and offers removal.
- Automated tests never call the live provider and never consume shared credits.

Bypassing the hook with `--no-verify` is for false positives only. If the thing it caught is real, rotate it.
