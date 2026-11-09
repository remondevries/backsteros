import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import {
  isMeetingRoomPath,
  parseMeetingRoomMeetingId,
} from "@backsteros/ui";
import {
  createProductTab,
  type ProductTabsState,
} from "@backsteros/ui/shell";

import { prepareActivateShellProductTab } from "./activate-shell-product-tab.js";
import { shouldClearPendingTabSwitch } from "./product-tab-switch-pending.js";
import {
  resolveActiveRoomMeetingId,
  resolveRoomTabSeparation,
} from "./room-session-keep-alive.js";
import { resetKeepAliveForTests } from "./shell-warm-keep-alive.js";

/**
 * Remon native repro: Task → email outlet tab → Room tab → return to the
 * same email tab. Room and email are both outlets (visible keep-alive null).
 * Director layer must not stay is-active over the remounted EmailPage, and
 * pending tab sync must not rewrite the email bookmark to /…/room.
 */
describe("Task email outlet ↔ Room tab return", () => {
  afterEach(() => {
    resetKeepAliveForTests();
  });

  test("BEFORE: window still on room while TanStack already on task-email would keep Director layer active", () => {
    const roomPath = "/calendar/meetings/meet-a/room";
    const emailHref =
      "/email/box/msg-from-task?list=tasks";

    // Production RoomSessionKeepAlive previously keyed only on window + visible.
    // Outlet→outlet Room→Email: TanStack commits email first; window can lag.
    const staleWindowOnly = resolveActiveRoomMeetingId({
      visibleKeepAliveSurface: null,
      pathname: roomPath,
      isRoomPath: isMeetingRoomPath,
      parseMeetingId: parseMeetingRoomMeetingId,
    });
    assert.equal(
      staleWindowOnly,
      "meet-a",
      "window-only resolution keeps room active (the covering bug)",
    );

    const afterRouterCommit = resolveActiveRoomMeetingId({
      visibleKeepAliveSurface: null,
      pathname: roomPath,
      routerPathname: emailHref.split("?")[0]!,
      isRoomPath: isMeetingRoomPath,
      parseMeetingId: parseMeetingRoomMeetingId,
    });
    assert.equal(
      afterRouterCommit,
      null,
      "router already on email must deactivate Director layer even if window lags",
    );

    const sep = resolveRoomTabSeparation({
      activeMeetingId: afterRouterCommit,
      mountedIds: ["meet-a"],
    });
    assert.equal(sep.roomLayerActive, false);
    assert.deepEqual(sep.mediaMountedMeetingIds, ["meet-a"]);
  });

  test("warm Inbox covering still wins when router is stale on room", () => {
    const active = resolveActiveRoomMeetingId({
      visibleKeepAliveSurface: "inbox",
      pathname: "/inbox/in-1",
      routerPathname: "/calendar/meetings/meet-a/room",
      isRoomPath: isMeetingRoomPath,
      parseMeetingId: parseMeetingRoomMeetingId,
    });
    assert.equal(active, null);
  });

  test("prepareActivate Room → task-email preserves email bookmark navigateHref", () => {
    const emailTab = createProductTab(
      "/email/box/msg-from-task?list=tasks",
    );
    const roomTab = createProductTab(
      "/calendar/meetings/meet-a/room",
    );
    const state: ProductTabsState = {
      tabs: [emailTab, roomTab],
      activeTabId: roomTab.id,
    };

    const prepared = prepareActivateShellProductTab({
      tabsState: state,
      tabId: emailTab.id,
      livePathname: "/calendar/meetings/meet-a/room",
      liveSearch: "",
    });

    assert.equal(prepared.skipped, false);
    assert.equal(prepared.next.activeTabId, emailTab.id);
    assert.equal(
      prepared.navigateHref,
      "/email/box/msg-from-task?list=tasks",
    );
    const emailAfter = prepared.next.tabs.find((tab) => tab.id === emailTab.id);
    assert.equal(emailAfter?.href, "/email/box/msg-from-task?list=tasks");
  });

  test("BEFORE pending clear would sync room onto email tab; AFTER waits for location", () => {
    const emailHref = "/email/box/msg-from-task?list=tasks";
    const roomKey = "/calendar/meetings/meet-a/room";
    const pending = { tabId: "email-tab", href: emailHref };

    // Active already flipped to email, location still room — must WAIT.
    assert.equal(
      shouldClearPendingTabSwitch({
        pending,
        activeTabId: "email-tab",
        locationKey: roomKey,
      }),
      false,
    );

    // Location landed on the email bookmark — safe to clear.
    assert.equal(
      shouldClearPendingTabSwitch({
        pending,
        activeTabId: "email-tab",
        locationKey: emailHref,
      }),
      true,
    );
  });
});
