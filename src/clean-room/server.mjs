import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  await readFile(path.join(root, "manifest.json"), "utf8"),
);
const target = new URL(process.env.CLEAN_ROOM_TARGET || manifest.target);
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const endpoint = manifest.endpoints.find(
      (e) =>
        e.method === req.method &&
        new RegExp(
          "^" +
            e.path
              .split("/")
              .map((p) =>
                /^\{[^}]+\}$/.test(p)
                  ? "[^/]+"
                  : p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
              )
              .join("/") +
            "$",
        ).test(url.pathname),
    );
    if (endpoint) {
      if (
        req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}`
      ) {
        res.writeHead(403).end();
        return;
      }
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) throw Error("Request too large");
        chunks.push(chunk);
      }
      const headers = { accept: "application/json" };
      if (req.headers["content-type"])
        headers["content-type"] = req.headers["content-type"];
      if (req.headers.cookie) headers.cookie = req.headers.cookie;
      if (process.env.CLEAN_ROOM_TARGET_TOKEN)
        headers.authorization = `Bearer ${process.env.CLEAN_ROOM_TARGET_TOKEN}`;
      const upstream = await fetch(new URL(url.pathname + url.search, target), {
        method: req.method,
        headers,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
      if (upstream.status >= 300 && upstream.status < 400) {
        await upstream.body?.cancel();
        throw Error("API redirects require explicit endpoint configuration.");
      }
      const body = await upstream.arrayBuffer();
      if (body.byteLength > 2 * 1024 * 1024) throw Error("Response too large");
      const out = {
        "content-type":
          upstream.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      };
      const cookies = upstream.headers.getSetCookie();
      if (cookies.length)
        out["set-cookie"] = cookies.map((c) =>
          c.replace(/;\s*Domain=[^;]+/gi, "").replace(/;\s*Secure/gi, ""),
        );
      res.writeHead(upstream.status, out).end(Buffer.from(body));
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }
    const staticFiles = new Set([
      "/__clean_room/runtime.js",
      "/__clean_room/manifest.js",
      "/__clean_room/request.js",
    ]);
    if (staticFiles.has(url.pathname)) {
      const relative = url.pathname.replace("/__clean_room/", "");
      res
        .writeHead(200, {
          "content-type": "text/javascript",
          "cache-control": "no-store",
        })
        .end(await readFile(path.join(root, relative)));
      return;
    }
    if (
      !manifest.screens.some(
        (s) => s.path === url.pathname + url.search || s.path === url.pathname,
      )
    ) {
      res.writeHead(404).end("Screen not captured");
      return;
    }
    res
      .writeHead(200, {
        "content-type": "text/html",
        "content-security-policy":
          "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
        "cache-control": "no-store",
      })
      .end(
        '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><script type="module" src="/__clean_room/runtime.js"></script></body></html>',
      );
  } catch {
    res.writeHead(502, { "content-type": "application/json" }).end(
      JSON.stringify({
        error: "Rebuilt endpoint failed; inspect the configured target.",
      }),
    );
  }
});
server.listen(Number(process.env.PORT || 0), "127.0.0.1", () =>
  console.log(
    JSON.stringify({ url: `http://127.0.0.1:${server.address().port}` }),
  ),
);
