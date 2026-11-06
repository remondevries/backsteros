import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clearInboxOpenAfterRemovalForTests,
  consumeInboxOpenAfterRemoval,
  peekInboxOpenAfterRemovalForTests,
  queueInboxOpenAfterRemoval,
} from "./inbox-open-after-removal.ts";

describe("inbox-open-after-removal", () => {
  it("queues and consumes a single pending open", () => {
    clearInboxOpenAfterRemovalForTests();
    queueInboxOpenAfterRemoval({
      href: "/email/box/msg-b?list=inbox",
      itemId: "email:box:thr-b",
    });
    assert.deepEqual(peekInboxOpenAfterRemovalForTests(), {
      href: "/email/box/msg-b?list=inbox",
      itemId: "email:box:thr-b",
    });
    assert.deepEqual(consumeInboxOpenAfterRemoval(), {
      href: "/email/box/msg-b?list=inbox",
      itemId: "email:box:thr-b",
    });
    assert.equal(consumeInboxOpenAfterRemoval(), null);
  });

  it("ignores empty hrefs", () => {
    clearInboxOpenAfterRemovalForTests();
    queueInboxOpenAfterRemoval({ href: "  ", itemId: "x" });
    assert.equal(peekInboxOpenAfterRemovalForTests(), null);
  });
});
