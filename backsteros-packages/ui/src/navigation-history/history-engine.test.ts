import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyPathnameChangeForTab,
  createInitialHistoryStore,
  getActiveStack,
  getRecentHistoryPagesFromStore,
  migrateLegacyStore,
  pruneStacks,
  syncTabStackToHref,
} from "./history-engine.js";

describe("per-tab navigation history store", () => {
  it("keeps stacks isolated across tabs", () => {
    let store = createInitialHistoryStore("tab-a", "/inbox", "Inbox");
    store = applyPathnameChangeForTab(
      store,
      "tab-a",
      "/projects",
      "Projects",
      null,
    );
    store = applyPathnameChangeForTab(
      store,
      "tab-a",
      "/projects/alpha",
      "Alpha",
      null,
    );

    store = applyPathnameChangeForTab(
      store,
      "tab-b",
      "/tasks",
      "Tasks",
      null,
    );
    store = applyPathnameChangeForTab(
      store,
      "tab-b",
      "/tasks/1",
      "Task 1",
      null,
    );

    const stackA = getActiveStack(store, "tab-a");
    const stackB = getActiveStack(store, "tab-b");

    assert.ok(stackA);
    assert.ok(stackB);
    assert.equal(stackA.index, 2);
    assert.deepEqual(
      stackA.entries.map((entry) => entry.href),
      ["/inbox", "/projects", "/projects/alpha"],
    );
    assert.equal(stackB.index, 1);
    assert.deepEqual(
      stackB.entries.map((entry) => entry.href),
      ["/tasks", "/tasks/1"],
    );

    // Back within tab B does not touch tab A.
    const afterBackB = applyPathnameChangeForTab(
      store,
      "tab-b",
      "/tasks",
      "Tasks",
      0,
    );
    assert.deepEqual(
      getActiveStack(afterBackB, "tab-a")?.entries.map((entry) => entry.href),
      ["/inbox", "/projects", "/projects/alpha"],
    );
    assert.equal(getActiveStack(afterBackB, "tab-b")?.index, 0);
    assert.equal(getActiveStack(afterBackB, "tab-b")?.entries[0]?.href, "/tasks");
  });

  it("does not push when syncing after a tab switch", () => {
    let store = createInitialHistoryStore("tab-a", "/inbox", "Inbox");
    store = applyPathnameChangeForTab(
      store,
      "tab-a",
      "/projects",
      "Projects",
      null,
    );

    store = applyPathnameChangeForTab(
      store,
      "tab-b",
      "/tasks",
      "Tasks",
      null,
    );
    store = applyPathnameChangeForTab(
      store,
      "tab-b",
      "/tasks/1",
      "Task 1",
      null,
    );

    const beforeA = getActiveStack(store, "tab-a");
    const beforeB = getActiveStack(store, "tab-b");
    assert.ok(beforeA);
    assert.ok(beforeB);

    // Switching back to tab A syncs tip without pushing.
    store = syncTabStackToHref(store, "tab-a", "/projects", "Projects");
    const afterA = getActiveStack(store, "tab-a");
    assert.ok(afterA);
    assert.equal(afterA.index, beforeA.index);
    assert.equal(afterA.entries.length, beforeA.entries.length);
    assert.equal(afterA.entries[afterA.index]?.href, "/projects");

    // Tab B unchanged.
    assert.deepEqual(
      getActiveStack(store, "tab-b")?.entries.map((entry) => entry.href),
      beforeB.entries.map((entry) => entry.href),
    );
  });

  it("prunes stacks for closed tabs", () => {
    let store = createInitialHistoryStore("tab-a", "/inbox", "Inbox");
    store = applyPathnameChangeForTab(
      store,
      "tab-b",
      "/tasks",
      "Tasks",
      null,
    );
    store = pruneStacks(store, ["tab-a"]);

    assert.ok(getActiveStack(store, "tab-a"));
    assert.equal(getActiveStack(store, "tab-b"), null);
  });

  it("builds a global recent list ordered by visitedAt", () => {
    let store = createInitialHistoryStore("tab-a", "/inbox", "Inbox");
    store = {
      ...store,
      stacksByTabId: {
        "tab-a": {
          entries: [
            { href: "/inbox", title: "Inbox", visitedAt: 100 },
            { href: "/projects", title: "Projects", visitedAt: 300 },
          ],
          index: 1,
        },
        "tab-b": {
          entries: [
            { href: "/tasks", title: "Tasks", visitedAt: 200 },
            { href: "/tasks/1", title: "Task 1", visitedAt: 400 },
          ],
          index: 1,
        },
      },
    };

    const recent = getRecentHistoryPagesFromStore(store, "/tasks/1");
    assert.deepEqual(
      recent.map((entry) => entry.href),
      ["/projects", "/tasks", "/inbox"],
    );
  });

  it("migrates legacy single-stack session storage under activeTabId", () => {
    const migrated = migrateLegacyStore(
      {
        entries: [
          { href: "/inbox", title: "Inbox", visitedAt: 1 },
          { href: "/projects", title: "Projects", visitedAt: 2 },
        ],
        index: 1,
      },
      "tab-legacy",
    );

    assert.ok(migrated);
    assert.equal(migrated.version, 2);
    assert.equal(migrated.stacksByTabId["tab-legacy"]?.index, 1);
    assert.equal(
      migrated.stacksByTabId["tab-legacy"]?.entries[1]?.href,
      "/projects",
    );
  });

  it("returns null when migrating legacy store without activeTabId", () => {
    assert.equal(
      migrateLegacyStore({
        entries: [{ href: "/inbox", title: "Inbox", visitedAt: 1 }],
        index: 0,
      }),
      null,
    );
  });

  it("accepts an already-migrated v2 store", () => {
    const migrated = migrateLegacyStore({
      version: 2,
      stacksByTabId: {
        "tab-a": {
          entries: [{ href: "/inbox", title: "Inbox", visitedAt: 1 }],
          index: 0,
        },
      },
    });

    assert.ok(migrated);
    assert.equal(migrated.stacksByTabId["tab-a"]?.entries[0]?.href, "/inbox");
  });
});
