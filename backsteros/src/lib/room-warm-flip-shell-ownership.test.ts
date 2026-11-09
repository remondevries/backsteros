import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import {
  isMeetingRoomPath,
  parseMeetingRoomMeetingId,
} from "@backsteros/ui";

import { resolveLeftSidePanelDest } from "./left-side-panel-dest.js";
import {
  resolveActiveRoomMeetingId,
  resolveRoomTabSeparation,
  shouldRegisterRoomChrome,
} from "./room-session-keep-alive.js";
import {
  clearRoomTabMedia,
  getRoomTabMediaDiscrete,
  setRoomTabMedia,
} from "./room-tab-media-store.js";
import {
  markKeepAliveSurfaceMounted,
  rememberKeepAliveHref,
  resetKeepAliveForTests,
  tryWarmKeepAliveFlip,
} from "./shell-warm-keep-alive.js";

/**
 * Reproduces the shared-shell failure Remon hit after rooms landed:
 * warm-flipping Room → Inbox/Tasks leaves TanStack on `/…/room` while the
 * warm store + address bar already show the destination. Room UI ownership
 * must follow warm visibility, not the stale router match.
 */
describe("room warm-flip vs sidepanel / main shell ownership", () => {
  afterEach(() => {
    resetKeepAliveForTests();
    clearRoomTabMedia("meet-a");
  });

  test("BEFORE fix class: TanStack still on room would keep layer active — warm surface must win", () => {
    const staleRouterRoomPath = "/calendar/meetings/meet-a/room";
    const addressBarAfterWarmInbox = "/inbox/in-1";

    // Stale router alone (the bug RoomSessionKeepAlive had):
    const staleRouterActive = resolveActiveRoomMeetingId({
      visibleKeepAliveSurface: null,
      pathname: staleRouterRoomPath,
      isRoomPath: isMeetingRoomPath,
      parseMeetingId: parseMeetingRoomMeetingId,
    });
    assert.equal(staleRouterActive, "meet-a");

    // After warm flip, visible surface is inbox even if someone still passes
    // the stale router room path — room layer MUST yield.
    const afterWarm = resolveActiveRoomMeetingId({
      visibleKeepAliveSurface: "inbox",
      pathname: staleRouterRoomPath,
      isRoomPath: isMeetingRoomPath,
      parseMeetingId: parseMeetingRoomMeetingId,
    });
    assert.equal(
      afterWarm,
      null,
      "warm Inbox covering the shell must deactivate room Director layer",
    );

    const trusted = resolveActiveRoomMeetingId({
      visibleKeepAliveSurface: "inbox",
      pathname: addressBarAfterWarmInbox,
      isRoomPath: isMeetingRoomPath,
      parseMeetingId: parseMeetingRoomMeetingId,
    });
    assert.equal(trusted, null);
  });

  test("Room → Inbox warm flip: sidepanel dest inbox, room layer off, media persists", () => {
    markKeepAliveSurfaceMounted("inbox");
    rememberKeepAliveHref("inbox", "/inbox", "");
    setRoomTabMedia("meet-a", {
      cameraPublished: true,
      micEnabled: true,
      audioLevel: 0.15,
    });

    // Pretend we were on a room Outlet, then warm-flip to Inbox (mounted).
    assert.equal(tryWarmKeepAliveFlip("/inbox/in-9"), true);

    const activeMeetingId = resolveActiveRoomMeetingId({
      visibleKeepAliveSurface: "inbox",
      // Address bar after warm flip — not the stale TanStack room URL.
      pathname: "/inbox/in-9",
      isRoomPath: isMeetingRoomPath,
      parseMeetingId: parseMeetingRoomMeetingId,
    });
    assert.equal(activeMeetingId, null);

    const sep = resolveRoomTabSeparation({
      activeMeetingId,
      mountedIds: ["meet-a"],
    });
    assert.equal(sep.roomLayerActive, false);
    assert.equal(sep.chromeOwnerMeetingId, null);
    assert.equal(shouldRegisterRoomChrome(false, true), false);

    assert.equal(
      resolveLeftSidePanelDest({
        pathname: "/inbox/in-9",
        inInboxPanel: true,
        financeSection: false,
        showSidePanel: true,
        visibleSurface: "inbox",
      }),
      "inbox",
    );

    assert.deepEqual(getRoomTabMediaDiscrete("meet-a"), {
      cameraPublished: true,
      micEnabled: true,
    });
  });

  test("Room → Messages(communication) warm flip: no shell list; room layer off", () => {
    markKeepAliveSurfaceMounted("communication");
    rememberKeepAliveHref("communication", "/communication", "");
    setRoomTabMedia("meet-a", {
      cameraPublished: false,
      micEnabled: true,
      audioLevel: 0,
    });

    assert.equal(tryWarmKeepAliveFlip("/communication/c-1"), true);

    const activeMeetingId = resolveActiveRoomMeetingId({
      visibleKeepAliveSurface: "communication",
      pathname: "/communication/c-1",
      isRoomPath: isMeetingRoomPath,
      parseMeetingId: parseMeetingRoomMeetingId,
    });
    assert.equal(activeMeetingId, null);
    assert.equal(
      resolveLeftSidePanelDest({
        pathname: "/communication/c-1",
        inInboxPanel: false,
        financeSection: false,
        showSidePanel: false,
        visibleSurface: "communication",
      }),
      null,
    );
    assert.deepEqual(getRoomTabMediaDiscrete("meet-a"), {
      cameraPublished: false,
      micEnabled: true,
    });
  });

  test("Inbox ↔ Tasks while room mounted: room stays inactive; panels follow warm surface", () => {
    markKeepAliveSurfaceMounted("inbox");
    markKeepAliveSurfaceMounted("tasks-list");
    rememberKeepAliveHref("inbox", "/inbox", "");
    rememberKeepAliveHref("tasks-list", "/tasks", "");
    setRoomTabMedia("meet-a", {
      cameraPublished: true,
      micEnabled: false,
      audioLevel: 0,
    });

    assert.equal(tryWarmKeepAliveFlip("/inbox"), true);
    assert.equal(
      resolveActiveRoomMeetingId({
        visibleKeepAliveSurface: "inbox",
        pathname: "/inbox",
        isRoomPath: isMeetingRoomPath,
        parseMeetingId: parseMeetingRoomMeetingId,
      }),
      null,
    );
    assert.equal(
      resolveLeftSidePanelDest({
        pathname: "/inbox",
        inInboxPanel: true,
        financeSection: false,
        showSidePanel: true,
        visibleSurface: "inbox",
      }),
      "inbox",
    );

    assert.equal(tryWarmKeepAliveFlip("/tasks"), true);
    assert.equal(
      resolveActiveRoomMeetingId({
        visibleKeepAliveSurface: "tasks-list",
        pathname: "/tasks",
        isRoomPath: isMeetingRoomPath,
        parseMeetingId: parseMeetingRoomMeetingId,
      }),
      null,
    );
    assert.equal(
      resolveLeftSidePanelDest({
        pathname: "/tasks",
        inInboxPanel: false,
        financeSection: false,
        showSidePanel: false,
        visibleSurface: "tasks-list",
      }),
      null,
    );

    assert.deepEqual(getRoomTabMediaDiscrete("meet-a"), {
      cameraPublished: true,
      micEnabled: false,
    });
  });

  test("return to room: warm cleared + room path → layer active again", () => {
    markKeepAliveSurfaceMounted("inbox");
    rememberKeepAliveHref("inbox", "/inbox", "");
    assert.equal(tryWarmKeepAliveFlip("/inbox"), true);

    // Dismiss path before Outlet room: visible null + room address bar.
    const activeMeetingId = resolveActiveRoomMeetingId({
      visibleKeepAliveSurface: null,
      pathname: "/calendar/meetings/meet-a/room",
      isRoomPath: isMeetingRoomPath,
      parseMeetingId: parseMeetingRoomMeetingId,
    });
    assert.equal(activeMeetingId, "meet-a");
    assert.equal(
      resolveRoomTabSeparation({
        activeMeetingId,
        mountedIds: ["meet-a"],
      }).roomLayerActive,
      true,
    );
  });
});
