# Deployment configuration

Vercel project: `0xbuns/typesafe-ai-playground`.
Production: https://typesafe-ai-playground.vercel.app.

Set `TYPESAFE_API_KEY` as a sensitive server-only production environment variable.
Never use `NEXT_PUBLIC_TYPESAFE_API_KEY`. The app exposes a shared-key demo, so its
request limits belong at the edge, before serverless instances scale out.

The production Vercel Firewall uses these project-level, per-IP limits:

| Endpoint            | Fixed-window limit         |
| ------------------- | -------------------------- |
| `/api/run`          | 60 requests per 60 seconds |
| `/api/meme-image`   | 12 requests per 60 seconds |
| `/api/pull-request` | 6 requests per 60 seconds  |
| `/api/solve`        | 20 requests per 60 seconds |

The LangChain endpoint /api/langchain-route is limited to 30 requests per 60 seconds per IP.

To reproduce on a new linked project:

```sh
vercel firewall overview
vercel firewall diff
vercel firewall rules add 'Limit shared Jev API usage' \
  --condition '{"type":"path","op":"eq","value":"/api/run"}' \
  --action rate_limit --rate-limit-requests 60 --rate-limit-window 60 \
  --rate-limit-keys ip --yes
vercel firewall rules add 'Limit meme image downloads' \
  --condition '{"type":"path","op":"eq","value":"/api/meme-image"}' \
  --action rate_limit --rate-limit-requests 12 --rate-limit-window 60 \
  --rate-limit-keys ip --yes
vercel firewall rules add 'Limit public PR lookups' \
  --condition '{"type":"path","op":"eq","value":"/api/pull-request"}' \
  --action rate_limit --rate-limit-requests 6 --rate-limit-window 60 \
  --rate-limit-keys ip --yes
vercel firewall rules add 'Limit exact solver checks' \
  --condition '{"type":"path","op":"eq","value":"/api/solve"}' \
  --action rate_limit --rate-limit-requests 20 --rate-limit-window 60 \
  --rate-limit-keys ip --yes
vercel firewall rules add 'Limit LangChain routing invocations' \
  --condition '{"type":"path","op":"eq","value":"/api/langchain-route"}' \
  --action rate_limit --rate-limit-requests 30 --rate-limit-window 60 \
  --rate-limit-keys ip --yes
vercel firewall diff
vercel firewall publish --yes
```

Review existing rules and unpublished changes first; do not create duplicates or
publish unrelated changes. These are persistent edge limits, not an in-memory
counter that resets on cold starts. They do not authenticate users or establish a
global budget across IPs. Configure spending limits on your provider key for that.
Local development does not pass through the Vercel Firewall.

## Proposal review edge limit

Before exposing `/api/proposal-review` publicly, add an enabled Vercel Firewall
rule for that exact path: **30 requests per 60 seconds per IP**, using the
`fixed_window` algorithm and `rate_limit` action when exceeded. The edge's `ip`
key aggregates requests across serverless instances and API-key overrides; the
application must not infer the client IP from caller-supplied headers. This
path-level rule covers both mock and live POST requests.

Run from the linked project directory:

```sh
vercel firewall rules list
vercel firewall diff
vercel firewall rules add 'Limit proposal review invocations' \
  --condition '{"type":"path","op":"eq","value":"/api/proposal-review"}' \
  --action rate_limit --rate-limit-requests 30 --rate-limit-window 60 \
  --rate-limit-keys ip --yes
vercel firewall diff
# Publish only after confirming this is the sole pending change.
vercel firewall publish --yes
vercel firewall rules inspect 'Limit proposal review invocations'
vercel firewall diff
```

Skip creation if the rule already exists; inspect its path, enabled state,
algorithm, window, limit, key, and exceeded action instead. The final diff must
show no pending changes. Record the rule ID and readback time in the release or
PR evidence. Committing these instructions does not configure the remote
firewall. The transport's per-key, per-instance limiter remains a separate local
bound; neither limit grants permission or caps spending across all IPs.

## Browser-run routes on your own server

`/api/local-browser`, `/api/native-browser`, `/api/pc-build` and `/api/clean-room`
launch Chromium on the server through `uv` (`browser-use` pinned in
`lib/localBrowser.ts`). They accept same-origin requests from whichever host serves
the app, so a self-hosted server with `uv` and Chromium can run the browser agent,
native browser and clean-room workspaces. Requests whose `Origin` names another
host, and `sec-fetch-site: cross-site` fetches, are refused; forwarded headers are
ignored. The comparison is by host, not scheme, so a TLS-terminating proxy works.

Vercel serverless functions cannot spawn Chromium, so those routes refuse with an
explanation when `VERCEL` is set. On a self-hosted deployment the existing bounds
still apply: three concurrent browser sessions, three starts per minute, and the
shared-key controls above. Anyone who can reach the app can start a run, so put
the deployment behind your own access control before exposing it publicly.

`/api/meme-image` also restricts schemes, destinations, redirects, downloaded bytes,
and decoded pixels. It resolves each destination, rejects private/reserved IPs,
and pins the actual TLS connection to the validated address. No TypeSafe key or
browser cookies are forwarded to image hosts.

Each workspace has a statically generated 1200 × 630 `opengraph-image` route. `lib/social.ts` supplies per-page titles, descriptions, canonical paths and matching Twitter metadata; `lib/social-image.tsx` renders the shared pink/sky-blue TypeSafe design with locally stored reference artwork. When adding a page, add its registry entry, call `pageMetadata`, and add a small `opengraph-image.tsx` entry point. `public/og.png` remains the README artwork.

The SMT endpoint uses the Node.js `z3-solver` WASM package. `next.config.ts` externalizes it and traces the WASM/runtime files into `/api/solve`; do not move it to the Edge runtime. Queue, input, timeout and solver-resource limits are also enforced locally.
