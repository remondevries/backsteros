import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TASK_DETAIL_AGENT_STRIP_WIDTH,
  TASK_LAYOUT_COLUMN_MIN_WIDTH,
  clampTaskDetailSidePanelWidth,
  defaultTaskDetailSidePanelWidth,
  resolveTaskLayoutColumnWidths,
  taskDetailSidePanelWidthKey,
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
