import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addAgentSurfaceTab,
  closeAgentSurfaceTab,
  createDefaultAgentSurfaceTabs,
  nextNumberedTabTitle,
  readAgentSurfaceTabs,
  updateAgentSurfaceTab,
  writeAgentSurfaceTabs,
  type AgentSurfaceTab,
} from "./agent-surface-tabs.ts";

test("createDefaultAgentSurfaceTabs starts with one Chat tab", () => {
  const state = createDefaultAgentSurfaceTabs();
  assert.equal(state.tabs.length, 1);
  assert.equal(state.tabs[0]?.kind, "chat");
  assert.equal(state.tabs[0]?.title, "Chat");
  assert.equal(state.activeId, state.tabs[0]?.id);
});

test("nextNumberedTabTitle sequences Browser → Browser 2", () => {
  assert.equal(nextNumberedTabTitle([], "browser"), "Browser");
  assert.equal(
    nextNumberedTabTitle([{ id: "a", kind: "browser", title: "Browser" }], "browser"),
    "Browser 2",
  );
});

test("addAgentSurfaceTab appends multi kinds", () => {
  const initial = createDefaultAgentSurfaceTabs();
  const withBrowser = addAgentSurfaceTab(initial.tabs, "browser");
  assert.equal(withBrowser.tabs.length, 2);
  assert.equal(withBrowser.tabs[1]?.kind, "browser");
  const withSecond = addAgentSurfaceTab(withBrowser.tabs, "browser");
  assert.equal(withSecond.tabs.length, 3);
  assert.equal(withSecond.tabs[2]?.title, "Browser 2");
});

test("addAgentSurfaceTab reactivates singleton kinds", () => {
  const initial = createDefaultAgentSurfaceTabs();
  const withFiles = addAgentSurfaceTab(initial.tabs, "files");
  const filesId = withFiles.activeId;
  const withPlan = addAgentSurfaceTab(withFiles.tabs, "plan");
  const again = addAgentSurfaceTab(withPlan.tabs, "files");
  assert.equal(again.tabs.filter((t) => t.kind === "files").length, 1);
  assert.equal(again.activeId, filesId);
});

test("closeAgentSurfaceTab refuses to close the last tab", () => {
  const initial = createDefaultAgentSurfaceTabs();
  const closed = closeAgentSurfaceTab(
    initial.tabs,
    initial.activeId,
    initial.activeId,
  );
  assert.equal(closed.tabs.length, 1);
  assert.equal(closed.activeId, initial.activeId);
});

test("closeAgentSurfaceTab activates neighbor when closing active", () => {
  const tabs: AgentSurfaceTab[] = [
    { id: "a", kind: "chat", title: "Chat" },
    { id: "b", kind: "browser", title: "Browser" },
    { id: "c", kind: "terminal", title: "Terminal" },
  ];
  const closed = closeAgentSurfaceTab(tabs, "b", "b");
  assert.deepEqual(
    closed.tabs.map((tab) => tab.id),
    ["a", "c"],
  );
  assert.equal(closed.activeId, "a");
});

test("updateAgentSurfaceTab patches title and resourceId", () => {
  const tabs: AgentSurfaceTab[] = [
    { id: "a", kind: "browser", title: "Browser", resourceId: null },
  ];
  const next = updateAgentSurfaceTab(tabs, "a", {
    title: "localhost",
    resourceId: "http://127.0.0.1:5173",
  });
  assert.equal(next[0]?.title, "localhost");
  assert.equal(next[0]?.resourceId, "http://127.0.0.1:5173");
});

test("read/writeAgentSurfaceTabs round-trip per task", () => {
  const storage = new Map<string, string>();
  const originalWindow = globalThis.window;
  // @ts-expect-error test stub
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
  };

  try {
    const initial = createDefaultAgentSurfaceTabs();
    const withBrowser = addAgentSurfaceTab(initial.tabs, "browser");
    writeAgentSurfaceTabs("task-1", withBrowser);
    const loaded = readAgentSurfaceTabs("task-1");
    assert.equal(loaded.tabs.length, 2);
    assert.equal(loaded.tabs[1]?.kind, "browser");
    assert.equal(loaded.activeId, withBrowser.activeId);

    const other = readAgentSurfaceTabs("task-2");
    assert.equal(other.tabs.length, 1);
    assert.equal(other.tabs[0]?.kind, "chat");
  } finally {
    globalThis.window = originalWindow;
  }
});
