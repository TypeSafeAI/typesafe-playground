import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import type { PublicDocument } from "./publicDocument";
import type { NativeDomCommand, NativeDomReply } from "./nativeBrowser/dom";
type BrowserReply = {
  url: string;
  screenshot: string;
  body?: string;
  value?: unknown;
};

export function validateNeweggBrowserUrl(value: string) {
  const target = new URL(value);
  if (
    target.origin !== "https://www.newegg.com" ||
    target.username ||
    target.password ||
    !/^\/(?:[^/]+\/)?p\/(?:pl|[A-Z0-9-]+)$/i.test(target.pathname)
  )
    throw Error("Unsupported browser URL.");
  return target;
}
export function requireLocalBrowser(request: Request) {
  const url = new URL(request.url);
  // Next can canonicalize request.url to localhost while the browser uses
  // 127.0.0.1 or [::1]. Validate the actual authority, not forwarded headers.
  const host = request.headers.get("host") || url.host;
  const validHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const actual = validHost ? new URL(`${url.protocol}//${host}`) : null;
  if (
    process.env.VERCEL ||
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !actual ||
    (request.headers.get("origin") &&
      request.headers.get("origin") !== actual.origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw Error(
      "Local browser is available only from this app running on localhost.",
    );
}
class LocalBrowser {
  private process: ChildProcessWithoutNullStreams;
  private startProcess(viewport: { width: number; height: number }) {
    return spawn(
      process.env.UV_EXECUTABLE || "uv",
      [
        "run",
        "--python",
        "3.12",
        "--with",
        "browser-use==0.13.10",
        "python",
        path.join(process.cwd(), "scripts/local-browser.py"),
        String(viewport.width),
        String(viewport.height),
        this.nativeOrigin ?? "",
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ANONYMIZED_TELEMETRY: "false" },
      },
    );
  }
  private pending = new Map<
    string,
    { resolve: (value: BrowserReply) => void; reject: (error: Error) => void }
  >();
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private timer: ReturnType<typeof setTimeout>;
  screenshot: string | null = null;
  url = "";
  error: string | null = null;
  busy = false;
  used = false;
  phase = "Ready";
  completedReads = 0;
  constructor(
    viewport: { width: number; height: number },
    private nativeOrigin?: string,
  ) {
    this.process = this.startProcess(viewport);
    this.timer = setTimeout(() => this.close(), 10 * 60_000);
    this.timer.unref();
    this.process.stdin.on("error", () =>
      this.close("Local browser input closed."),
    );
    this.process.stderr.on("data", () => {}); // Library diagnostics never enter reports or expose environment data.
    createInterface({ input: this.process.stdout }).on("line", (line) => {
      try {
        const message = JSON.parse(line);
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) {
          this.error = message.error;
          pending.reject(Error(message.error));
        } else {
          this.error = null;
          this.screenshot = message.result.screenshot;
          this.url = message.result.url;
          pending.resolve(message.result);
        }
      } catch {
        /* Ignore non-protocol library output. */
      }
    });
    this.process.on("error", () =>
      this.close(
        "Could not start uv. Install uv and Chromium for local browser-use.",
      ),
    );
    this.process.on("exit", () =>
      this.close("Local browser session ended. Start a new run."),
    );
  }
  private command = (
    payload: object,
    signal: AbortSignal,
  ): Promise<BrowserReply> => {
    const run = this.queue.then(async () => {
      signal.throwIfAborted();
      if (this.closed) throw Error(this.error || "Local browser closed.");
      return new Promise<BrowserReply>((resolve, reject) => {
        const id = randomUUID();
        const deadline = setTimeout(
          () => this.close("Local browser read timed out."),
          90_000,
        );
        const abort = () => this.close("Local browser run stopped.");
        signal.addEventListener("abort", abort, { once: true });
        const finish = () => {
          clearTimeout(deadline);
          signal.removeEventListener("abort", abort);
        };
        this.pending.set(id, {
          resolve: (value) => {
            finish();
            resolve(value);
          },
          reject: (error) => {
            finish();
            reject(error);
          },
        });
        this.process.stdin.write(JSON.stringify({ id, ...payload }) + "\n");
      });
    });
    this.queue = run.catch(() => {});
    return run;
  };
  read = async (url: string, signal: AbortSignal): Promise<PublicDocument> => {
    validateNeweggBrowserUrl(url);
    const reply = await this.command({ url }, signal);
    if (typeof reply.body !== "string")
      throw Error("Local browser returned no document.");
    return { url: reply.url, body: reply.body, contentType: "text/html" };
  };
  navigateNative = async (url: string, signal: AbortSignal) => {
    const target = new URL(url);
    if (
      !this.nativeOrigin ||
      target.origin !== this.nativeOrigin ||
      target.username ||
      target.password ||
      (target.origin !== "https://www.newegg.com" &&
        target.pathname !== "/browser-agent-benchmark")
    )
      throw Error("Native navigation is outside this session's allowed task.");
    await this.command({ native: { url: target.href } }, signal);
  };
  native = async (command: NativeDomCommand, signal: AbortSignal) => {
    if (!this.nativeOrigin)
      throw Error("This session does not support native actions.");
    // Inject trusted source verbatim; compiled functions can capture bundler helpers.
    const source = await readFile(
      path.join(process.cwd(), "lib/nativeBrowser/dom-runtime.js"),
      "utf8",
    );
    const script = `() => (${source.replace("export async function nativeBrowserDom", "async function nativeBrowserDom")})(${JSON.stringify(command)})`;
    return (await this.command({ native: { script } }, signal))
      .value as NativeDomReply;
  };
  close(reason = "Local browser closed.") {
    if (this.closed) return;
    this.closed = true;
    this.error = reason;
    clearTimeout(this.timer);
    this.process.stdin.end();
    const process = this.process;
    // Stop an active evaluation promptly; EOF alone waits for its batch to finish.
    process.kill("SIGTERM");
    const kill = setTimeout(() => {
      if (process.exitCode === null && process.signalCode === null)
        process.kill("SIGKILL");
    }, 5000);
    process.once("exit", () => clearTimeout(kill));
    kill.unref();
    for (const pending of this.pending.values()) pending.reject(Error(reason));
    this.pending.clear();
  }
}
const globalStore = globalThis as typeof globalThis & {
  localBrowsers?: Map<string, LocalBrowser>;
  localBrowserStarts?: number[];
};
const sessions = (globalStore.localBrowsers ??= new Map());
export function createLocalBrowser(
  viewport = { width: 1440, height: 900 },
  nativeOrigin?: string,
) {
  if (nativeOrigin) {
    const origin = new URL(nativeOrigin);
    if (
      origin.origin !== nativeOrigin ||
      origin.username ||
      origin.password ||
      (nativeOrigin !== "https://www.newegg.com" &&
        !(
          origin.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
        ))
    )
      throw Error("Native browser origin is not supported.");
  }
  const now = Date.now();
  const starts = (globalStore.localBrowserStarts ?? []).filter(
    (time) => now - time < 60_000,
  );
  if (starts.length >= 3)
    throw Error("Local browser start limit reached. Try again in a minute.");
  globalStore.localBrowserStarts = starts;
  if (sessions.size >= 3)
    throw Error("Close an existing local browser before starting another.");
  starts.push(now);
  const id = randomUUID();
  sessions.set(id, new LocalBrowser(viewport, nativeOrigin));
  const expiry = setTimeout(() => {
    sessions.get(id)?.close();
    sessions.delete(id);
  }, 10 * 60_000);
  expiry.unref();
  return id;
}
export function getLocalBrowser(id: string) {
  const session = sessions.get(id);
  if (!session)
    throw Error("Local browser session not found. Start a new run.");
  return session;
}
export function closeLocalBrowser(id: string) {
  sessions.get(id)?.close();
  sessions.delete(id);
}
