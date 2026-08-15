import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createdTaskDetailHref } from "./created-task-href";

describe("createdTaskDetailHref", () => {
  it("keeps inbox create inside the inbox tab stack", () => {
    assert.equal(
      createdTaskDetailHref("t1", ["(app)", "inbox", "new"]),
      "/(app)/inbox/t1",
    );
  });

  it("keeps tasks create inside the tasks tab stack", () => {
    assert.equal(
      createdTaskDetailHref("t1", ["(app)", "tasks", "new"]),
      "/(app)/tasks/t1",
    );
  });

  it("keeps compose create inside tabs (inbox detail)", () => {
    assert.equal(
      createdTaskDetailHref("t1", ["(app)", "compose"]),
      "/(app)/inbox/t1",
    );
  });

  it("uses root task detail when create was opened outside tabs", () => {
    assert.equal(
      createdTaskDetailHref("t1", ["create", "task"]),
      "/task/t1",
    );
  });
});
