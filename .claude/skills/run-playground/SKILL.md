---
name: run-playground
description: Launch and drive the TypeSafe AI Playground locally — start the Next.js app, open a workspace route, click through it, and screenshot what a user would actually see. Use this whenever you need to run, start, serve, preview, or screenshot this app, confirm a UI change works in the real app rather than only in tests, reproduce a bug someone reported on a page, or check a route's layout at a given viewport. Also use it before claiming any visual or interaction change works, since the unit and Playwright suites can pass while the page itself is broken.
---

# Running the playground

This repo is a Next.js app with many workspace routes (`/jev-chat`, `/gate`,
`/extraction`, `/doom`, …). Running it means serving it and driving a real
browser against a route — not running the test suite, which mocks Jev and can
stay green while the page is visibly wrong.

## Before anything: pnpm only

Node 22+ and pnpm `10.34.5` (pinned in `package.json`). A dependency-free
guard runs as a `pre*` script on install, dev, build, start, test and
typecheck, and it fails the command if another package manager invoked it.
`npm`, `npx`, `yarn` and `bun` are not fallbacks here — they will not work.

```sh
pnpm install --frozen-lockfile
```

## Pick a port nobody else is using

Several worktrees and other sessions leave dev servers running. `3042` is the
configured dev port and `3001`/`3002` are the Playwright defaults, so they are
frequently taken. Claiming a busy port produces confusing results: you drive a
*different checkout's* build and conclude your change did nothing.

```sh
port=3060
lsof -iTCP:$port -sTCP:LISTEN -P >/dev/null 2>&1 && echo "busy, pick another"
```

## Serve a production build

Dev mode is fine for iterating, but a production build is what CI and Vercel
run, and it catches build-time failures that `next dev` hides.

```sh
pnpm build
pnpm start --hostname 127.0.0.1 --port "$port"
```

Note there is no `--` before the flags. pnpm forwards `--` verbatim and
`next start -- --hostname` reads the flags as a project directory. The same
trap is documented in `playwright.config.ts`.

Start it in the background, then wait for it to actually answer rather than
sleeping a fixed amount:

```sh
until curl -sf -o /dev/null "http://127.0.0.1:$port/jev-chat"; do sleep 1; done
```

**Track the PID so you can stop only your own server.** `pkill -f next-server`
will also kill servers belonging to other worktrees and other people's
sessions on this machine. Kill by PID, or confirm the process's `cwd` is this
checkout before killing it:

```sh
lsof -a -p "$pid" -d cwd -Fn | grep '^n' | cut -c2-
```

## Drive it with the repo's own Playwright

`chromium-cli` is **not** installed here. The repo already depends on
`@playwright/test`, so use that — there is no need to add a driver.

Two things make this work:

- Import from `@playwright/test`, not `playwright`. Only the former is a
  dependency.
- **Run the script from the repo root.** Node resolves `node_modules` from the
  script's own directory upward, so a driver written to a scratch directory
  fails with `ERR_MODULE_NOT_FOUND` even though the package is installed.
  Write the script into the repo, run it, then delete it — or pass an absolute
  path and run `node` with the repo as the working directory.

```js
// drive.mjs — write at the repo root, run `node drive.mjs`, then delete it
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:3060/jev-chat", { waitUntil: "networkidle" });
await page.screenshot({ path: "/tmp/shot.png" });
await browser.close();
```

Install the browser binary once if it is missing:

```sh
pnpm exec playwright install chromium
```

## Actually drive it, then look

Loading a route proves the entrypoint resolves. It does not prove the page
works. Interact the way a user would, then **open the screenshot and look at
it** — a blank or half-rendered frame is a failure, and no assertion you wrote
will tell you that.

Most workspaces run without an API key. Jev Chat's **Local demo** mode composes
replies with no model call, so you can type a question and get a real answer
offline; the header should still read `0 calls, 0 tokens`. Controls labelled
**Live Jev** need a key.

```js
const box = page.getByRole("textbox").first();
await box.fill("What is the capital of Vermont?");
await page.keyboard.press("Enter");
await page.waitForTimeout(3500);
```

## Widths animate — assert state before measuring

The shell siderail animates between its 224px and 64px widths. A bare
`boundingBox()` right after navigation samples mid-transition and reads
something like 203px, which matches neither. This produces tests that pass
alone and fail in a full run.

Assert the class first, then poll the measurement:

```js
await expect(page.locator(".dashboard-shell")).toHaveClass(/nav-collapsed/);
await expect.poll(async () => (await rail.boundingBox()).width).toBeLessThan(120);
```

## Credentials stay server-side

`TYPESAFE_API_KEY` is read only by the server; never prefix it with
`NEXT_PUBLIC_`, put it in a component, or commit `.env.local`. For live runs
the repo uses 1Password references instead of a plaintext file:

```sh
pnpm dev:op     # op run --env-file=.env.1password -- next dev …
pnpm start:op
```

`op` must be unlocked first (`op signin`), which is interactive — ask the user
to run it rather than trying to do it for them.

## The browser-agent workspaces need more

`/jev-browser-agent` and its `/native` route spawn a local `browser-use`
session through `uv`, pinned to `browser-use==0.13.10`, and drive real
Chromium. They need `uv` on PATH and the Playwright Chromium download. These
routes only work on localhost — a hosted deployment cannot launch a browser on
your machine.

## Running the Playwright suite instead

When you want the suite rather than a manual drive, match CI or the result will
mislead you:

```sh
E2E_PRODUCTION=1 E2E_SOFTWARE_GL=1 E2E_PORT=3061 pnpm test:e2e
```

`playwright.config.ts` keys both the worker count and the assertion timeout off
`CI`: with it set, `workers: 1` and `expect.timeout: 20000`; without it, 3
workers and 5000ms. `E2E_SOFTWARE_GL=1` reproduces the CI configuration
locally.

Running with the local defaults produces failures that are not real:

- `clean-room.spec.ts` fails because three parallel workers exceed the
  two-slot demo admission cap. It passes 6/6 at `--workers=1`.
- The Ask gate batch-triage case needs longer than 5s, because six docs-first
  passes go through the browser request queue. It passes in ~23s.
- Under heavy machine load, tests die with `Protocol error … session closed`
  or a timeout inside `page.screenshot` — the browser was starved, not broken.
  Check `uptime` before believing a local suite result; this machine is often
  running several sessions at once.

**Never pipe a suite run through `tail`.** The line reporter prints failure
detail inline, and `tail` discards exactly the part you need, forcing a full
re-run to diagnose anything. Redirect to a file and read the tail of the file.

## Reporting

Say which route you drove, at what viewport, and what you observed in the
screenshot. Distinguish what you measured from what you inferred. If a local
suite failure looks environmental, say so and give the evidence — a serial
re-run passing, or the load average — rather than asserting "flaky".
