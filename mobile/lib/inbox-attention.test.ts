import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getInboxAttentionGroupKey,
  taskBelongsInInbox,
} from "./inbox-attention";

const wednesday = new Date(2026, 6, 15); // Jul 15 2026 local

describe("taskBelongsInInbox", () => {
  it("includes triage, hold, review, overdue; skips today-or-later due", () => {
    assert.equal(
      taskBelongsInInbox({ inbox: true, status: "triage" }, wednesday),
      true,
    );
    assert.equal(
      taskBelongsInInbox({ inbox: false, status: "on_hold" }, wednesday),
      true,
    );
    assert.equal(
      taskBelongsInInbox({ inbox: false, status: "in_review" }, wednesday),
      true,
    );
    assert.equal(
      taskBelongsInInbox(
        {
          inbox: false,
          status: "on_hold",
          dueDate: new Date(2026, 6, 15).getTime(),
        },
        wednesday,
      ),
      false,
    );
    assert.equal(
      taskBelongsInInbox(
        {
          inbox: false,
          status: "on_hold",
          dueDate: new Date(2026, 6, 16).getTime(),
        },
        wednesday,
      ),
      false,
    );
    assert.equal(
      taskBelongsInInbox(
        {
          inbox: false,
          status: "in_review",
          dueDate: new Date(2026, 6, 10).getTime(),
        },
        wednesday,
      ),
      true,
    );
    assert.equal(
      taskBelongsInInbox(
        {
          inbox: false,
          status: "ready_to_start",
          dueDate: new Date(2026, 6, 10).getTime(),
        },
        wednesday,
      ),
      true,
    );
    assert.equal(
      taskBelongsInInbox(
        { inbox: false, status: "ready_to_start", dueDate: null },
        wednesday,
      ),
      false,
    );
  });

  it("excludes tasks due today or later even when inbox/triage/agent", () => {
    assert.equal(
      taskBelongsInInbox(
        {
          inbox: true,
          status: "triage",
          dueDate: new Date(2026, 6, 15).getTime(),
        },
        wednesday,
      ),
      false,
    );
    assert.equal(
      taskBelongsInInbox(
        {
          inbox: true,
          status: "triage",
          dueDate: new Date(2026, 6, 16).getTime(),
        },
        wednesday,
      ),
      false,
    );
    assert.equal(
      taskBelongsInInbox(
        {
          inbox: false,
          status: "ready_to_start",
          agentCreatedAt: Date.now(),
          agentInboxApprovedAt: null,
          dueDate: new Date(2026, 6, 20).getTime(),
        },
        wednesday,
      ),
      false,
    );
    assert.equal(
      taskBelongsInInbox(
        {
          inbox: false,
          status: "in_progress",
          inboxUpdatedAt: Date.now(),
          dueDate: new Date(2026, 6, 20).getTime(),
        },
        wednesday,
      ),
      false,
    );
  });

  it("includes pending agent-created tasks and inboxUpdatedAt when undated", () => {
    assert.equal(
      taskBelongsInInbox({
        inbox: false,
        status: "ready_to_start",
        agentCreatedAt: Date.now(),
        agentInboxApprovedAt: null,
      }),
      true,
    );
    assert.equal(
      taskBelongsInInbox({
        inbox: false,
        status: "ready_to_start",
        agentCreatedAt: Date.now(),
        agentInboxApprovedAt: Date.now(),
      }),
      false,
    );
    assert.equal(
      taskBelongsInInbox({
        inbox: false,
        status: "in_progress",
        inboxUpdatedAt: Date.now(),
      }),
      true,
    );
  });

  it("excludes habit-linked day instances", () => {
    assert.equal(
      taskBelongsInInbox(
        {
          inbox: false,
          status: "ready_to_start",
          dueDate: new Date(2026, 6, 10).getTime(),
          habitId: "habit-run",
        },
        wednesday,
      ),
      false,
    );
    assert.equal(
      taskBelongsInInbox(
        {
          inbox: true,
          status: "triage",
          habitId: "habit-run",
        },
        wednesday,
      ),
      false,
    );
    assert.equal(
      taskBelongsInInbox(
        {
          inbox: false,
          status: "on_hold",
          habitId: "  ",
        },
        wednesday,
      ),
      true,
    );
  });
});

describe("getInboxAttentionGroupKey", () => {
  it("prefers updated, then agents, then overdue", () => {
    assert.equal(
      getInboxAttentionGroupKey({
        status: "in_progress",
        inboxUpdatedAt: Date.now(),
      }),
      "updated",
    );
    assert.equal(
      getInboxAttentionGroupKey({
        status: "ready_to_start",
        agentCreatedAt: Date.now(),
        agentInboxApprovedAt: null,
      }),
      "agents",
    );
    assert.equal(
      getInboxAttentionGroupKey(
        {
          status: "ready_to_start",
          dueDate: new Date(2026, 6, 10).getTime(),
        },
        wednesday,
      ),
      "overdue",
    );
    assert.equal(
      getInboxAttentionGroupKey({ inbox: true, status: "triage" }),
      "triage",
    );
  });
});
