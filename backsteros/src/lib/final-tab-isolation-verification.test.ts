import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import {
  closeProductTab,
  createProductTab,
  type ProductTabsState,
} from "@backsteros/ui/shell";

import { mirrorWarmKeepAliveTabsFromState } from "./activate-shell-product-tab.js";
import {
  readEmailComposeSession,
  resetEmailComposeSessionForTab,
  resetEmailComposeSessionStorageForTests,
  writeEmailComposeSession,
} from "./email-compose-session.js";
import { navigateToHref } from "../router/navigate-href.js";
import {
  getProductTabUiState,
  patchProductTabInboxUi,
  patchProductTabPageScroll,
  resetProductTabUiStateForTests,
} from "./product-tab-ui-state.js";
import {
  applyWarmKeepAlivePopstateHref,
  captureWarmNavOwner,
  isWarmNavOwnerCurrent,
  lastHrefForKeepAliveSurface,
  lastHrefForProductTabId,
  markKeepAliveSurfaceMounted,
  resetKeepAliveForTests,
  syncWarmKeepAliveProductTabs,
  tryWarmKeepAliveFlip,
} from "./shell-warm-keep-alive.js";

function installSessionStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    value: {
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
    },
    configurable: true,
  });
}

afterEach(() => {
  resetKeepAliveForTests();
  resetProductTabUiStateForTests();
  resetEmailComposeSessionStorageForTests();
});

describe("1) command-palette vs overlay async classification fixtures", () => {
  test("Tauri overlay compose: echoed owner gates delayed main navigate", () => {
    markKeepAliveSurfaceMounted("inbox");
    const tabA = createProductTab("/inbox/a");
    const tabB = createProductTab("/inbox/b");
    syncWarmKeepAliveProductTabs({
      activeTabId: tabA.id,
      tabs: [
        { id: tabA.id, href: "/inbox/a" },
        { id: tabB.id, href: "/inbox/b" },
      ],
    });
    assert.equal(tryWarmKeepAliveFlip("/inbox/a"), true);
    // Main publishes navOwner with compose context; overlay echoes on navigate.
    const overlayOwner = captureWarmNavOwner();
    syncWarmKeepAliveProductTabs({
      activeTabId: tabB.id,
      tabs: [
        { id: tabA.id, href: "/inbox/a" },
        { id: tabB.id, href: "/inbox/b" },
      ],
    });
    assert.equal(tryWarmKeepAliveFlip("/inbox/b"), true);
    let calls = 0;
    navigateToHref(
      () => {
        calls += 1;
      },
      "/inbox/created",
      { owner: overlayOwner },
    );
    assert.equal(calls, 0);
    assert.equal(lastHrefForKeepAliveSurface("inbox"), "/inbox/b");
  });

  test("sync palette-style navigate uses current tab (intentional)", () => {
    markKeepAliveSurfaceMounted("inbox");
    const tab = createProductTab("/inbox/a");
    syncWarmKeepAliveProductTabs({
      activeTabId: tab.id,
      tabs: [{ id: tab.id, href: tab.href }],
    });
    assert.equal(tryWarmKeepAliveFlip("/inbox/a"), true);
    // Command palette closeAndNavigate is sync — capture+navigate same tick.
    const owner = captureWarmNavOwner();
    navigateToHref(() => {}, "/inbox/b", { owner });
    assert.equal(lastHrefForKeepAliveSurface("inbox"), "/inbox/b");
  });

  test("BEFORE: unowned post-await navigate would move sibling; AFTER owner blocks", () => {
    markKeepAliveSurfaceMounted("inbox");
    const tabA = createProductTab("/inbox/a");
    const tabB = createProductTab("/inbox/b");
    syncWarmKeepAliveProductTabs({
      activeTabId: tabA.id,
      tabs: [
        { id: tabA.id, href: "/inbox/a" },
        { id: tabB.id, href: "/inbox/b" },
      ],
    });
    assert.equal(tryWarmKeepAliveFlip("/inbox/a"), true);
    // Compose overlay captures owner at submit start (app-shell-overlays).
    const submitOwner = captureWarmNavOwner();

    syncWarmKeepAliveProductTabs({
      activeTabId: tabB.id,
      tabs: [
        { id: tabA.id, href: "/inbox/a" },
        { id: tabB.id, href: "/inbox/b" },
      ],
    });
    assert.equal(tryWarmKeepAliveFlip("/inbox/b"), true);
    assert.equal(isWarmNavOwnerCurrent(submitOwner), false);

    // Unowned (BEFORE class) would rewrite B:
    navigateToHref(() => {}, "/inbox/created-from-a");
    assert.equal(lastHrefForKeepAliveSurface("inbox"), "/inbox/created-from-a");

    // Restore B, then owned navigate (AFTER / production overlays) no-ops.
    rememberB();
    let calls = 0;
    navigateToHref(
      () => {
        calls += 1;
      },
      "/inbox/created-from-a",
      { owner: submitOwner },
    );
    assert.equal(calls, 0);
    assert.equal(lastHrefForKeepAliveSurface("inbox"), "/inbox/b");

    function rememberB() {
      syncWarmKeepAliveProductTabs({
        activeTabId: tabB.id,
        tabs: [
          { id: tabA.id, href: "/inbox/a" },
          { id: tabB.id, href: "/inbox/b" },
        ],
      });
      assert.equal(tryWarmKeepAliveFlip("/inbox/b"), true);
    }
  });
});

describe("2) email compose send ownership (no network send)", () => {
  test("post-send session reset targets submitting tab; stale navigate blocked", () => {
    installSessionStorage();
    const tabA = createProductTab("/email/box/d-a?list=inbox");
    const tabB = createProductTab("/email/box/d-b?list=inbox");
    syncWarmKeepAliveProductTabs({
      activeTabId: tabA.id,
      tabs: [
        { id: tabA.id, href: tabA.href },
        { id: tabB.id, href: tabB.href },
      ],
    });
    writeEmailComposeSession({
      sessionId: "a",
      draftId: "draft-a",
      inboxId: "box",
      ownerTabId: tabA.id,
    });
    const sendOwner = captureWarmNavOwner();

    syncWarmKeepAliveProductTabs({
      activeTabId: tabB.id,
      tabs: [
        { id: tabA.id, href: tabA.href },
        { id: tabB.id, href: tabB.href },
      ],
    });
    writeEmailComposeSession({
      sessionId: "b",
      draftId: "draft-b",
      inboxId: "box",
      ownerTabId: tabB.id,
    });

    // Production sendDraft: resetEmailComposeSessionForTab(sendOwner.tabId)
    resetEmailComposeSessionForTab(sendOwner!.tabId);
    assert.equal(readEmailComposeSession().draftId, "draft-b");

    syncWarmKeepAliveProductTabs({
      activeTabId: tabA.id,
      tabs: [
        { id: tabA.id, href: tabA.href },
        { id: tabB.id, href: tabB.href },
      ],
    });
    assert.equal(readEmailComposeSession().draftId, null);

    // Stale post-send navigate must not move B.
    syncWarmKeepAliveProductTabs({
      activeTabId: tabB.id,
      tabs: [
        { id: tabA.id, href: tabA.href },
        { id: tabB.id, href: tabB.href },
      ],
    });
    markKeepAliveSurfaceMounted("inbox");
    assert.equal(tryWarmKeepAliveFlip("/inbox/b"), true);
    let calls = 0;
    navigateToHref(
      () => {
        calls += 1;
      },
      "/email/box/sent-msg?list=inbox",
      { owner: sendOwner },
    );
    assert.equal(calls, 0);
  });
});

describe("4) popstate active-tab + close/reopen no revival", () => {
  test("applyWarmKeepAlivePopstateHref updates only the active tab bookmark", () => {
    markKeepAliveSurfaceMounted("inbox");
    const tabA = createProductTab("/inbox/a");
    const tabB = createProductTab("/inbox/b");
    syncWarmKeepAliveProductTabs({
      activeTabId: tabA.id,
      tabs: [
        { id: tabA.id, href: "/inbox/a" },
        { id: tabB.id, href: "/inbox/b" },
      ],
    });
    assert.equal(tryWarmKeepAliveFlip("/inbox/a"), true);
    syncWarmKeepAliveProductTabs({
      activeTabId: tabB.id,
      tabs: [
        { id: tabA.id, href: "/inbox/a" },
        { id: tabB.id, href: "/inbox/b" },
      ],
    });
    assert.equal(tryWarmKeepAliveFlip("/inbox/b"), true);

    applyWarmKeepAlivePopstateHref("/inbox/from-history");
    assert.equal(lastHrefForProductTabId(tabB.id), "/inbox/from-history");
    assert.equal(lastHrefForProductTabId(tabA.id), "/inbox/a");
  });

  test("close tab prunes UI + compose session; new tab id cannot revive", () => {
    installSessionStorage();
    const tabA = createProductTab("/inbox/a");
    const tabB = createProductTab("/inbox/b");
    let state: ProductTabsState = {
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
    };
    syncWarmKeepAliveProductTabs({
      activeTabId: tabA.id,
      tabs: [
        { id: tabA.id, href: tabA.href },
        { id: tabB.id, href: tabB.href },
      ],
    });
    patchProductTabPageScroll(tabA.id, 99);
    patchProductTabInboxUi(tabA.id, { listMode: "messages" });
    writeEmailComposeSession({
      sessionId: "a",
      draftId: "draft-a",
      inboxId: "box",
      ownerTabId: tabA.id,
    });

    const closed = closeProductTab(state, tabA.id);
    state = closed.state;
    mirrorWarmKeepAliveTabsFromState(state);

    assert.equal(getProductTabUiState(tabA.id).pageScrollTop, 0);
    assert.equal(getProductTabUiState(tabA.id).inbox.listMode, null);
    assert.equal(lastHrefForProductTabId(tabA.id), null);

    // Fresh tab id — no revived compose/UI from closed A.
    const tabC = createProductTab("/inbox");
    syncWarmKeepAliveProductTabs({
      activeTabId: tabC.id,
      tabs: [
        { id: tabB.id, href: tabB.href },
        { id: tabC.id, href: tabC.href },
      ],
    });
    assert.equal(readEmailComposeSession().draftId, null);
  });
});
