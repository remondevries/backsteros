import { describe, expect, it } from "vite-plus/test";

import {
  COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
  MAIN_COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
} from "./workspaceTitlebar";

describe("workspace titlebar inset classes", () => {
  it("pads main content past traffic lights only when the task detail rail is closed", () => {
    expect(MAIN_COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS).toContain(
      "data-sidebar-state=collapsed",
    );
    expect(MAIN_COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS).toContain(
      "data-task-detail-open=true",
    );
    expect(MAIN_COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS).toContain(":not(");
  });

  it("keeps the unconditional inset for surfaces that own the traffic-light clearance", () => {
    expect(COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS).toContain("data-sidebar-state=collapsed");
    expect(COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS).not.toContain("data-task-detail-open");
  });
});
