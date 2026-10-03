import { test } from "node:test";
import assert from "node:assert/strict";
import { navigationSections } from "../lib/navigation";
import { SECTION_IDS, SECTION_WORKSPACES } from "../lib/routes";

test("navigation includes every workspace exactly once in its route section", () => {
  assert.deepEqual(
    Object.keys(navigationSections).sort(),
    [...SECTION_IDS].sort(),
  );
  for (const section of SECTION_IDS) {
    const workspaces = navigationSections[section].groups.flatMap((group) => [
      ...group.workspaces,
    ]);
    assert.deepEqual(
      workspaces.sort(),
      [...SECTION_WORKSPACES[section]].sort(),
      section,
    );
  }
});
