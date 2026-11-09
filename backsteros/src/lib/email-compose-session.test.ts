import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import { createProductTab } from "@backsteros/ui/shell";

import {
  readEmailComposeSession,
  resetEmailComposeSession,
  resetEmailComposeSessionStorageForTests,
  writeEmailComposeSession,
} from "./email-compose-session.js";
import {
  resetKeepAliveForTests,
  syncWarmKeepAliveProductTabs,
} from "./shell-warm-keep-alive.js";

function installSessionStorage(): void {
  const store = new Map<string, string>();
  const api = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "sessionStorage", {
    value: api,
    configurable: true,
  });
}

describe("email compose session per product tab", () => {
  afterEach(() => {
    resetEmailComposeSessionStorageForTests();
    resetKeepAliveForTests();
  });

  test("draft session on tab A does not appear under tab B", () => {
    installSessionStorage();
    const tabA = createProductTab("/email/box/draft-a?list=inbox");
    const tabB = createProductTab("/email/box/draft-b?list=inbox");

    syncWarmKeepAliveProductTabs({
      activeTabId: tabA.id,
      tabs: [
        { id: tabA.id, href: tabA.href },
        { id: tabB.id, href: tabB.href },
      ],
    });
    writeEmailComposeSession({
      sessionId: "sess-a",
      draftId: "draft-a",
      inboxId: "box",
      ownerTabId: tabA.id,
    });
    assert.equal(readEmailComposeSession().draftId, "draft-a");

    syncWarmKeepAliveProductTabs({
      activeTabId: tabB.id,
      tabs: [
        { id: tabA.id, href: tabA.href },
        { id: tabB.id, href: tabB.href },
      ],
    });
    const onB = readEmailComposeSession();
    assert.notEqual(onB.draftId, "draft-a");
    assert.equal(onB.ownerTabId, tabB.id);

    writeEmailComposeSession({
      sessionId: "sess-b",
      draftId: "draft-b",
      inboxId: "box",
      ownerTabId: tabB.id,
    });
    assert.equal(readEmailComposeSession().draftId, "draft-b");

    // Stale write claiming tab A while B is active is ignored.
    writeEmailComposeSession({
      sessionId: "sess-stale",
      draftId: "draft-stale",
      inboxId: "box",
      ownerTabId: tabA.id,
    });
    assert.equal(readEmailComposeSession().draftId, "draft-b");

    syncWarmKeepAliveProductTabs({
      activeTabId: tabA.id,
      tabs: [
        { id: tabA.id, href: tabA.href },
        { id: tabB.id, href: tabB.href },
      ],
    });
    assert.equal(readEmailComposeSession().draftId, "draft-a");

    resetEmailComposeSession();
    assert.equal(readEmailComposeSession().draftId, null);
  });
});
