import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CommandPaletteProvider,
  isMeetingRoomPath,
  ListKeyboardNavigationProvider,
  parseMeetingRoomMeetingId,
} from "@backsteros/ui";
import {
  activateProductTab,
  closeProductTab,
  createProductTab,
  type ProductTabsState,
} from "@backsteros/ui/shell";

import { resolveLeftSidePanelDest } from "./left-side-panel-dest.js";
import {
  clearRoomTabMedia,
  getRoomTabMediaDiscrete,
  setRoomTabMedia,
} from "./room-tab-media-store.js";
import {
  resolveActiveRoomMeetingId,
  resolveRoomTabSeparation,
} from "./room-session-keep-alive.js";
import {
  KeepAlivePane,
  snapshotFor,
} from "./shell-route-keep-alive.js";
import {
  dismissKeepAliveForOutletNavigation,
  getWarmKeepAliveEpoch,
  getWarmNavGeneration,
  isWarmNavGenerationCurrent,
  lastHrefForKeepAliveSurface,
  markKeepAliveSurfaceMounted,
  rememberKeepAliveHref,
  resetKeepAliveForTests,
  subscribeWarmKeepAlive,
  syncWarmKeepAliveProductTabs,
  tryWarmKeepAliveFlip,
  visibleKeepAliveHref,
} from "./shell-warm-keep-alive.js";

/**
 * Behavioral integration for per-product-tab warm isolation.
 * Drives the real warm store + product-tab helpers + KeepAlivePane snapshot
 * path (via providers) through async tab switches — not source-text greps.
 */

function mirrorTabs(state: ProductTabsState): void {
  syncWarmKeepAliveProductTabs({
    activeTabId: state.activeTabId,
    tabs: state.tabs.map((tab) => ({ id: tab.id, href: tab.href })),
  });
}

function paneHref(surface: "inbox" | "communication" | "tasks-list"): string {
  // Same read KeepAlivePane uses for FrozenRouteContext.snapshot.
  return lastHrefForKeepAliveSurface(surface);
}

function sidePanelDest(pathname: string) {
  return resolveLeftSidePanelDest({
    pathname,
    inInboxPanel: pathname.startsWith("/inbox") || pathname.startsWith("/email"),
    financeSection: false,
    showSidePanel: true,
    visibleSurface: "inbox",
  });
}

afterEach(() => {
  resetKeepAliveForTests();
  clearRoomTabMedia("meet-a");
});

describe("BEFORE fix class: surface-global lastHref collapses two Inbox tabs", () => {
  test("without tab sync, second inbox selection overwrites the only slot", () => {
    markKeepAliveSurfaceMounted("inbox");
    rememberKeepAliveHref("inbox", "/inbox/item-a", "");
    assert.equal(tryWarmKeepAliveFlip("/inbox/item-a"), true);
    assert.equal(lastHrefForKeepAliveSurface("inbox"), "/inbox/item-a");

    // Legacy surface-global write — what a second Inbox tab did before isolation.
    rememberKeepAliveHref("inbox", "/inbox/item-b", "");
    assert.equal(
      lastHrefForKeepAliveSurface("inbox"),
      "/inbox/item-b",
      "surface map alone cannot restore item-a after item-b",
    );
  });
});

describe("per-product-tab warm isolation", () => {
  test("two Inbox tabs keep distinct selections across A → B → A", () => {
    markKeepAliveSurfaceMounted("inbox");
    const tabA = createProductTab("/inbox/item-a");
    const tabB = createProductTab("/inbox/item-b");
    let state: ProductTabsState = {
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
    };
    mirrorTabs(state);
    assert.equal(tryWarmKeepAliveFlip("/inbox/item-a"), true);
    assert.equal(paneHref("inbox"), "/inbox/item-a");
    assert.equal(sidePanelDest("/inbox/item-a"), "inbox");

    // Activate B (same surface) — sync before flip, like useShellTabs.activateTab.
    state = activateProductTab(state, tabB.id);
    mirrorTabs(state);
    assert.equal(paneHref("inbox"), "/inbox/item-b");
    assert.equal(tryWarmKeepAliveFlip("/inbox/item-b"), true);
    assert.equal(paneHref("inbox"), "/inbox/item-b");
    assert.equal(visibleKeepAliveHref(), "/inbox/item-b");

    state = activateProductTab(state, tabA.id);
    mirrorTabs(state);
    assert.equal(paneHref("inbox"), "/inbox/item-a");
    assert.equal(tryWarmKeepAliveFlip("/inbox/item-a"), true);
    assert.equal(paneHref("inbox"), "/inbox/item-a");
    assert.equal(sidePanelDest("/inbox/item-a"), "inbox");
  });

  test("two communication threads isolate like Inbox", () => {
    markKeepAliveSurfaceMounted("communication");
    const tabA = createProductTab("/communication/thread-a");
    const tabB = createProductTab("/communication/thread-b");
    let state: ProductTabsState = {
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
    };
    mirrorTabs(state);
    assert.equal(tryWarmKeepAliveFlip("/communication/thread-a"), true);

    state = activateProductTab(state, tabB.id);
    mirrorTabs(state);
    assert.equal(tryWarmKeepAliveFlip("/communication/thread-b"), true);
    assert.equal(paneHref("communication"), "/communication/thread-b");

    state = activateProductTab(state, tabA.id);
    mirrorTabs(state);
    assert.equal(paneHref("communication"), "/communication/thread-a");
  });

  test("Room ↔ Inbox A ↔ Inbox B ↔ Messages: media stays; each tab restores", () => {
    markKeepAliveSurfaceMounted("inbox");
    markKeepAliveSurfaceMounted("communication");
    setRoomTabMedia("meet-a", {
      cameraPublished: true,
      micEnabled: true,
      audioLevel: 0.4,
    });

    const inboxA = createProductTab("/inbox/in-a");
    const inboxB = createProductTab("/inbox/in-b");
    const messages = createProductTab("/communication/msg-1");
    const room = createProductTab("/calendar/meetings/meet-a/room");
    let state: ProductTabsState = {
      tabs: [room, inboxA, inboxB, messages],
      activeTabId: room.id,
    };
    mirrorTabs(state);

    // Leave room via warm Inbox A.
    state = activateProductTab(state, inboxA.id);
    mirrorTabs(state);
    assert.equal(tryWarmKeepAliveFlip("/inbox/in-a"), true);
    assert.equal(
      resolveActiveRoomMeetingId({
        visibleKeepAliveSurface: "inbox",
        pathname: "/inbox/in-a",
        isRoomPath: isMeetingRoomPath,
        parseMeetingId: parseMeetingRoomMeetingId,
      }),
      null,
    );
    assert.deepEqual(getRoomTabMediaDiscrete("meet-a"), {
      cameraPublished: true,
      micEnabled: true,
    });

    state = activateProductTab(state, inboxB.id);
    mirrorTabs(state);
    assert.equal(tryWarmKeepAliveFlip("/inbox/in-b"), true);
    assert.equal(paneHref("inbox"), "/inbox/in-b");

    state = activateProductTab(state, messages.id);
    mirrorTabs(state);
    assert.equal(tryWarmKeepAliveFlip("/communication/msg-1"), true);
    assert.equal(paneHref("communication"), "/communication/msg-1");
    // Active tab is Messages — inbox reads surface fallback (last warm inbox
    // write), not a sibling tab. Tab A’s bookmark is restored on activate.
    assert.equal(lastHrefForKeepAliveSurface("inbox"), "/inbox/in-b");

    state = activateProductTab(state, inboxA.id);
    mirrorTabs(state);
    assert.equal(paneHref("inbox"), "/inbox/in-a");
    assert.equal(tryWarmKeepAliveFlip("/inbox/in-a"), true);

    const sep = resolveRoomTabSeparation({
      activeMeetingId: null,
      mountedIds: ["meet-a"],
    });
    assert.equal(sep.roomLayerActive, false);
    assert.deepEqual(getRoomTabMediaDiscrete("meet-a"), {
      cameraPublished: true,
      micEnabled: true,
    });
  });

  test("closing active Inbox tab binds the remaining tab and drops the closed slot", () => {
    markKeepAliveSurfaceMounted("inbox");
    const tabA = createProductTab("/inbox/item-a");
    const tabB = createProductTab("/inbox/item-b");
    let state: ProductTabsState = {
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
    };
    mirrorTabs(state);
    assert.equal(tryWarmKeepAliveFlip("/inbox/item-a"), true);

    const closed = closeProductTab(state, tabA.id);
    state = closed.state;
    mirrorTabs(state);
    assert.equal(state.activeTabId, tabB.id);
    assert.equal(paneHref("inbox"), "/inbox/item-b");
    assert.equal(closed.navigateHref, "/inbox/item-b");
    assert.equal(tryWarmKeepAliveFlip("/inbox/item-b"), true);

    // Stale remember for the closed tab id must not revive.
    rememberKeepAliveHref("inbox", "/inbox/item-a", "", { tabId: tabA.id });
    assert.equal(paneHref("inbox"), "/inbox/item-b");
  });

  test("closing inactive sibling does not yank the active selection", () => {
    markKeepAliveSurfaceMounted("inbox");
    const tabA = createProductTab("/inbox/item-a");
    const tabB = createProductTab("/inbox/item-b");
    let state: ProductTabsState = {
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
    };
    mirrorTabs(state);
    assert.equal(tryWarmKeepAliveFlip("/inbox/item-a"), true);

    const closed = closeProductTab(state, tabB.id);
    state = closed.state;
    mirrorTabs(state);
    assert.equal(closed.navigateHref, null);
    assert.equal(paneHref("inbox"), "/inbox/item-a");
  });

  test("rapid same-surface switching during pending panel load: stale cleanup ignored", async () => {
    markKeepAliveSurfaceMounted("inbox");
    const tabA = createProductTab("/inbox/item-a");
    const tabB = createProductTab("/inbox/item-b");
    let state: ProductTabsState = {
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
    };
    mirrorTabs(state);
    assert.equal(tryWarmKeepAliveFlip("/inbox/item-a"), true);
    const genAtA = getWarmNavGeneration();

    state = activateProductTab(state, tabB.id);
    mirrorTabs(state);
    assert.equal(tryWarmKeepAliveFlip("/inbox/item-b"), true);
    assert.ok(!isWarmNavGenerationCurrent(genAtA));

    // Late panel completion from tab A — must not overwrite B.
    rememberKeepAliveHref("inbox", "/inbox/item-a", "", {
      generation: genAtA,
    });
    assert.equal(paneHref("inbox"), "/inbox/item-b");

    await new Promise<void>((resolve) => {
      queueMicrotask(() => {
        rememberKeepAliveHref("inbox", "/inbox/stale-late", "", {
          generation: genAtA,
        });
        resolve();
      });
    });
    assert.equal(paneHref("inbox"), "/inbox/item-b");
  });

  test("panel open / dismiss / reopen follows the active tab selection", () => {
    markKeepAliveSurfaceMounted("inbox");
    const tabA = createProductTab("/inbox/item-a");
    const tabB = createProductTab("/inbox/item-b");
    let state: ProductTabsState = {
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
    };
    mirrorTabs(state);
    assert.equal(tryWarmKeepAliveFlip("/inbox/item-a"), true);
    assert.equal(sidePanelDest("/inbox/item-a"), "inbox");

    assert.equal(dismissKeepAliveForOutletNavigation("/settings"), true);
    assert.equal(
      resolveLeftSidePanelDest({
        pathname: "/settings",
        inInboxPanel: false,
        financeSection: false,
        showSidePanel: false,
        visibleSurface: null,
        outletTransitionPending: true,
      }),
      null,
    );

    state = activateProductTab(state, tabB.id);
    mirrorTabs(state);
    assert.equal(tryWarmKeepAliveFlip("/inbox/item-b"), true);
    assert.equal(paneHref("inbox"), "/inbox/item-b");
    assert.equal(sidePanelDest("/inbox/item-b"), "inbox");

    state = activateProductTab(state, tabA.id);
    mirrorTabs(state);
    assert.equal(tryWarmKeepAliveFlip("/inbox/item-a"), true);
    assert.equal(paneHref("inbox"), "/inbox/item-a");
    assert.equal(sidePanelDest("/inbox/item-a"), "inbox");
  });

  test("sync emit wakes KeepAlivePane subscribers on same-surface tab flip", () => {
    markKeepAliveSurfaceMounted("inbox");
    const tabA = createProductTab("/inbox/item-a");
    const tabB = createProductTab("/inbox/item-b");
    mirrorTabs({
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
    });
    assert.equal(tryWarmKeepAliveFlip("/inbox/item-a"), true);
    const epochBefore = getWarmKeepAliveEpoch();
    let woke = 0;
    const unsub = subscribeWarmKeepAlive(() => {
      woke += 1;
    });

    mirrorTabs({
      tabs: [tabA, tabB],
      activeTabId: tabB.id,
    });
    unsub();
    assert.ok(woke >= 1, "pane epoch subscribers must wake when tab href flips");
    assert.ok(getWarmKeepAliveEpoch() > epochBefore);
    assert.equal(paneHref("inbox"), "/inbox/item-b");
  });

  test("KeepAlivePane + shell providers prefer active tab href over stale snapshot prop", () => {
    markKeepAliveSurfaceMounted("inbox");
    const tabA = createProductTab("/inbox/item-a");
    const tabB = createProductTab("/inbox/item-b");
    mirrorTabs({
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
    });
    assert.equal(tryWarmKeepAliveFlip("/inbox/item-a"), true);

    // Probe the same lastHref read KeepAlivePane uses when building
    // FrozenRouteContext.snapshot (stale snapshot prop must lose).
    function SnapshotProbe() {
      return createElement("span", {
        "data-href": lastHrefForKeepAliveSurface("inbox"),
      });
    }

    function renderPane(pathname: string) {
      return renderToStaticMarkup(
        createElement(
          CommandPaletteProvider,
          null,
          createElement(
            ListKeyboardNavigationProvider,
            { pathname },
            createElement(
              KeepAlivePane,
              {
                surface: "inbox",
                active: true,
                snapshot: snapshotFor("inbox", "/inbox/item-a", ""),
                role: "main",
              },
              createElement(SnapshotProbe),
            ),
          ),
        ),
      );
    }

    assert.match(renderPane("/inbox/item-a"), /data-href="\/inbox\/item-a"/);

    mirrorTabs({
      tabs: [tabA, tabB],
      activeTabId: tabB.id,
    });
    assert.match(
      renderPane("/inbox/item-b"),
      /data-href="\/inbox\/item-b"/,
      "pane must prefer active tab B over the stale snapshot prop",
    );
  });
});
