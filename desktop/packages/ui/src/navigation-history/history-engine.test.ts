import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyPathnameChangeForTab,
  createInitialHistoryStore,
  getActiveStack,
  getRecentHistoryPagesFromStore,
  isRedirectContinuation,
  migrateLegacyStore,
  pruneStacks,
  syncTabStackToHref,
} from "./history-engine.js";

describe("per-tab navigation history store", () => {
  it("pushes real list overviews so Escape returns to the list", () => {
    const cases: Array<{ from: string; to: string; label: string }> = [
      {
        from: "/spaces",
        to: "/spaces/knowledge-base/ideas",
        label: "Spaces",
      },
      {
        from: "/knowledge",
        to: "/knowledge/second-brain/note",
        label: "Legacy knowledge",
      },
      { from: "/contacts", to: "/contacts/42", label: "Contacts" },
      {
        from: "/organizations",
        to: "/organizations/acme",
        label: "Organizations",
      },
      { from: "/projects", to: "/projects/demo", label: "Projects" },
      { from: "/tasks", to: "/tasks/abc", label: "Tasks" },
      {
        from: "/catalog",
        to: "/projects/mail",
        label: "Catalog → project",
      },
      {
        from: "/journal/habits",
        to: "/journal/habits/habit-1",
        label: "Habit tracker",
      },
    ];

    for (const { from, to, label } of cases) {
      assert.equal(
        isRedirectContinuation(from, to),
        false,
        `${label}: ${from} → ${to} must push`,
      );
    }

    let store = createInitialHistoryStore("tab-a", "/catalog", "Catalog");
    store = applyPathnameChangeForTab(
      store,
      "tab-a",
      "/spaces",
      "Spaces",
      null,
    );
    store = applyPathnameChangeForTab(
      store,
      "tab-a",
      "/spaces/knowledge-base/ideas",
      "Idea's",
      null,
    );

    const stack = getActiveStack(store, "tab-a");
    assert.ok(stack);
    assert.equal(stack.index, 2);
    assert.deepEqual(
      stack.entries.map((entry) => entry.href),
      ["/catalog", "/spaces", "/spaces/knowledge-base/ideas"],
    );
  });

  it("replaces auto-landing section roots instead of pushing the empty root", () => {
    const cases: Array<{ from: string; to: string; label: string }> = [
      { from: "/inbox", to: "/inbox/task-1", label: "Inbox" },
      { from: "/social", to: "/social/alice", label: "Network" },
      { from: "/letters", to: "/letters/12", label: "Letters" },
      {
        from: "/journal",
        to: "/journal/2026-09-13",
        label: "Journal → today",
      },
      {
        from: "/finance",
        to: "/finance/dashboard",
        label: "Finance",
      },
      {
        from: "/settings",
        to: "/settings/integrations",
        label: "Settings",
      },
      {
        from: "/projects/demo/documents",
        to: "/projects/demo/documents/readme",
        label: "Project documents index",
      },
      {
        from: "/projects/demo/letters",
        to: "/projects/demo/letters/1",
        label: "Project letters index",
      },
    ];

    for (const { from, to, label } of cases) {
      assert.equal(
        isRedirectContinuation(from, to),
        true,
        `${label}: ${from} → ${to} must replace`,
      );
    }

    let store = createInitialHistoryStore("tab-a", "/catalog", "Catalog");
    store = applyPathnameChangeForTab(
      store,
      "tab-a",
      "/inbox",
      "Inbox",
      null,
    );
    store = applyPathnameChangeForTab(
      store,
      "tab-a",
      "/inbox/task-1",
      "Task 1",
      null,
    );

    const stack = getActiveStack(store, "tab-a");
    assert.ok(stack);
    assert.equal(stack.index, 1);
    assert.deepEqual(
      stack.entries.map((entry) => entry.href),
      ["/catalog", "/inbox/task-1"],
    );
  });

  it("pushes Communication ticket so Escape returns to the channel list", () => {
    assert.equal(
      isRedirectContinuation("/communication", "/communication/task-1"),
      false,
    );
    assert.equal(
      isRedirectContinuation(
        "/communication?channel=all",
        "/communication/task-1?channel=all",
      ),
      false,
    );

    let store = createInitialHistoryStore(
      "tab-a",
      "/communication?channel=email&inbox=sander",
      "Sander",
    );
    store = applyPathnameChangeForTab(
      store,
      "tab-a",
      "/communication?channel=all",
      "Everything",
      null,
    );
    store = applyPathnameChangeForTab(
      store,
      "tab-a",
      "/communication/task-1?channel=all",
      "Ticket",
      null,
    );

    const stack = getActiveStack(store, "tab-a");
    assert.ok(stack);
    assert.equal(stack.index, 2);
    assert.deepEqual(
      stack.entries.map((entry) => entry.href),
      [
        "/communication?channel=email&inbox=sander",
        "/communication?channel=all",
        "/communication/task-1?channel=all",
      ],
    );
  });

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
