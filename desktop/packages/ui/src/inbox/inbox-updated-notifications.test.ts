import assert from "node:assert/strict";
import { test } from "node:test";

import { buildInboxTaskListItem } from "./inbox-items.js";
import {
  collectInboxUpdatedArrivals,
  snapshotInboxUpdatedKeys,
} from "./inbox-updated-notifications.js";

test("collectInboxUpdatedArrivals notifies when previous updated snapshot was empty", () => {
  const task = buildInboxTaskListItem({
    id: "t1",
    title: "Portal comment",
    number: 12,
    status: "in_progress",
    inbox: false,
    inboxUpdatedAt: Date.now(),
    updatedAt: 1,
  });

  const arrivals = collectInboxUpdatedArrivals({
    previousKeys: new Set(),
    items: [task],
  });

  assert.equal(arrivals.length, 1);
  assert.equal(arrivals[0]?.kind, "task");
  assert.equal(arrivals[0]?.key, "updated:task:t1");
  assert.equal(arrivals[0]?.title, "Task updated");
  assert.match(arrivals[0]?.body ?? "", /Portal comment/);
});

test("collectInboxUpdatedArrivals skips items already in previous updated snapshot", () => {
  const task = buildInboxTaskListItem({
    id: "t1",
    title: "Already seen",
    number: 3,
    status: "in_review",
    inboxUpdatedAt: Date.now(),
    updatedAt: 1,
  });

  const arrivals = collectInboxUpdatedArrivals({
    previousKeys: new Set(["t1"]),
    items: [task],
  });

  assert.equal(arrivals.length, 0);
});

test("collectInboxUpdatedArrivals detects task moving into updated from another group", () => {
  const before = buildInboxTaskListItem({
    id: "t1",
    title: "Active task",
    number: 8,
    status: "in_progress",
    updatedAt: 1,
  });
  const after = buildInboxTaskListItem({
    ...before,
    inboxUpdatedAt: Date.now(),
  });

  assert.equal(snapshotInboxUpdatedKeys([before]).size, 0);

  const arrivals = collectInboxUpdatedArrivals({
    previousKeys: snapshotInboxUpdatedKeys([before]),
    items: [after],
  });

  assert.equal(arrivals.length, 1);
  assert.equal(arrivals[0]?.key, "updated:task:t1");
});
