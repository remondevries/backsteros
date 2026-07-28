import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addAgentSurfaceTab,
  closeAgentSurfaceTab,
  createDefaultAgentSurfaceTabs,
  ensureChatTab,
  isAgentSurfaceCloseTabShortcut,
  nextNumberedTabTitle,
  readAgentSurfaceTabs,
  resolveAdjacentAgentSurfaceTabId,
  resolveAgentSurfaceTabCycleShortcut,
  updateAgentSurfaceTab,
  writeAgentSurfaceTabs,
  type AgentSurfaceTab,
} from "./agent-surface-tabs.ts";

test("createDefaultAgentSurfaceTabs starts empty (picker)", () => {
  const state = createDefaultAgentSurfaceTabs();
  assert.equal(state.tabs.length, 0);
  assert.equal(state.activeId, null);
});

test("nextNumberedTabTitle sequences Browser → Browser 2", () => {
  assert.equal(nextNumberedTabTitle([], "browser"), "Browser");
  assert.equal(
    nextNumberedTabTitle([{ id: "a", kind: "browser", title: "Browser" }], "browser"),
    "Browser 2",
  );
});

test("addAgentSurfaceTab appends multi kinds from empty", () => {
  const withBrowser = addAgentSurfaceTab([], "browser");
  assert.equal(withBrowser.tabs.length, 1);
  assert.equal(withBrowser.tabs[0]?.kind, "browser");
  const withSecond = addAgentSurfaceTab(withBrowser.tabs, "browser");
  assert.equal(withSecond.tabs.length, 2);
  assert.equal(withSecond.tabs[1]?.title, "Browser 2");
});

test("addAgentSurfaceTab reactivates singleton kinds", () => {
  const withFiles = addAgentSurfaceTab([], "files");
  const filesId = withFiles.activeId;
  const withPlan = addAgentSurfaceTab(withFiles.tabs, "plan");
  const again = addAgentSurfaceTab(withPlan.tabs, "files");
  assert.equal(again.tabs.filter((t) => t.kind === "files").length, 1);
  assert.equal(again.activeId, filesId);
});

test("closeAgentSurfaceTab closes the last tab to empty picker", () => {
  const withChat = addAgentSurfaceTab([], "chat");
  const closed = closeAgentSurfaceTab(
    withChat.tabs,
    withChat.activeId!,
    withChat.activeId,
  );
  assert.equal(closed.tabs.length, 0);
  assert.equal(closed.activeId, null);
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

test("ensureChatTab adds Chat when missing and activates existing", () => {
  const fromEmpty = ensureChatTab([]);
  assert.equal(fromEmpty.tabs.length, 1);
  assert.equal(fromEmpty.tabs[0]?.kind, "chat");
  assert.equal(fromEmpty.activeId, fromEmpty.tabs[0]?.id);

  const withBrowser = addAgentSurfaceTab([], "browser");
  const ensured = ensureChatTab(withBrowser.tabs);
  assert.equal(ensured.tabs.length, 2);
  assert.equal(ensured.tabs.some((tab) => tab.kind === "chat"), true);

  const again = ensureChatTab(ensured.tabs);
  assert.equal(again.tabs.length, 2);
  assert.equal(
    again.activeId,
    ensured.tabs.find((tab) => tab.kind === "chat")?.id,
  );
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

test("read/writeAgentSurfaceTabs round-trip per task including empty", () => {
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
    const empty = createDefaultAgentSurfaceTabs();
    writeAgentSurfaceTabs("task-empty", empty);
    const loadedEmpty = readAgentSurfaceTabs("task-empty");
    assert.equal(loadedEmpty.tabs.length, 0);
    assert.equal(loadedEmpty.activeId, null);

    const withBrowser = addAgentSurfaceTab([], "browser");
    writeAgentSurfaceTabs("task-1", withBrowser);
    const loaded = readAgentSurfaceTabs("task-1");
    assert.equal(loaded.tabs.length, 1);
    assert.equal(loaded.tabs[0]?.kind, "browser");
    assert.equal(loaded.activeId, withBrowser.activeId);

    const other = readAgentSurfaceTabs("task-2");
    assert.equal(other.tabs.length, 0);
    assert.equal(other.activeId, null);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("⌥[ / ⌥] resolve to previous / next surface tab", () => {
  assert.equal(
    resolveAgentSurfaceTabCycleShortcut({
      altKey: true,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      code: "BracketLeft",
    }),
    "previous",
  );
  assert.equal(
    resolveAgentSurfaceTabCycleShortcut({
      altKey: true,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      code: "BracketRight",
    }),
    "next",
  );
  assert.equal(
    resolveAgentSurfaceTabCycleShortcut({
      altKey: false,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      code: "BracketRight",
    }),
    null,
  );
});

test("⌥W closes the active surface tab", () => {
  assert.equal(
    isAgentSurfaceCloseTabShortcut({
      altKey: true,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      code: "KeyW",
    }),
    true,
  );
  assert.equal(
    isAgentSurfaceCloseTabShortcut({
      altKey: false,
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      code: "KeyW",
    }),
    false,
  );
});

test("resolveAdjacentAgentSurfaceTabId cycles among open surfaces", () => {
  const tabs: AgentSurfaceTab[] = [
    { id: "chat", kind: "chat", title: "Chat" },
    { id: "browser", kind: "browser", title: "Browser" },
    { id: "term", kind: "terminal", title: "Terminal" },
  ];
  assert.equal(
    resolveAdjacentAgentSurfaceTabId(tabs, "chat", "next"),
    "browser",
  );
  assert.equal(
    resolveAdjacentAgentSurfaceTabId(tabs, "browser", "previous"),
    "chat",
  );
  assert.equal(
    resolveAdjacentAgentSurfaceTabId(tabs, "term", "next"),
    "chat",
  );
  assert.equal(
    resolveAdjacentAgentSurfaceTabId(tabs, "chat", "previous"),
    "term",
  );
  assert.equal(
    resolveAdjacentAgentSurfaceTabId(tabs.slice(0, 1), "chat", "next"),
    null,
  );
});
