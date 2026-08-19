import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildInboxTaskListItem,
  getInboxAttentionGroupKey,
  getInboxAttentionKeyboardItemIds,
  getInboxHrefAfterRemovingItem,
  getInboxItemHref,
  groupInboxItemsByAttentionStatus,
  isAgentInboxPending,
  isInboxOverdueTask,
  pickIdAfterRemoving,
  taskBelongsInInbox,
} from "./inbox-items.js";

const wednesday = new Date(2026, 6, 15); // Jul 15 2026 local

function task(input: {
  id: string;
  status: string;
  inbox?: boolean;
  dueDate?: number | null;
  updatedAt?: number;
  agentCreatedAt?: number | null;
  agentInboxApprovedAt?: number | null;
}) {
  return buildInboxTaskListItem({
    id: input.id,
    title: input.id,
    number: 1,
    status: input.status,
    inbox: input.inbox,
    dueDate: input.dueDate ?? null,
    updatedAt: input.updatedAt ?? 1,
    agentCreatedAt: input.agentCreatedAt,
    agentInboxApprovedAt: input.agentInboxApprovedAt,
  });
}

test("taskBelongsInInbox includes triage, hold, review, overdue; skips future-due hold/review", () => {
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
    true,
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
  assert.equal(
    taskBelongsInInbox(
      {
        inbox: false,
        status: "completed",
        dueDate: new Date(2026, 6, 10).getTime(),
      },
      wednesday,
    ),
    false,
  );
});

test("taskBelongsInInbox includes pending agent-created tasks", () => {
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
});

test("isAgentInboxPending requires created timestamp and no approval", () => {
  assert.equal(isAgentInboxPending({ agentCreatedAt: Date.now() }), true);
  assert.equal(
    isAgentInboxPending({
      agentCreatedAt: Date.now(),
      agentInboxApprovedAt: Date.now(),
    }),
    false,
  );
  assert.equal(isAgentInboxPending({}), false);
});

test("pickIdAfterRemoving prefers the item above, else the next, else null", () => {
  assert.equal(pickIdAfterRemoving(["a", "b", "c"], "b"), "a");
  assert.equal(pickIdAfterRemoving(["a", "b", "c"], "a"), "b");
  assert.equal(pickIdAfterRemoving(["a"], "a"), null);
  assert.equal(pickIdAfterRemoving(["a", "b"], "missing"), "a");
});

test("getInboxHrefAfterRemovingItem returns previous href or undefined when empty", () => {
  const items = [
    task({ id: "t1", status: "triage", inbox: true }),
    task({ id: "t2", status: "triage", inbox: true }),
  ];
  const afterRemovingSecond = items.filter((item) => item.id !== "t2");
  const afterRemovingFirst = items.filter((item) => item.id !== "t1");
  assert.equal(
    getInboxHrefAfterRemovingItem(items, "t2"),
    getInboxItemHref(items[0]!, afterRemovingSecond),
  );
  assert.equal(
    getInboxHrefAfterRemovingItem(items, "t1"),
    getInboxItemHref(items[1]!, afterRemovingFirst),
  );
  assert.equal(getInboxHrefAfterRemovingItem([items[0]!], "t1"), undefined);
});

test("getInboxAttentionGroupKey puts pending agent tasks in agents before overdue", () => {
  const past = new Date(2026, 6, 10).getTime();
  assert.equal(
    getInboxAttentionGroupKey(
      task({
        id: "agent",
        status: "ready_to_start",
        dueDate: past,
        agentCreatedAt: Date.now(),
      }),
      wednesday,
    ),
    "agents",
  );
});

test("isInboxOverdueTask excludes inactive statuses", () => {
  const past = new Date(2026, 6, 10).getTime();
  assert.equal(
    isInboxOverdueTask({ status: "in_progress", dueDate: past }, wednesday),
    true,
  );
  assert.equal(
    isInboxOverdueTask({ status: "canceled", dueDate: past }, wednesday),
    false,
  );
  assert.equal(
    isInboxOverdueTask({ status: "duplicated", dueDate: past }, wednesday),
    false,
  );
});

test("getInboxAttentionGroupKey puts past-due open tasks in overdue", () => {
  const past = new Date(2026, 6, 10).getTime();
  assert.equal(
    getInboxAttentionGroupKey(
      task({ id: "a", status: "in_review", dueDate: past }),
      wednesday,
    ),
    "overdue",
  );
  assert.equal(
    getInboxAttentionGroupKey(
      task({ id: "hold", status: "on_hold", dueDate: past }),
      wednesday,
    ),
    "overdue",
  );
  assert.equal(
    getInboxAttentionGroupKey(
      task({ id: "b", status: "ready_to_start", dueDate: past }),
      wednesday,
    ),
    "overdue",
  );
  assert.equal(
    getInboxAttentionGroupKey(
      task({ id: "c", status: "triage", inbox: true, dueDate: past }),
      wednesday,
    ),
    "overdue",
  );
  assert.equal(
    getInboxAttentionGroupKey(
      task({ id: "review", status: "in_review", dueDate: null }),
      wednesday,
    ),
    "in_review",
  );
});

test("groupInboxItemsByAttentionStatus orders agents → overdue → triage → hold → review", () => {
  const past = new Date(2026, 6, 10).getTime();
  const groups = groupInboxItemsByAttentionStatus(
    [
      task({
        id: "agent",
        status: "ready_to_start",
        updatedAt: 5,
        agentCreatedAt: Date.now(),
      }),
      task({ id: "overdue", status: "backlog", dueDate: past, updatedAt: 4 }),
      task({ id: "review", status: "in_review", updatedAt: 3 }),
      task({ id: "hold", status: "on_hold", updatedAt: 2 }),
      task({ id: "triage", status: "triage", inbox: true, updatedAt: 1 }),
    ],
    wednesday,
  );
  assert.deepEqual(
    groups.map((group) => group.status),
    ["agents", "overdue", "triage", "on_hold", "in_review"],
  );
  assert.equal(groups[0]?.items[0]?.id, "agent");
  assert.equal(groups[0]?.label, "Agents");
  assert.equal(groups[1]?.items[0]?.id, "overdue");
});

test("getInboxAttentionKeyboardItemIds follows visual group order, not updatedAt", () => {
  const past = new Date(2026, 6, 10).getTime();
  const items = [
    task({
      id: "agent",
      status: "ready_to_start",
      updatedAt: 100,
      agentCreatedAt: Date.now(),
    }),
    task({ id: "review", status: "in_review", updatedAt: 99 }),
    task({ id: "triage", status: "triage", inbox: true, updatedAt: 1 }),
    task({ id: "overdue", status: "backlog", dueDate: past, updatedAt: 50 }),
    task({ id: "hold", status: "on_hold", updatedAt: 80 }),
  ];
  assert.deepEqual(getInboxAttentionKeyboardItemIds(items, new Set(), wednesday), [
    "agent",
    "overdue",
    "triage",
    "hold",
    "review",
  ]);
  assert.deepEqual(
    getInboxAttentionKeyboardItemIds(items, new Set(["triage"]), wednesday),
    ["agent", "overdue", "hold", "review"],
  );
});
