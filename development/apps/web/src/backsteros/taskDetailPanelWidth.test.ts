import { describe, expect, it } from "vite-plus/test";

import {
  TASK_DETAIL_PANEL_DEFAULT_WIDTH,
  TASK_DETAIL_PANEL_MIN_WIDTH,
  clampTaskDetailPanelWidth,
  resolveInitialTaskDetailPanelWidth,
  resolveTaskDetailPanelMaximumWidth,
} from "./taskDetailPanelWidth";

describe("taskDetailPanelWidth", () => {
  it("defaults to the design width when nothing is stored", () => {
    expect(resolveInitialTaskDetailPanelWidth(null, 1600, 256)).toBe(
      TASK_DETAIL_PANEL_DEFAULT_WIDTH,
    );
  });

  it("clamps stored widths to the min and available max", () => {
    expect(resolveInitialTaskDetailPanelWidth(100, 1600, 256)).toBe(TASK_DETAIL_PANEL_MIN_WIDTH);
    expect(resolveInitialTaskDetailPanelWidth(900, 1200, 300)).toBe(
      resolveTaskDetailPanelMaximumWidth(1200, 300),
    );
  });

  it("keeps main content room when clamping a live drag", () => {
    expect(clampTaskDetailPanelWidth(1000, 1400, 280)).toBe(
      resolveTaskDetailPanelMaximumWidth(1400, 280),
    );
  });
});
