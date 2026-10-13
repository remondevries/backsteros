import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildInboxMeetingListItem,
  buildInboxTaskListItem,
  emailInboxItemId,
} from "./inbox-items.js";
import {
  buildInboxTriageNotification,
  collectInboxTriageArrivals,
  inboxTriageItemStableId,
  snapshotInboxTriageKeys,
} from "./inbox-triage-notifications.js";

const wednesday = new Date(2026, 7, 20, 12, 0, 0);

test("collectInboxTriageArrivals skips initial seed", () => {
  const task = buildInboxTaskListItem({
    id: "t1",
    title: "Capture",
    number: 1,
    status: "triage",
    inbox: true,
    updatedAt: 1,
  });
  assert.deepEqual(
    collectInboxTriageArrivals({ previousKeys: new Set(), items: [task] }),
    [],
  );
});

test("collectInboxTriageArrivals notifies new triage task only", () => {
  const task = buildInboxTaskListItem({
    id: "t1",
    title: "Capture",
    number: 3,
    status: "triage",
    inbox: true,
    updatedAt: 1,
  });
  const arrivals = collectInboxTriageArrivals({
    previousKeys: new Set(["other"]),
    items: [task],
    referenceDate: wednesday,
  });
  assert.equal(arrivals.length, 1);
  assert.equal(arrivals[0]?.kind, "task");
  assert.equal(arrivals[0]?.key, "triage:task:t1");
  assert.match(arrivals[0]?.body ?? "", /Capture/);
});

test("collectInboxTriageArrivals excludes agents and overdue", () => {
  const agentTask = buildInboxTaskListItem({
    id: "agent",
    title: "Agent task",
    number: 1,
    status: "ready_to_start",
    inbox: false,
    agentCreatedAt: Date.now(),
    updatedAt: 1,
  });
  const overdueTask = buildInboxTaskListItem({
    id: "overdue",
    title: "Late",
    number: 2,
    status: "triage",
    inbox: true,
    dueDate: new Date(2026, 7, 1).getTime(),
    updatedAt: 1,
  });
  const arrivals = collectInboxTriageArrivals({
    previousKeys: new Set(),
    items: [agentTask, overdueTask],
    referenceDate: wednesday,
  });
  assert.equal(arrivals.length, 0);
});

test("buildInboxTriageNotification for meeting booking", () => {
  const meeting = buildInboxMeetingListItem({
    id: "m1",
    title: "Portal booking",
    number: 7,
    status: "triage",
    startAt: new Date(2026, 7, 24, 9, 0).toISOString(),
    endAt: new Date(2026, 7, 24, 10, 0).toISOString(),
    updatedAt: 1,
  });
  const notification = buildInboxTriageNotification(meeting);
  assert.equal(notification?.kind, "meeting");
  assert.equal(notification?.key, "triage:meeting:m1");
  // Meetings open in the calendar (`getCalendarMeetingHref`), not `/inbox/…`.
  assert.equal(notification?.href, "/calendar/meetings/m1");
});

test("snapshotInboxTriageKeys tracks stable email ids", () => {
  const emailId = emailInboxItemId("inbox-1", "thread-1", "msg-1");
  const keys = snapshotInboxTriageKeys(
    [
      {
        kind: "email",
        id: emailId,
        inboxId: "inbox-1",
        messageId: "msg-1",
        threadId: "thread-1",
        title: "Hello",
        partyLabel: "Alice",
        status: "triage",
        priority: 0,
        dueDate: null,
        updatedAt: 1,
        assigneeId: null,
        projectId: null,
        projectKey: null,
        projectName: null,
        projectIcon: null,
      },
    ],
    wednesday,
  );
  assert.equal(keys.has("inbox-1:msg-1"), true);
  assert.equal(inboxTriageItemStableId({
    kind: "email",
    id: emailId,
    inboxId: "inbox-1",
    messageId: "msg-1",
    threadId: "thread-1",
    title: "Hello",
    partyLabel: null,
    status: "triage",
    priority: 0,
    dueDate: null,
    updatedAt: 1,
    assigneeId: null,
    projectId: null,
    projectKey: null,
    projectName: null,
    projectIcon: null,
  }), "inbox-1:msg-1");
});
