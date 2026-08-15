import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { clearPrimedTabTitles, primeTabTitle } from "../dist/primed-tab-title.js";
import {
  createDefaultTabsState,
  createProductTab,
  refreshOpenTabTaskStatuses,
  syncActiveTabTaskMeta,
  syncActiveTabToPath,
} from "../dist/tabs.js";

describe("syncActiveTabToPath", () => {
  test("clears task meta when the active tab navigates", () => {
    clearPrimedTabTitles();
    const first = createProductTab("/projects/bos/tasks/bos-1", "One");
    first.taskId = "t1";
    first.taskStatus = "in_progress";
    const state = { tabs: [first], activeTabId: first.id };
    const next = syncActiveTabToPath(state, "/inbox");
    assert.equal(next.tabs[0]?.href, "/inbox");
    assert.equal(next.tabs[0]?.taskId, undefined);
    assert.equal(next.tabs[0]?.taskStatus, undefined);
  });

  test("keeps a primed project name instead of Projects/Project", () => {
    clearPrimedTabTitles();
    primeTabTitle("/projects/bos", "Backsteros");
    const state = createDefaultTabsState("/projects");
    const next = syncActiveTabToPath(state, "/projects/bos");
    assert.equal(next.tabs[0]?.title, "Backsteros");
  });
});

describe("syncActiveTabTaskMeta", () => {
  test("writes task id and status onto the active tab", () => {
    const state = createDefaultTabsState("/projects/bos/tasks/bos-1");
    const next = syncActiveTabTaskMeta(state, {
      taskId: "t1",
      taskStatus: "in_review",
    });
    assert.equal(next.tabs[0]?.taskId, "t1");
    assert.equal(next.tabs[0]?.taskStatus, "in_review");
    assert.equal(
      syncActiveTabTaskMeta(next, { taskId: "t1", taskStatus: "in_review" }),
      next,
    );
  });
});

describe("refreshOpenTabTaskStatuses", () => {
  test("updates background tabs from the status map", () => {
    const a = createProductTab("/tasks/a", "A");
    a.taskId = "ta";
    a.taskStatus = "backlog";
    const b = createProductTab("/tasks/b", "B");
    b.taskId = "tb";
    b.taskStatus = "in_progress";
    const state = { tabs: [a, b], activeTabId: a.id };
    const next = refreshOpenTabTaskStatuses(
      state,
      new Map([
        ["ta", "completed"],
        ["tb", "in_progress"],
      ]),
    );
    assert.equal(next.tabs[0]?.taskStatus, "completed");
    assert.equal(next.tabs[1]?.taskStatus, "in_progress");
  });
});
