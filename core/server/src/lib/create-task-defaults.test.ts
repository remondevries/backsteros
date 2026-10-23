import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveCreateTaskInbox,
  resolveCreateTaskStatus,
} from "./create-task-defaults.js";

describe("resolveCreateTaskStatus", () => {
  it("defaults to backlog when no status and no flags", () => {
    assert.equal(resolveCreateTaskStatus({}), "backlog");
    assert.equal(
      resolveCreateTaskStatus({ support: false, notification: false }),
      "backlog",
    );
  });

  it("defaults to triage for support or notification when no status", () => {
    assert.equal(resolveCreateTaskStatus({ support: true }), "triage");
    assert.equal(resolveCreateTaskStatus({ notification: true }), "triage");
    assert.equal(
      resolveCreateTaskStatus({ support: true, notification: true }),
      "triage",
    );
  });

  it("keeps an explicit status, including for support and notification", () => {
    assert.equal(
      resolveCreateTaskStatus({ status: "ready_to_start" }),
      "ready_to_start",
    );
    assert.equal(
      resolveCreateTaskStatus({ status: "in_progress", support: true }),
      "in_progress",
    );
    assert.equal(
      resolveCreateTaskStatus({ status: "backlog", notification: true }),
      "backlog",
    );
  });
});

describe("resolveCreateTaskInbox", () => {
  it("puts support and notification in Inbox when inbox is omitted", () => {
    assert.equal(
      resolveCreateTaskInbox({ support: true, projectId: "p1" }),
      true,
    );
    assert.equal(
      resolveCreateTaskInbox({ notification: true, contactId: "c1" }),
      true,
    );
  });

  it("puts a task with no project and no contact in Inbox", () => {
    assert.equal(resolveCreateTaskInbox({}), true);
  });

  it("keeps an explicit inbox value", () => {
    assert.equal(resolveCreateTaskInbox({ inbox: false, support: true }), false);
    assert.equal(
      resolveCreateTaskInbox({ inbox: true, projectId: "p1" }),
      true,
    );
  });

  it("does not Inbox a normal task that has a project or contact", () => {
    assert.equal(resolveCreateTaskInbox({ projectId: "p1" }), false);
    assert.equal(resolveCreateTaskInbox({ contactId: "c1" }), false);
  });
});
