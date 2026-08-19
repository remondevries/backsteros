import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  listAgentSurfaceQuickOpenKinds,
  listAgentSurfaceQuickOpenOptions,
} from "./agent-surface-quick-open";
import {
  addAgentSurfaceTab,
  closeAgentSurfaceTab,
  createDefaultAgentSurfaceTabs,
  ensureChatTab,
  readAgentSurfaceTabs,
  writeAgentSurfaceTabs,
} from "./agent-surface-tabs";

describe("listAgentSurfaceQuickOpenOptions", () => {
  it("shows Agent Browser Plan for regular projects", () => {
    assert.deepEqual(listAgentSurfaceQuickOpenKinds(false), [
      "chat",
      "browser",
      "plan",
    ]);
  });

  it("shows Files and Diff for codebase when diffs available", () => {
    assert.deepEqual(
      listAgentSurfaceQuickOpenKinds({
        isCodebaseProject: true,
        diffAvailable: true,
      }),
      ["chat", "browser", "files", "plan", "diff"],
    );
  });

  it("hides Diff until changes exist", () => {
    assert.deepEqual(
      listAgentSurfaceQuickOpenKinds({
        isCodebaseProject: true,
        diffAvailable: false,
      }),
      ["chat", "browser", "files", "plan"],
    );
  });

  it("marks Files as needing cwd", () => {
    const files = listAgentSurfaceQuickOpenOptions(true).find(
      (option) => option.kind === "files",
    );
    assert.equal(files?.needsCwd, true);
  });
});

describe("agent surface tabs", () => {
  it("starts empty", () => {
    assert.deepEqual(createDefaultAgentSurfaceTabs(), {
      tabs: [],
      activeId: null,
    });
  });

  it("reactivates singleton chat instead of duplicating", () => {
    const first = addAgentSurfaceTab([], "chat");
    const second = addAgentSurfaceTab(first.tabs, "chat");
    assert.equal(second.tabs.length, 1);
    assert.equal(second.activeId, first.activeId);
  });

  it("allows multiple browser tabs", () => {
    const first = addAgentSurfaceTab([], "browser");
    const second = addAgentSurfaceTab(first.tabs, "browser");
    assert.equal(second.tabs.length, 2);
    assert.equal(second.tabs[1]?.title, "Browser 2");
  });

  it("returns to empty picker when the last tab closes", () => {
    const open = addAgentSurfaceTab([], "plan");
    const closed = closeAgentSurfaceTab(open.tabs, open.activeId!, open.activeId);
    assert.deepEqual(closed, { tabs: [], activeId: null });
  });

  it("ensureChatTab opens chat from empty and activates existing", () => {
    const opened = ensureChatTab([]);
    assert.equal(opened.tabs.length, 1);
    assert.equal(opened.tabs[0]?.kind, "chat");
    assert.equal(opened.activeId, opened.tabs[0]?.id);

    const withBrowser = addAgentSurfaceTab(opened.tabs, "browser");
    const ensured = ensureChatTab(withBrowser.tabs);
    assert.equal(ensured.tabs.length, 2);
    assert.equal(
      ensured.tabs.find((tab) => tab.kind === "chat")?.id,
      opened.tabs[0]?.id,
    );
    assert.equal(ensured.activeId, opened.tabs[0]?.id);
  });

  it("read/writeAgentSurfaceTabs round-trip in memory per task", () => {
    writeAgentSurfaceTabs("task-a", ensureChatTab([]));
    const loaded = readAgentSurfaceTabs("task-a");
    assert.equal(loaded.tabs[0]?.kind, "chat");
    assert.deepEqual(readAgentSurfaceTabs("task-b"), {
      tabs: [],
      activeId: null,
    });
  });
});
