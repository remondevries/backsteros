import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CODEBASE_SIDE_PANEL_DEFAULT_WIDTH,
  CODEBASE_SIDE_PANEL_MAX_WIDTH,
  CODEBASE_SIDE_PANEL_MIN_WIDTH,
  clampCodebaseSidePanelWidth,
} from "./codebase-side-panel-layout.ts";

test("clampCodebaseSidePanelWidth enforces the minimum width", () => {
  assert.equal(
    clampCodebaseSidePanelWidth(100, 1200),
    CODEBASE_SIDE_PANEL_MIN_WIDTH,
  );
});

test("clampCodebaseSidePanelWidth caps at 55% of container width", () => {
  assert.equal(clampCodebaseSidePanelWidth(900, 1000), 550);
});

test("clampCodebaseSidePanelWidth respects absolute max", () => {
  assert.equal(
    clampCodebaseSidePanelWidth(900, 2000),
    CODEBASE_SIDE_PANEL_MAX_WIDTH,
  );
});

test("clampCodebaseSidePanelWidth keeps a mid-range width", () => {
  assert.equal(
    clampCodebaseSidePanelWidth(CODEBASE_SIDE_PANEL_DEFAULT_WIDTH, 1200),
    CODEBASE_SIDE_PANEL_DEFAULT_WIDTH,
  );
});
