import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildInboxEmailListItem,
  buildInboxTaskListItem,
  emailBelongsInInbox,
  getInboxAttentionGroupKey,
  getInboxAttentionKeyboardItemIds,
  getInboxHrefAfterRemovingItem,
  getInboxItemDisplayId,
  getInboxItemHref,
  groupInboxItemsByAttentionStatus,
  isAgentInboxPending,
  isInboxOverdueTask,
  pickIdAfterRemoving,
  resolveInboxEmailIconColor,
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

test("taskBelongsInInbox includes triage, hold, review, overdue; skips today-or-later due", () => {
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

test("taskBelongsInInbox excludes habit-linked day instances", () => {
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

test("taskBelongsInInbox excludes tasks due today or later", () => {
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
        dueDate: new Date(2026, 6, 14).getTime(),
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
    task({ id: "progress", status: "in_progress", updatedAt: 90 }),
    task({ id: "overdue", status: "backlog", dueDate: past, updatedAt: 50 }),
    task({ id: "hold", status: "on_hold", updatedAt: 80 }),
  ];
  assert.deepEqual(getInboxAttentionKeyboardItemIds(items, new Set(), wednesday), [
    "agent",
    "overdue",
    "triage",
    "progress",
    "hold",
    "review",
  ]);
  assert.deepEqual(
    getInboxAttentionKeyboardItemIds(items, new Set(["triage"]), wednesday),
    ["agent", "overdue", "progress", "hold", "review"],
  );
});

test("email inbox items group by status and link to email routes", () => {
  const email = buildInboxEmailListItem({
    inboxId: "in_1",
    messageId: "msg_1",
    threadId: "thr_1",
    title: "Invoice",
    status: "triage",
    updatedAt: 10,
  });
  assert.equal(email.kind, "email");
  assert.equal(email.id, "email:in_1:thr_1");
  assert.equal(getInboxItemHref(email), "/email/in_1/msg_1?list=inbox");
  assert.equal(getInboxAttentionGroupKey(email, wednesday), "triage");
  const groups = groupInboxItemsByAttentionStatus(
    [
      email,
      buildInboxEmailListItem({
        inboxId: "in_1",
        messageId: "msg_2",
        title: "Working",
        status: "in_progress",
        updatedAt: 11,
      }),
    ],
    wednesday,
  );
  assert.equal(groups[0]?.status, "triage");
  assert.equal(groups[0]?.label, "Triage");
  assert.equal(groups[1]?.status, "in_progress");
});

test("emailBelongsInInbox keeps undated untriaged mail; excludes today-or-later due", () => {
  const past = new Date(2026, 6, 10).getTime();
  const today = new Date(2026, 6, 15).getTime();
  const tomorrow = new Date(2026, 6, 16).getTime();
  const future = new Date(2026, 6, 20).getTime();
  assert.equal(emailBelongsInInbox({ status: null }, wednesday), true);
  assert.equal(emailBelongsInInbox({ status: "triage" }, wednesday), true);
  assert.equal(
    emailBelongsInInbox({ status: "triage", dueDate: today }, wednesday),
    false,
  );
  assert.equal(
    emailBelongsInInbox({ status: "triage", dueDate: tomorrow }, wednesday),
    false,
  );
  assert.equal(
    emailBelongsInInbox({ status: "in_progress" }, wednesday),
    true,
  );
  assert.equal(
    emailBelongsInInbox({ status: "on_hold", dueDate: future }, wednesday),
    false,
  );
  assert.equal(
    emailBelongsInInbox({ status: "on_hold", dueDate: past }, wednesday),
    true,
  );
  assert.equal(
    emailBelongsInInbox({ status: "ready_to_start", dueDate: past }, wednesday),
    true,
  );
  assert.equal(
    emailBelongsInInbox({ status: "ready_to_start", dueDate: null }, wednesday),
    false,
  );
  assert.equal(
    emailBelongsInInbox({ status: "completed" }, wednesday),
    false,
  );
});

test("resolveInboxEmailIconColor uses triage orange for untriaged mail", () => {
  assert.equal(resolveInboxEmailIconColor(null), "#ee7a47");
  assert.equal(resolveInboxEmailIconColor("triage"), "#ee7a47");
  assert.equal(resolveInboxEmailIconColor("in_progress"), "#e9c141");
});

test("untriaged email with past due groups in Overdue like tasks", () => {
  const past = new Date(2026, 6, 10).getTime();
  const email = buildInboxEmailListItem({
    inboxId: "in_1",
    messageId: "msg_1",
    title: "New mail",
    status: "triage",
    dueDate: past,
    updatedAt: 10,
  });
  assert.equal(getInboxAttentionGroupKey(email, wednesday), "overdue");
});

test("getInboxItemDisplayId uses project key once numbered", () => {
  const item = buildInboxTaskListItem({
    id: "t1",
    title: "Hello",
    number: 53,
    status: "triage",
    projectKey: "BOD",
  });
  assert.equal(getInboxItemDisplayId(item), "BOD-53");
});

test("getInboxItemDisplayId omits fake zero numbers pending server assign", () => {
  const item = buildInboxTaskListItem({
    id: "t1",
    title: "Hello",
    number: 0,
    status: "triage",
    projectKey: "BOD",
  });
  assert.equal(getInboxItemDisplayId(item), "BOD");
});
