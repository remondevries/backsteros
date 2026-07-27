import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGENT_DIFF_PANEL_MIN_WIDTH,
  AGENT_DIFF_PANEL_WIDE_BREAKPOINT,
  clampAgentDiffPanelWidth,
} from "./agent-chat-diff-panel-layout.ts";

test("clampAgentDiffPanelWidth enforces the minimum width", () => {
  assert.equal(clampAgentDiffPanelWidth(100, 1000), AGENT_DIFF_PANEL_MIN_WIDTH);
});

test("clampAgentDiffPanelWidth caps at 70% of body width", () => {
  assert.equal(clampAgentDiffPanelWidth(900, 1000), 700);
});

test("clampAgentDiffPanelWidth keeps a mid-range width", () => {
  assert.equal(clampAgentDiffPanelWidth(420, 1200), 420);
});

test("AGENT_DIFF_PANEL_WIDE_BREAKPOINT is 720", () => {
  assert.equal(AGENT_DIFF_PANEL_WIDE_BREAKPOINT, 720);
});
