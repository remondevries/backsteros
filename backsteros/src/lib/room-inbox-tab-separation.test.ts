import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  resolveRoomInboxSeparationState,
  roomSidebarMeetingsKeyboardEnabled,
  sidebarNavPaneInert,
  type RoomInboxSeparationStep,
} from "./room-inbox-tab-separation.js";
import {
  clearRoomTabMedia,
  getRoomTabMediaDiscrete,
  setRoomTabMedia,
} from "./room-tab-media-store.js";

function runSteps(steps: RoomInboxSeparationStep[]) {
  return steps.map((step) => ({
    label: step.label,
    state: resolveRoomInboxSeparationState(step),
  }));
}

describe("room ↔ inbox/messages tab separation", () => {
  test("meetings keyboard is off whenever the room route is not active", () => {
    assert.equal(roomSidebarMeetingsKeyboardEnabled(true), true);
    assert.equal(roomSidebarMeetingsKeyboardEnabled(false), false);
    assert.equal(sidebarNavPaneInert(true), false);
    assert.equal(sidebarNavPaneInert(false), true);
  });

  test("Room → Inbox → Room: chrome/panels/keyboard ownership + media continuity", () => {
    clearRoomTabMedia("meet-a");
    setRoomTabMedia("meet-a", {
      cameraPublished: true,
      micEnabled: true,
      audioLevel: 0.2,
    });

    const results = runSteps([
      {
        label: "room-a",
        pathname: "/calendar/meetings/meet-a/room",
        activeMeetingId: "meet-a",
        mountedRoomIds: ["meet-a"],
        visibleSurface: null,
        inInboxPanel: false,
      },
      {
        label: "inbox",
        pathname: "/inbox",
        activeMeetingId: null,
        mountedRoomIds: ["meet-a"],
        visibleSurface: "inbox",
        inInboxPanel: true,
      },
      {
        label: "room-a-return",
        pathname: "/calendar/meetings/meet-a/room",
        activeMeetingId: "meet-a",
        mountedRoomIds: ["meet-a"],
        visibleSurface: null,
        inInboxPanel: false,
      },
    ]);

    const room = results[0]!.state;
    assert.equal(room.room.chromeOwnerMeetingId, "meet-a");
    assert.equal(room.meetingsKeyboardEnabled, true);
    assert.equal(room.meetingsNavInert, false);
    assert.equal(room.workspaceNavInert, true);
    assert.equal(room.sidePanelDest, null);

    const inbox = results[1]!.state;
    assert.equal(inbox.room.chromeOwnerMeetingId, null);
    assert.equal(inbox.room.roomNavReplacementActive, false);
    assert.equal(inbox.room.roomLayerActive, false);
    assert.equal(inbox.meetingsKeyboardEnabled, false);
    assert.equal(inbox.meetingsNavInert, true);
    assert.equal(inbox.workspaceNavInert, false);
    assert.equal(inbox.sidePanelDest, "inbox");
    assert.deepEqual(inbox.room.mediaMountedMeetingIds, ["meet-a"]);
    assert.deepEqual(getRoomTabMediaDiscrete("meet-a"), {
      cameraPublished: true,
      micEnabled: true,
    });

    const back = results[2]!.state;
    assert.equal(back.room.chromeOwnerMeetingId, "meet-a");
    assert.equal(back.meetingsKeyboardEnabled, true);
    assert.equal(back.sidePanelDest, null);
    assert.deepEqual(getRoomTabMediaDiscrete("meet-a"), {
      cameraPublished: true,
      micEnabled: true,
    });

    clearRoomTabMedia("meet-a");
  });

  test("Room → Messages(communication) → Room: no inbox panel leak; media stays", () => {
    clearRoomTabMedia("meet-a");
    setRoomTabMedia("meet-a", {
      cameraPublished: false,
      micEnabled: true,
      audioLevel: 0,
    });

    const results = runSteps([
      {
        label: "room",
        pathname: "/calendar/meetings/meet-a/room",
        activeMeetingId: "meet-a",
        mountedRoomIds: ["meet-a"],
        visibleSurface: null,
        inInboxPanel: false,
      },
      {
        label: "messages",
        pathname: "/communication",
        activeMeetingId: null,
        mountedRoomIds: ["meet-a"],
        visibleSurface: "communication",
        inInboxPanel: false,
      },
      {
        label: "room-back",
        pathname: "/calendar/meetings/meet-a/room",
        activeMeetingId: "meet-a",
        mountedRoomIds: ["meet-a"],
        visibleSurface: null,
        inInboxPanel: false,
      },
    ]);

    assert.equal(results[0]!.state.meetingsKeyboardEnabled, true);
    assert.equal(results[1]!.state.meetingsKeyboardEnabled, false);
    assert.equal(results[1]!.state.sidePanelDest, null);
    assert.equal(results[1]!.state.room.chromeOwnerMeetingId, null);
    assert.deepEqual(getRoomTabMediaDiscrete("meet-a"), {
      cameraPublished: false,
      micEnabled: true,
    });
    assert.equal(results[2]!.state.meetingsKeyboardEnabled, true);

    clearRoomTabMedia("meet-a");
  });

  test("Inbox ↔ Messages while room backgrounded: meetings keyboard stays off", () => {
    clearRoomTabMedia("meet-a");
    setRoomTabMedia("meet-a", {
      cameraPublished: true,
      micEnabled: false,
      audioLevel: 0,
    });

    const results = runSteps([
      {
        label: "inbox",
        pathname: "/inbox/in-1",
        activeMeetingId: null,
        mountedRoomIds: ["meet-a"],
        visibleSurface: "inbox",
        inInboxPanel: true,
      },
      {
        label: "communication",
        pathname: "/communication/c-1",
        activeMeetingId: null,
        mountedRoomIds: ["meet-a"],
        visibleSurface: "communication",
        inInboxPanel: false,
      },
      {
        label: "inbox-again",
        pathname: "/inbox",
        activeMeetingId: null,
        mountedRoomIds: ["meet-a"],
        visibleSurface: "inbox",
        inInboxPanel: true,
      },
    ]);

    for (const row of results) {
      assert.equal(row.state.meetingsKeyboardEnabled, false, row.label);
      assert.equal(row.state.meetingsNavInert, true, row.label);
      assert.equal(row.state.room.chromeOwnerMeetingId, null, row.label);
      assert.deepEqual(row.state.room.mediaMountedMeetingIds, ["meet-a"]);
    }
    assert.equal(results[0]!.state.sidePanelDest, "inbox");
    assert.equal(results[1]!.state.sidePanelDest, null);
    assert.equal(results[2]!.state.sidePanelDest, "inbox");
    assert.deepEqual(getRoomTabMediaDiscrete("meet-a"), {
      cameraPublished: true,
      micEnabled: false,
    });

    clearRoomTabMedia("meet-a");
  });

  test("rapid Room A ↔ Room B and close: keyboard follows active room only", () => {
    let mounted: string[] = ["meet-a", "meet-b"];
    let a = resolveRoomInboxSeparationState({
      label: "a",
      pathname: "/calendar/meetings/meet-a/room",
      activeMeetingId: "meet-a",
      mountedRoomIds: mounted,
      visibleSurface: null,
      inInboxPanel: false,
    });
    assert.equal(a.meetingsKeyboardEnabled, true);
    assert.equal(a.room.chromeOwnerMeetingId, "meet-a");

    a = resolveRoomInboxSeparationState({
      label: "b",
      pathname: "/calendar/meetings/meet-b/room",
      activeMeetingId: "meet-b",
      mountedRoomIds: mounted,
      visibleSurface: null,
      inInboxPanel: false,
    });
    assert.equal(a.room.chromeOwnerMeetingId, "meet-b");

    mounted = ["meet-b"];
    a = resolveRoomInboxSeparationState({
      label: "close-a",
      pathname: "/calendar/meetings/meet-b/room",
      activeMeetingId: "meet-b",
      mountedRoomIds: mounted,
      visibleSurface: null,
      inInboxPanel: false,
    });
    assert.deepEqual(a.room.mediaMountedMeetingIds, ["meet-b"]);

    a = resolveRoomInboxSeparationState({
      label: "close-b-to-inbox",
      pathname: "/inbox",
      activeMeetingId: null,
      mountedRoomIds: [],
      visibleSurface: "inbox",
      inInboxPanel: true,
    });
    assert.equal(a.meetingsKeyboardEnabled, false);
    assert.equal(a.sidePanelDest, "inbox");
  });
});
