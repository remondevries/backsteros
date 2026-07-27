import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyInboxListOrder,
  buildInboxTaskListItem,
  mergeInboxListOrder,
} from "./inbox-items";

describe("mergeInboxListOrder", () => {
  const a = buildInboxTaskListItem({
    id: "a",
    title: "A",
    number: 1,
    status: "triage",
    updatedAt: 100,
  });
  const b = buildInboxTaskListItem({
    id: "b",
    title: "B",
    number: 2,
    status: "triage",
    updatedAt: 200,
  });
  const c = buildInboxTaskListItem({
    id: "c",
    title: "C",
    number: 3,
    status: "triage",
    updatedAt: 300,
  });

  it("keeps previous order when a property update reshuffles source by updatedAt", () => {
    const order = mergeInboxListOrder([], [c, b, a]);
    const bUpdated = buildInboxTaskListItem({
      id: "b",
      title: "B",
      number: 2,
      status: "triage",
      priority: 2,
      updatedAt: 400,
    });
    const nextOrder = mergeInboxListOrder(order, [bUpdated, c, a]);
    assert.deepEqual(nextOrder, ["c", "b", "a"]);
    assert.deepEqual(
      applyInboxListOrder([bUpdated, c, a], nextOrder).map((item) => item.id),
      ["c", "b", "a"],
    );
  });

  it("does not wipe order on a transient empty snapshot", () => {
    const order = mergeInboxListOrder([], [c, b, a]);
    assert.deepEqual(mergeInboxListOrder(order, []), ["c", "b", "a"]);
  });

  it("appends newly appeared items", () => {
    const order = mergeInboxListOrder([], [c, b]);
    const next = mergeInboxListOrder(order, [c, b, a]);
    assert.deepEqual(next, ["c", "b", "a"]);
  });
});
