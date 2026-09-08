import { describe, expect, it } from "vitest";

import {
  composeTaskTabFieldFromPropertyDropdownId,
  getNextComposeTaskTabField,
  getPreviousComposeTaskTabField,
} from "./compose-task-tab-flow";

describe("getNextComposeTaskTabField", () => {
  it("walks description → status → dueDate → priority → assignee → cancel → submit", () => {
    const context = { statusEnabled: true, assigneeEnabled: true };
    expect(getNextComposeTaskTabField("description", context)).toBe("status");
    expect(getNextComposeTaskTabField("status", context)).toBe("dueDate");
    expect(getNextComposeTaskTabField("dueDate", context)).toBe("priority");
    expect(getNextComposeTaskTabField("priority", context)).toBe("assignee");
    expect(getNextComposeTaskTabField("assignee", context)).toBe("cancel");
    expect(getNextComposeTaskTabField("cancel", context)).toBe("submit");
    expect(getNextComposeTaskTabField("submit", context)).toBe(null);
  });

  it("skips disabled status and assignee", () => {
    const context = { statusEnabled: false, assigneeEnabled: false };
    expect(getNextComposeTaskTabField("description", context)).toBe("dueDate");
    expect(getNextComposeTaskTabField("dueDate", context)).toBe("priority");
    expect(getNextComposeTaskTabField("priority", context)).toBe("cancel");
  });
});

describe("getPreviousComposeTaskTabField", () => {
  it("walks submit → cancel → assignee → priority → dueDate → status → description", () => {
    const context = { statusEnabled: true, assigneeEnabled: true };
    expect(getPreviousComposeTaskTabField("submit", context)).toBe("cancel");
    expect(getPreviousComposeTaskTabField("cancel", context)).toBe("assignee");
    expect(getPreviousComposeTaskTabField("assignee", context)).toBe("priority");
    expect(getPreviousComposeTaskTabField("priority", context)).toBe("dueDate");
    expect(getPreviousComposeTaskTabField("dueDate", context)).toBe("status");
    expect(getPreviousComposeTaskTabField("status", context)).toBe("description");
    expect(getPreviousComposeTaskTabField("description", context)).toBe(null);
  });

  it("skips disabled status and assignee", () => {
    const context = { statusEnabled: false, assigneeEnabled: false };
    expect(getPreviousComposeTaskTabField("cancel", context)).toBe("priority");
    expect(getPreviousComposeTaskTabField("dueDate", context)).toBe("description");
  });
});

describe("composeTaskTabFieldFromPropertyDropdownId", () => {
  it("maps known property chips", () => {
    expect(composeTaskTabFieldFromPropertyDropdownId("status")).toBe("status");
    expect(composeTaskTabFieldFromPropertyDropdownId("project")).toBe(null);
  });
});
