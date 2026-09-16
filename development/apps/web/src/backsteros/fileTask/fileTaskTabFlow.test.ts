import { describe, expect, it } from "vite-plus/test";

import {
  fileTaskTabFieldFromDropdownId,
  getNextFileTaskTabField,
  getPreviousFileTaskTabField,
} from "./fileTaskTabFlow";

describe("fileTaskTabFlow", () => {
  it("maps chip dropdown ids", () => {
    expect(fileTaskTabFieldFromDropdownId("project")).toBe("project");
    expect(fileTaskTabFieldFromDropdownId("agent")).toBe("agent");
    expect(fileTaskTabFieldFromDropdownId("status")).toBe(null);
  });

  it("Tab advances agent → project → brief", () => {
    expect(getNextFileTaskTabField("agent", { hasAgent: true })).toBe("project");
    expect(getNextFileTaskTabField("project", { hasAgent: true })).toBe("brief");
    expect(getNextFileTaskTabField("brief", { hasAgent: true })).toBe("agent");
  });

  it("Shift+Tab from brief goes to agent first, then project", () => {
    expect(getPreviousFileTaskTabField("brief", { hasAgent: true })).toBe("agent");
    expect(getPreviousFileTaskTabField("agent", { hasAgent: true })).toBe("project");
    expect(getPreviousFileTaskTabField("project", { hasAgent: true })).toBe("brief");
  });

  it("skips agent when none is available", () => {
    expect(getNextFileTaskTabField("brief", { hasAgent: false })).toBe("project");
    expect(getNextFileTaskTabField("project", { hasAgent: false })).toBe("brief");
    expect(getPreviousFileTaskTabField("brief", { hasAgent: false })).toBe("project");
    expect(getPreviousFileTaskTabField("project", { hasAgent: false })).toBe("brief");
  });
});
