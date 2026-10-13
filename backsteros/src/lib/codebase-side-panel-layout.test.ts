import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CODEBASE_DETAIL_PANEL_MIN_WIDTH,
  CODEBASE_SIDE_PANEL_DEFAULT_WIDTH,
  CODEBASE_SIDE_PANEL_MIN_WIDTH,
  CODEBASE_TAB_LIST_DEFAULT_WIDTH,
  CODEBASE_TAB_LIST_DETAIL_MIN_WIDTH,
  CODEBASE_TAB_LIST_MIN_WIDTH,
  clampCodebaseSidePanelWidth,
  clampCodebaseTabListWidth,
  codebaseSidePanelWidthKey,
  codebaseTabListWidthKey,
} from "./codebase-side-panel-layout.ts";

test("codebaseSidePanelWidthKey is scoped per project", () => {
  assert.equal(
    codebaseSidePanelWidthKey("abc"),
    "backsteros-desktop.codebase-side-panel-width.project.abc",
  );
  assert.notEqual(
    codebaseSidePanelWidthKey("abc"),
    codebaseSidePanelWidthKey("def"),
  );
});

test("clampCodebaseSidePanelWidth enforces the shared column minimum", () => {
  assert.equal(
    clampCodebaseSidePanelWidth(100, 1400),
    CODEBASE_SIDE_PANEL_MIN_WIDTH,
  );
  assert.equal(CODEBASE_SIDE_PANEL_MIN_WIDTH, 380);
  assert.equal(CODEBASE_SIDE_PANEL_DEFAULT_WIDTH, 380);
});

test("clampCodebaseSidePanelWidth leaves room for the detail column min", () => {
  assert.equal(
    clampCodebaseSidePanelWidth(900, 1000),
    1000 - CODEBASE_DETAIL_PANEL_MIN_WIDTH,
  );
});

test("clampCodebaseSidePanelWidth allows dragging up to the detail floor", () => {
  assert.equal(
    clampCodebaseSidePanelWidth(1500, 1600),
    1600 - CODEBASE_DETAIL_PANEL_MIN_WIDTH,
  );
});

test("clampCodebaseSidePanelWidth keeps the default mid-range", () => {
  assert.equal(
    clampCodebaseSidePanelWidth(CODEBASE_SIDE_PANEL_DEFAULT_WIDTH, 1200),
    CODEBASE_SIDE_PANEL_DEFAULT_WIDTH,
  );
});

test("codebaseTabListWidthKey is scoped per project and tab", () => {
  assert.equal(
    codebaseTabListWidthKey("abc", "files"),
    "backsteros-desktop.codebase-tab-list-width.project.abc.files",
  );
  assert.notEqual(
    codebaseTabListWidthKey("abc", "files"),
    codebaseTabListWidthKey("abc", "docs"),
  );
});

test("clampCodebaseTabListWidth keeps the list floor and the open item", () => {
  assert.equal(CODEBASE_TAB_LIST_MIN_WIDTH, 220);
  assert.equal(CODEBASE_TAB_LIST_DEFAULT_WIDTH, 340);
  assert.equal(
    clampCodebaseTabListWidth(80, 900),
    CODEBASE_TAB_LIST_MIN_WIDTH,
  );
  assert.equal(
    clampCodebaseTabListWidth(800, 900),
    900 - CODEBASE_TAB_LIST_DETAIL_MIN_WIDTH,
  );
  assert.equal(
    clampCodebaseTabListWidth(CODEBASE_TAB_LIST_DEFAULT_WIDTH, 900),
    CODEBASE_TAB_LIST_DEFAULT_WIDTH,
  );
});
