import assert from "node:assert/strict";
import { test } from "node:test";

import { getNextComposeTaskTabField } from "../dist/compose-task-tab-flow.js";

test("getNextComposeTaskTabField includes priority between due date and assignee", () => {
  const context = { statusEnabled: true, assigneeEnabled: true };

  assert.equal(
    getNextComposeTaskTabField("description", context),
    "status",
  );
  assert.equal(getNextComposeTaskTabField("status", context), "dueDate");
  assert.equal(getNextComposeTaskTabField("dueDate", context), "priority");
  assert.equal(getNextComposeTaskTabField("priority", context), "assignee");
  assert.equal(getNextComposeTaskTabField("assignee", context), "submit");
  assert.equal(getNextComposeTaskTabField("submit", context), null);
});

test("getNextComposeTaskTabField skips disabled status and assignee", () => {
  const context = { statusEnabled: false, assigneeEnabled: false };

  assert.equal(
    getNextComposeTaskTabField("description", context),
    "dueDate",
  );
  assert.equal(getNextComposeTaskTabField("dueDate", context), "priority");
  assert.equal(getNextComposeTaskTabField("priority", context), "submit");
});
