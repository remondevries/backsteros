import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildInboxTaskListItem,
  getInboxAttentionGroupKey,
  getInboxAttentionKeyboardItemIds,
  groupInboxItemsByAttentionStatus,
  isInboxOverdueTask,
  taskBelongsInInbox,
} from "./inbox-items.js";

const wednesday = new Date(2026, 6, 15); // Jul 15 2026 local

function task(input: {
  id: string;
  status: string;
  inbox?: boolean;
  dueDate?: number | null;
  updatedAt?: number;
}) {
  return buildInboxTaskListItem({
    id: input.id,
    title: input.id,
    number: 1,
    status: input.status,
    inbox: input.inbox,
    dueDate: input.dueDate ?? null,
    updatedAt: input.updatedAt ?? 1,
  });
}

test("taskBelongsInInbox includes triage capture, hold, review, overdue", () => {
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

test("groupInboxItemsByAttentionStatus orders overdue → triage → hold → review", () => {
  const past = new Date(2026, 6, 10).getTime();
  const groups = groupInboxItemsByAttentionStatus(
    [
      task({ id: "overdue", status: "backlog", dueDate: past, updatedAt: 4 }),
      task({ id: "review", status: "in_review", updatedAt: 3 }),
      task({ id: "hold", status: "on_hold", updatedAt: 2 }),
      task({ id: "triage", status: "triage", inbox: true, updatedAt: 1 }),
    ],
    wednesday,
  );
  assert.deepEqual(
    groups.map((group) => group.status),
    ["overdue", "triage", "on_hold", "in_review"],
  );
  assert.equal(groups[0]?.items[0]?.id, "overdue");
  assert.equal(groups[0]?.label, "Overdue");
});

test("getInboxAttentionKeyboardItemIds follows visual group order, not updatedAt", () => {
  const past = new Date(2026, 6, 10).getTime();
  const items = [
    task({ id: "review", status: "in_review", updatedAt: 99 }),
    task({ id: "triage", status: "triage", inbox: true, updatedAt: 1 }),
    task({ id: "overdue", status: "backlog", dueDate: past, updatedAt: 50 }),
    task({ id: "hold", status: "on_hold", updatedAt: 80 }),
  ];
  assert.deepEqual(getInboxAttentionKeyboardItemIds(items, new Set(), wednesday), [
    "overdue",
    "triage",
    "hold",
    "review",
  ]);
  assert.deepEqual(
    getInboxAttentionKeyboardItemIds(items, new Set(["triage"]), wednesday),
    ["overdue", "hold", "review"],
  );
});
