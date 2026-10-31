import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  listWatchHitSoftCap,
  logWorkspaceListSoftCapHit,
  resetWorkspaceListSoftCapLogsForTests,
} from "./workspace-list-soft-cap";

describe("workspace list soft cap (OS-163 review)", () => {
  afterEach(() => {
    resetWorkspaceListSoftCapLogsForTests();
  });

  it("detects saturation at LIMIT", () => {
    assert.equal(listWatchHitSoftCap(2499, 2500), false);
    assert.equal(listWatchHitSoftCap(2500, 2500), true);
    assert.equal(listWatchHitSoftCap(2501, 2500), true);
  });

  it("logs once per list key when hit", () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(String(args[0] ?? ""));
    };
    try {
      assert.equal(logWorkspaceListSoftCapHit("tasks", 2500, 2500), true);
      assert.equal(logWorkspaceListSoftCapHit("tasks", 2500, 2500), true);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0]!, /has_more=true/);
    } finally {
      console.warn = original;
    }
  });
});
