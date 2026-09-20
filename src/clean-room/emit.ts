import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { flatten, type Edge, type Endpoint, type Screen } from "./contracts";
export async function emitApp(
  dir: string,
  manifest: {
    target: string;
    endpoints: Endpoint[];
    edges: Edge[];
    screens: Screen[];
  },
  components: Record<string, string>,
) {
  await mkdir(path.join(dir, "components"), { recursive: true });
  const data = {
    ...structuredClone(manifest),
    components: Object.keys(components),
  };
  const targetOrigin = new URL(manifest.target).origin;
  for (const screen of data.screens)
    for (const node of flatten(screen.root)) {
      for (const attrs of [node.attrs, node.presentation?.attrs]) {
        if (!attrs?.href) continue;
        const link = new URL(attrs.href, new URL(screen.path, manifest.target));
        if (
          link.origin === targetOrigin &&
          data.screens.some((s) => s.path === link.pathname + link.search)
        ) {
          attrs.href = link.pathname + link.search + link.hash;
        }
      }
    }
  await writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(data, null, 2),
  );
  await writeFile(
    path.join(dir, "manifest.js"),
    `export const manifest = ${JSON.stringify(data)};\n`,
  );
  for (const [id, code] of Object.entries(components))
    await writeFile(path.join(dir, "components", `${id}.js`), code);
  for (const file of ["runtime.js", "request.js", "server.mjs"])
    await writeFile(
      // These are runtime output files, never inputs for deployment tracing.
      path.join(/* turbopackIgnore: true */ dir, file),
      await readFile(path.join(process.cwd(), "src/clean-room", file)),
    );
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "clean-room-rebuild",
        private: true,
        type: "module",
        packageManager: "pnpm@10.34.5",
        scripts: { start: "node server.mjs" },
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(dir, "README.md"),
    "# Rebuilt app\n\nRun `pnpm start` and open the printed localhost URL. No installation is needed. The target API must remain reachable. Set `CLEAN_ROOM_TARGET` to change the API origin and `CLEAN_ROOM_TARGET_TOKEN` for a server-side bearer token. This rebuild contains independently generated UI and deterministic API glue; it does not replicate the backend.\n",
  );
}
export async function startApp(dir: string) {
  // Only the deterministic server runs in Node. Emitted templates are compiled offline into inert element data.
  await readFile(path.join(dir, "manifest.json"));
  const child = spawn(process.execPath, [path.join(dir, "server.mjs")], {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: process.env.NODE_ENV || "production",
      PORT: "0",
      CLEAN_ROOM_TARGET_TOKEN: process.env.CLEAN_ROOM_TARGET_TOKEN,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const url = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(Error("Rebuild server startup timed out"));
    }, 10000);
    let buffer = "";
    child.once("error", (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(Error(`Rebuild server exited ${code}`));
    });
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      if (buffer.includes("\n")) {
        try {
          const data = JSON.parse(buffer.split("\n")[0]);
          if (data.url) {
            clearTimeout(timeout);
            resolve(data.url);
          }
        } catch {}
      }
    });
  });
  return {
    url,
    close: () => {
      child.kill();
    },
  };
}
