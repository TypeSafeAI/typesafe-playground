/** Node-only loader for fixtures/proposal-review/*.json. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFixtureSet } from "./fixtures";
import type { Fixture } from "./types";

export const FIXTURE_DIR = join(process.cwd(), "fixtures", "proposal-review");

export function loadFixtures(dir: string = FIXTURE_DIR): Fixture[] {
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  return parseFixtureSet(
    names.map((name) => JSON.parse(readFileSync(join(dir, name), "utf8"))),
    names,
  );
}
