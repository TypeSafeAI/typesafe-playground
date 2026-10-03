import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";

// cubing.js uses a nested module worker. Keep its ESM graph intact rather than
// letting Next turn the worker entry URL into an unusable asset reference.
const directory = "public/generated/twisty";
await mkdir(directory, { recursive: true });
const result = await build({
  entryPoints: ["lib/twisty/worker.ts"],
  outdir: directory,
  entryNames: "worker-[hash]",
  chunkNames: "chunk-[hash]",
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "linked",
  metafile: true,
});
const entry = Object.entries(result.metafile.outputs).find(
  ([, value]) => value.entryPoint === "lib/twisty/worker.ts",
)?.[0];
if (!entry) throw Error("Puzzle worker entry was not emitted.");
await writeFile(
  "lib/twisty/worker-url.json",
  JSON.stringify({ url: `/${entry.replace(/^public\//, "")}` }) + "\n",
);
