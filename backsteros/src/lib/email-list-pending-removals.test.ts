import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import {
  clearEmailListPendingRemovalsForTests,
  filterOutPendingEmailListRemovals,
  forgetEmailListRemoval,
  isEmailListItemPendingRemoval,
  peekEmailListPendingRemovalsForTests,
  rememberEmailListRemoval,
} from "./email-list-pending-removals.js";

describe("email-list-pending-removals", () => {
  beforeEach(() => {
    clearEmailListPendingRemovalsForTests();
  });

  it("remembers a message/thread tombstone and filters matching rows", () => {
    rememberEmailListRemoval({
      inboxId: "inb-1",
      messageId: "msg-1",
      threadId: "thr-1",
    });
    assert.equal(peekEmailListPendingRemovalsForTests().length, 1);
    assert.equal(
      isEmailListItemPendingRemoval({
        inboxId: "inb-1",
        id: "msg-1",
        threadId: "thr-1",
      }),
      true,
    );
    assert.equal(
      isEmailListItemPendingRemoval({
        inboxId: "inb-1",
        id: "msg-other",
        threadId: "thr-1",
      }),
      true,
    );
    assert.equal(
      isEmailListItemPendingRemoval({
        inboxId: "inb-1",
        id: "msg-other",
        threadId: "thr-other",
      }),
      false,
    );

    const kept = filterOutPendingEmailListRemovals([
      { inboxId: "inb-1", id: "msg-1", threadId: "thr-1" },
      { inboxId: "inb-1", id: "msg-2", threadId: "thr-2" },
    ]);
    assert.deepEqual(kept, [
      { inboxId: "inb-1", id: "msg-2", threadId: "thr-2" },
    ]);
  });

  it("forgets a tombstone so a failed delete can resurface", () => {
    rememberEmailListRemoval({
      inboxId: "inb-1",
      messageId: "msg-1",
      threadId: "thr-1",
    });
    forgetEmailListRemoval({
      inboxId: "inb-1",
      messageId: "msg-1",
      threadId: "thr-1",
    });
    assert.equal(peekEmailListPendingRemovalsForTests().length, 0);
    assert.equal(
      isEmailListItemPendingRemoval({
        inboxId: "inb-1",
        id: "msg-1",
        threadId: "thr-1",
      }),
      false,
    );
  });
});
