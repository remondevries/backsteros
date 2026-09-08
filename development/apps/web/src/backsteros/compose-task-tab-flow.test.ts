import { describe, expect, it } from "vitest";

import { getNextComposeTaskTabField } from "./compose-task-tab-flow";

describe("getNextComposeTaskTabField", () => {
  it("walks description → status → dueDate → priority → assignee → submit", () => {
    const context = { statusEnabled: true, assigneeEnabled: true };
    expect(getNextComposeTaskTabField("description", context)).toBe("status");
    expect(getNextComposeTaskTabField("status", context)).toBe("dueDate");
    expect(getNextComposeTaskTabField("dueDate", context)).toBe("priority");
    expect(getNextComposeTaskTabField("priority", context)).toBe("assignee");
    expect(getNextComposeTaskTabField("assignee", context)).toBe("submit");
    expect(getNextComposeTaskTabField("submit", context)).toBe(null);
  });

  it("skips disabled status and assignee", () => {
    const context = { statusEnabled: false, assigneeEnabled: false };
    expect(getNextComposeTaskTabField("description", context)).toBe("dueDate");
    expect(getNextComposeTaskTabField("dueDate", context)).toBe("priority");
    expect(getNextComposeTaskTabField("priority", context)).toBe("submit");
  });
});
