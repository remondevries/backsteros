import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import { createProductTab, type ProductTabsState } from "@backsteros/ui/shell";

import { prepareActivateShellProductTab } from "./activate-shell-product-tab.js";
import { navigateToHref } from "../router/navigate-href.js";
import { resetProductTabUiStateForTests } from "./product-tab-ui-state.js";
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

function bindTabs(state: ProductTabsState): void {
  syncWarmKeepAliveProductTabs({
    activeTabId: state.activeTabId,
    tabs: state.tabs.map((tab) => ({ id: tab.id, href: tab.href })),
  });
}

/**
 * Consumer-level path: prepareActivateShellProductTab (same module as
 * useShellTabs.activateTab) → navigateToHref → warm remember.
 */

afterEach(() => {
  resetKeepAliveForTests();
  resetProductTabUiStateForTests();
});

describe("prepareActivateShellProductTab → navigate (real activate path)", () => {
  test("flush + non-regress mirror keeps warm-ahead A across activate → navigate → return", () => {
    markKeepAliveSurfaceMounted("inbox");
    const tabA = createProductTab("/inbox/item-a");
    const tabB = createProductTab("/inbox/item-b");
    let state: ProductTabsState = {
      tabs: [
        { ...tabA, href: "/inbox/item-a" },
        { ...tabB, href: "/inbox/item-b" },
      ],
      activeTabId: tabA.id,
    };

    bindTabs(state);
    assert.equal(tryWarmKeepAliveFlip("/inbox/item-a"), true);
    rememberKeepAliveHref("inbox", "/inbox/item-a-newer", "");
    assert.equal(lastHrefForProductTabId(tabA.id), "/inbox/item-a-newer");

    const prepared = prepareActivateShellProductTab({
      tabsState: state,
      tabId: tabB.id,
      livePathname: "/inbox/item-a-newer",
    });
    assert.equal(prepared.skipped, false);
    assert.equal(prepared.navigateHref, "/inbox/item-b");
    assert.equal(
      lastHrefForProductTabId(tabA.id),
      "/inbox/item-a-newer",
      "prepareActivateShellProductTab must not regress warm-ahead A",
    );
    state = prepared.next;
    navigateToHref(() => {}, prepared.navigateHref!);
    assert.equal(lastHrefForKeepAliveSurface("inbox"), "/inbox/item-b");

    const back = prepareActivateShellProductTab({
      tabsState: state,
      tabId: tabA.id,
      livePathname: "/inbox/item-b",
    });
    assert.equal(back.navigateHref, "/inbox/item-a-newer");
    navigateToHref(() => {}, back.navigateHref!);
    assert.equal(lastHrefForKeepAliveSurface("inbox"), "/inbox/item-a-newer");
  });

  test("stale panel owner cannot navigate after prepareActivate switches tab", () => {
    markKeepAliveSurfaceMounted("calendar");
    markKeepAliveSurfaceMounted("inbox");
    const tabCal = createProductTab("/calendar");
    const tabInbox = createProductTab("/inbox/in-1");
    const state: ProductTabsState = {
      tabs: [tabCal, tabInbox],
      activeTabId: tabCal.id,
    };
    syncWarmKeepAliveProductTabs({
      activeTabId: tabCal.id,
      tabs: [
        { id: tabCal.id, href: "/calendar" },
        { id: tabInbox.id, href: "/inbox/in-1" },
      ],
    });
    assert.equal(tryWarmKeepAliveFlip("/calendar"), true);
    const ownerCal = captureWarmNavOwner();
    assert.equal(ownerCal?.tabId, tabCal.id);

    const switched = prepareActivateShellProductTab({
      tabsState: state,
      tabId: tabInbox.id,
      livePathname: "/calendar",
    });
    assert.equal(switched.navigateHref, "/inbox/in-1");
    navigateToHref(() => {}, switched.navigateHref!);
    assert.equal(isWarmNavOwnerCurrent(ownerCal), false);

    let calls = 0;
    navigateToHref(
      () => {
        calls += 1;
      },
      "/calendar?mode=timetracking",
      { owner: ownerCal },
    );
    assert.equal(calls, 0);
    assert.equal(lastHrefForKeepAliveSurface("inbox"), "/inbox/in-1");
  });
});
