import assert from "node:assert/strict";
import { test } from "node:test";

import type { InboxListItem } from "@backsteros/ui";

import { buildInboxSessionList } from "./build-inbox-session-list.js";

function emailItem(
  id: string,
  inboxUpdatedAt: number | null = null,
): InboxListItem {
  return {
    kind: "email",
    id,
    inboxId: "inbox_1",
    messageId: id,
    title: id,
    from: "a@example.com",
    status: "on_hold",
    inboxUpdatedAt,
    updatedAt: Date.now(),
  } as InboxListItem;
}

test("drops pin-only Updated rows when the live inbox is empty", () => {
  const pinItem = emailItem("msg_1", Date.now());
  const pinnedItems = new Map([
    [
      "msg_1",
      {
        item: { ...pinItem, inboxUpdatedAt: null },
        attentionGroup: "updated",
      },
    ],
  ]);

  const cleared = buildInboxSessionList({
    sortedItems: [],
    pinnedItems,
    displayOrder: ["msg_1"],
    selectedItemId: "msg_1",
  });
  assert.equal(cleared.items.length, 0);
});

test("keeps a pin-only Updated row while selected among live rows", () => {
  const live = emailItem("msg_live", null);
  const pinItem = emailItem("msg_1", Date.now());
  const pinnedItems = new Map([
    [
      "msg_1",
      {
        item: { ...pinItem, inboxUpdatedAt: null },
        attentionGroup: "updated",
      },
    ],
  ]);

  const whileOpen = buildInboxSessionList({
    sortedItems: [live],
    pinnedItems,
    displayOrder: ["msg_1", "msg_live"],
    selectedItemId: "msg_1",
  });
  assert.equal(whileOpen.items.length, 2);
  assert.deepEqual(
    whileOpen.items.map((item) => item.id),
    ["msg_1", "msg_live"],
  );

  const afterLeave = buildInboxSessionList({
    sortedItems: [live],
    pinnedItems,
    displayOrder: ["msg_1", "msg_live"],
    selectedItemId: null,
  });
  assert.equal(afterLeave.items.length, 1);
  assert.equal(afterLeave.items[0]?.id, "msg_live");
});

test("live sorted rows still appear without selection", () => {
  const live = emailItem("msg_live", null);
  const built = buildInboxSessionList({
    sortedItems: [live],
    pinnedItems: new Map(),
    displayOrder: [],
    selectedItemId: null,
  });
  assert.equal(built.items.length, 1);
  assert.equal(built.items[0]?.id, "msg_live");
});
