import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TASK_DETAIL_AGENT_STRIP_WIDTH,
  TASK_DETAIL_SIDE_PANEL_COLLAPSED_KEY,
  TASK_LAYOUT_COLUMN_MIN_WIDTH,
  clampTaskDetailSidePanelWidth,
  defaultTaskDetailSidePanelWidth,
  readTaskDetailSidePanelCollapsed,
  resolveTaskDetailSidePanelCollapsed,
  resolveTaskLayoutColumnWidths,
  taskDetailSidePanelWidthKey,
  writeTaskDetailSidePanelCollapsed,
} from "./task-detail-side-panel-layout.ts";

test("taskDetailSidePanelWidthKey is scoped per task", () => {
  assert.equal(
    taskDetailSidePanelWidthKey("abc"),
    "backsteros-desktop.task-detail-side-panel-width.task.abc",
  );
  assert.notEqual(
    taskDetailSidePanelWidthKey("abc"),
    taskDetailSidePanelWidthKey("def"),
  );
});

test("clampTaskDetailSidePanelWidth enforces the shared column minimum", () => {
  assert.equal(
    clampTaskDetailSidePanelWidth(100, 1400),
    TASK_LAYOUT_COLUMN_MIN_WIDTH,
  );
});

test("clampTaskDetailSidePanelWidth leaves room for the agent column min", () => {
  assert.equal(
    clampTaskDetailSidePanelWidth(900, 1000),
    1000 - TASK_LAYOUT_COLUMN_MIN_WIDTH,
  );
});

test("clampTaskDetailSidePanelWidth allows dragging up to the agent floor", () => {
  assert.equal(
    clampTaskDetailSidePanelWidth(1500, 1600),
    1600 - TASK_LAYOUT_COLUMN_MIN_WIDTH,
  );
});

test("defaultTaskDetailSidePanelWidth is narrow task for codebase", () => {
  assert.equal(
    defaultTaskDetailSidePanelWidth(1400, false),
    TASK_LAYOUT_COLUMN_MIN_WIDTH,
  );
});

test("defaultTaskDetailSidePanelWidth is narrow agent for default type", () => {
  assert.equal(
    defaultTaskDetailSidePanelWidth(1400, true),
    1400 - TASK_LAYOUT_COLUMN_MIN_WIDTH,
  );
});

test("resolveTaskDetailSidePanelCollapsed forces empty rails closed", () => {
  assert.equal(resolveTaskDetailSidePanelCollapsed(0, false), true);
  assert.equal(resolveTaskDetailSidePanelCollapsed(0, true), true);
});

test("resolveTaskDetailSidePanelCollapsed honors preference when surfaces exist", () => {
  assert.equal(resolveTaskDetailSidePanelCollapsed(1, false), false);
  assert.equal(resolveTaskDetailSidePanelCollapsed(2, true), true);
});

test("task detail side panel collapsed preference round-trips in localStorage", () => {
  const store = new Map<string, string>();
  const localStorageMock = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window: { localStorage: typeof localStorageMock } }).window =
    { localStorage: localStorageMock };
  try {
    writeTaskDetailSidePanelCollapsed(true);
    assert.equal(
      store.get(TASK_DETAIL_SIDE_PANEL_COLLAPSED_KEY),
      "1",
    );
    assert.equal(readTaskDetailSidePanelCollapsed(), true);
    writeTaskDetailSidePanelCollapsed(false);
    assert.equal(readTaskDetailSidePanelCollapsed(), false);
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window: unknown }).window = previousWindow;
    }
  }
});

test("resolveTaskLayoutColumnWidths keeps both tracks in pixels", () => {
  assert.deepEqual(
    resolveTaskLayoutColumnWidths({
      containerWidth: 1000,
      panelWidth: 400,
      mode: "expanded",
    }),
    { detail: 400, agent: 600 },
  );

  assert.deepEqual(
    resolveTaskLayoutColumnWidths({
      containerWidth: 1000,
      panelWidth: 400,
      mode: "agent-collapsed",
    }),
    {
      detail: 1000 - TASK_DETAIL_AGENT_STRIP_WIDTH,
      agent: TASK_DETAIL_AGENT_STRIP_WIDTH,
    },
  );

  assert.deepEqual(
    resolveTaskLayoutColumnWidths({
      containerWidth: 1000,
      panelWidth: 400,
      mode: "detail-collapsed",
    }),
    {
      detail: TASK_DETAIL_AGENT_STRIP_WIDTH,
      agent: 1000 - TASK_DETAIL_AGENT_STRIP_WIDTH,
    },
  );
});
