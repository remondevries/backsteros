import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import {
  activateProductTab,
  buildProductTabHref,
  createProductTab,
  syncActiveTabToPath,
  type ProductTabsState,
} from "@backsteros/ui/shell";

import { navigateToHref } from "../router/navigate-href.js";
import {
  getProductTabUiState,
  patchProductTabCommunicationUi,
  patchProductTabInboxUi,
  pruneProductTabUiState,
  resetProductTabUiStateForTests,
} from "./product-tab-ui-state.js";
import {
  captureWarmNavOwner,
  isWarmNavOwnerCurrent,
  lastHrefForKeepAliveSurface,
  lastHrefForProductTabId,
  markKeepAliveSurfaceMounted,
  rememberKeepAliveHref,
  resetKeepAliveForTests,
  syncWarmKeepAliveProductTabs,
  tryWarmKeepAliveFlip,
} from "./shell-warm-keep-alive.js";

/**
 * Hardening coverage for adversarial findings on f1ec5ba:
 * mirror clobber, owned navigate (production path), per-tab UI, popstate owner.
 * Exercises product-tab helpers + navigateToHref (real consumer of owner).
 */

function mirror(state: ProductTabsState): void {
  syncWarmKeepAliveProductTabs({
    activeTabId: state.activeTabId,
    tabs: state.tabs.map((tab) => ({ id: tab.id, href: tab.href })),
  });
}

/** Same flush+activate sequence as useShellTabs.activateTab. */
function activateLikeShell(
  state: ProductTabsState,
  tabId: string,
  livePathname: string,
  liveSearch = "",
): ProductTabsState {
  const flushed = syncActiveTabToPath(state, livePathname, liveSearch);
  const next = activateProductTab(flushed, tabId);
  mirror(next);
  return next;
}

afterEach(() => {
  resetKeepAliveForTests();
  resetProductTabUiStateForTests();
});

describe("mirror clobber (adversarial HIGH)", () => {
  test("warm-ahead selection on A survives sync with stale tab.href then return", () => {
    markKeepAliveSurfaceMounted("inbox");
    const tabA = createProductTab("/inbox/item-a");
    const tabB = createProductTab("/inbox/item-b");
    let state: ProductTabsState = {
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
    };
    mirror(state);
    assert.equal(tryWarmKeepAliveFlip("/inbox/item-a"), true);

    // In-tab selection advances warm ahead of product-tab bookmark.
    rememberKeepAliveHref("inbox", "/inbox/item-a-newer", "");
    assert.equal(
      lastHrefForProductTabId(tabA.id),
      "/inbox/item-a-newer",
    );

    // BEFORE fix: sync with stale tab.href clobbered A to item-a.
    // activateTab now flushes live location first when chrome caught up;
    // even without flush, sync must not regress warm.
    state = {
      tabs: [
        { ...tabA, href: "/inbox/item-a" },
        { ...tabB, href: "/inbox/item-b" },
      ],
      activeTabId: tabA.id,
    };
    state = activateProductTab(state, tabB.id);
    mirror(state);
    assert.equal(
      lastHrefForProductTabId(tabA.id),
      "/inbox/item-a-newer",
      "inactive tab warm bookmark must not regress",
    );

    state = activateProductTab(state, tabA.id);
    mirror(state);
    assert.equal(lastHrefForKeepAliveSurface("inbox"), "/inbox/item-a-newer");
  });

  test("activateLikeShell flush persists live selection onto leaving tab", () => {
    markKeepAliveSurfaceMounted("inbox");
    const tabA = createProductTab("/inbox/item-a");
    const tabB = createProductTab("/inbox/item-b");
    let state: ProductTabsState = {
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
    };
    mirror(state);
    assert.equal(tryWarmKeepAliveFlip("/inbox/item-a"), true);
    rememberKeepAliveHref("inbox", "/inbox/item-a-newer", "");

    state = activateLikeShell(state, tabB.id, "/inbox/item-a-newer");
    const leaving = state.tabs.find((tab) => tab.id === tabA.id);
    assert.equal(leaving?.href, "/inbox/item-a-newer");
    assert.equal(tryWarmKeepAliveFlip("/inbox/item-b"), true);

    activateLikeShell(state, tabA.id, "/inbox/item-b");
    assert.equal(lastHrefForKeepAliveSurface("inbox"), "/inbox/item-a-newer");
  });
});

describe("owned navigateToHref (production path)", () => {
  test("stale owner does not warm-flip or invoke TanStack navigate", () => {
    markKeepAliveSurfaceMounted("inbox");
    const tabA = createProductTab("/inbox/a");
    const tabB = createProductTab("/inbox/b");
    mirror({
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
    });
    assert.equal(tryWarmKeepAliveFlip("/inbox/a"), true);
    const ownerA = captureWarmNavOwner();
    assert.ok(ownerA);

    mirror({
      tabs: [tabA, tabB],
      activeTabId: tabB.id,
    });
    assert.equal(tryWarmKeepAliveFlip("/inbox/b"), true);
    assert.equal(isWarmNavOwnerCurrent(ownerA), false);

    let tanstackCalls = 0;
    navigateToHref(
      () => {
        tanstackCalls += 1;
      },
      "/inbox/stale-from-a",
      { owner: ownerA },
    );
    assert.equal(tanstackCalls, 0);
    assert.equal(lastHrefForKeepAliveSurface("inbox"), "/inbox/b");
  });

  test("current owner may warm-flip selection", () => {
    markKeepAliveSurfaceMounted("inbox");
    const tabA = createProductTab("/inbox/a");
    mirror({
      tabs: [tabA],
      activeTabId: tabA.id,
    });
    assert.equal(tryWarmKeepAliveFlip("/inbox/a"), true);
    const owner = captureWarmNavOwner();
    navigateToHref(() => {}, "/inbox/a2", { owner });
    assert.equal(lastHrefForKeepAliveSurface("inbox"), "/inbox/a2");
  });
});

describe("per-tab UI state (Inbox / Communication)", () => {
  test("inbox mode and compose drafts stay isolated across tabs", () => {
    const tabA = createProductTab("/inbox/a");
    const tabB = createProductTab("/inbox/b");
    patchProductTabInboxUi(tabA.id, { listMode: "notifications" });
    patchProductTabInboxUi(tabB.id, { listMode: "messages" });
    assert.equal(getProductTabUiState(tabA.id).inbox.listMode, "notifications");
    assert.equal(getProductTabUiState(tabB.id).inbox.listMode, "messages");

    patchProductTabCommunicationUi(tabA.id, {
      composeTo: "a@example.com",
      createOpen: true,
    });
    patchProductTabCommunicationUi(tabB.id, {
      composeTo: "b@example.com",
      createOpen: false,
    });
    assert.equal(
      getProductTabUiState(tabA.id).communication.composeTo,
      "a@example.com",
    );
    assert.equal(
      getProductTabUiState(tabB.id).communication.composeTo,
      "b@example.com",
    );
    assert.equal(getProductTabUiState(tabA.id).communication.createOpen, true);

    pruneProductTabUiState([tabB.id]);
    assert.equal(getProductTabUiState(tabA.id).inbox.listMode, null);
    assert.equal(
      getProductTabUiState(tabB.id).communication.composeTo,
      "b@example.com",
    );
  });
});

describe("browser popstate vs product-tab semantics", () => {
  test("popstate-shaped remember binds only the active tab slot", () => {
    markKeepAliveSurfaceMounted("inbox");
    const tabA = createProductTab("/inbox/a");
    const tabB = createProductTab("/inbox/b");
    mirror({
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
    });
    assert.equal(tryWarmKeepAliveFlip("/inbox/a"), true);

    mirror({
      tabs: [tabA, tabB],
      activeTabId: tabB.id,
    });
    assert.equal(tryWarmKeepAliveFlip("/inbox/b"), true);

    // OS back while B is active — only B’s bookmark moves.
    rememberKeepAliveHref("inbox", "/inbox/from-history", "", {
      tabId: tabB.id,
      generation: captureWarmNavOwner()!.generation,
    });
    assert.equal(lastHrefForProductTabId(tabB.id), "/inbox/from-history");
    assert.equal(lastHrefForProductTabId(tabA.id), "/inbox/a");
  });
});

describe("tasks tab query isolation", () => {
  test("buildProductTabHref keeps due on /tasks", () => {
    assert.equal(
      buildProductTabHref("/tasks", "?due=overdue&view=list"),
      "/tasks?due=overdue&view=list",
    );
  });
});
