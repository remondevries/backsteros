import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  collectOpenRoomMeetingIds,
  getOpenRoomMeetingIds,
  getOpenRoomMeetingIdsEpoch,
  nextRoomChromeOwnerId,
  nextVisitedRoomMeetingIds,
  resetOpenRoomMeetingIdsForTests,
  resolveRoomTabSeparation,
  setOpenRoomMeetingIds,
  shouldRegisterRoomChrome,
  subscribeOpenRoomMeetingIds,
} from "./room-session-keep-alive.js";
import {
  clearRoomTabMedia,
  getRoomTabMediaDiscrete,
  setRoomTabMedia,
} from "./room-tab-media-store.js";

const isRoomPath = (href: string) =>
  /^\/calendar\/meetings\/[^/]+\/room(?:\?|$)/.test(href);
const parseMeetingId = (href: string) => {
  const match = href.match(/^\/calendar\/meetings\/([^/]+)\/room/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

describe("room-session-keep-alive", () => {
  test("collectOpenRoomMeetingIds keeps room tabs only, deduped", () => {
    const ids = collectOpenRoomMeetingIds(
      [
        { href: "/tasks" },
        { href: "/calendar/meetings/meet-a/room" },
        { href: "/calendar/meetings/meet-b/room" },
        { href: "/calendar/meetings/meet-a/room" },
        { href: "/calendar/meetings/meet-a" },
      ],
      isRoomPath,
      parseMeetingId,
    );
    assert.deepEqual(ids, ["meet-a", "meet-b"]);
  });

  test("setOpenRoomMeetingIds notifies and drops closed rooms", () => {
    resetOpenRoomMeetingIdsForTests();
    let wakes = 0;
    const stop = subscribeOpenRoomMeetingIds(() => {
      wakes += 1;
    });

    setOpenRoomMeetingIds(["meet-a", "meet-b"]);
    assert.deepEqual([...getOpenRoomMeetingIds()], ["meet-a", "meet-b"]);
    assert.equal(wakes, 1);
    const epochAfterOpen = getOpenRoomMeetingIdsEpoch();

    setOpenRoomMeetingIds(["meet-a", "meet-b"]);
    assert.equal(wakes, 1, "identical set must not re-notify");
    assert.equal(getOpenRoomMeetingIdsEpoch(), epochAfterOpen);

    setOpenRoomMeetingIds(["meet-b"]);
    assert.deepEqual([...getOpenRoomMeetingIds()], ["meet-b"]);
    assert.equal(wakes, 2);

    stop();
    resetOpenRoomMeetingIdsForTests();
  });

  test("tab switch keeps visited room mounted; close tears it down; no cross-room leak", () => {
    let visited = nextVisitedRoomMeetingIds([], ["meet-a"], "meet-a");
    assert.deepEqual(visited, ["meet-a"]);

    visited = nextVisitedRoomMeetingIds(visited, ["meet-a"], null);
    assert.deepEqual(visited, ["meet-a"]);

    visited = nextVisitedRoomMeetingIds(
      visited,
      ["meet-a", "meet-b"],
      "meet-b",
    );
    assert.deepEqual(visited, ["meet-a", "meet-b"]);

    visited = nextVisitedRoomMeetingIds(
      visited,
      ["meet-a", "meet-b"],
      "meet-a",
    );
    assert.deepEqual(visited, ["meet-a", "meet-b"]);

    visited = nextVisitedRoomMeetingIds(visited, ["meet-a"], "meet-a");
    assert.deepEqual(visited, ["meet-a"]);

    visited = nextVisitedRoomMeetingIds(
      visited,
      ["meet-a", "meet-stale"],
      null,
    );
    assert.deepEqual(visited, ["meet-a"]);
  });

  test("Room A → Tasks → Inbox → Room A: chrome/panels only on room; media stays", () => {
    clearRoomTabMedia("meet-a");
    setRoomTabMedia("meet-a", {
      cameraPublished: true,
      micEnabled: true,
      audioLevel: 0.3,
    });

    let mounted = nextVisitedRoomMeetingIds([], ["meet-a"], "meet-a");
    let sep = resolveRoomTabSeparation({
      activeMeetingId: "meet-a",
      mountedIds: mounted,
    });
    assert.equal(sep.chromeOwnerMeetingId, "meet-a");
    assert.equal(sep.roomNavReplacementActive, true);
    assert.equal(sep.roomLayerActive, true);
    assert.equal(shouldRegisterRoomChrome(true, true), true);

    // → Tasks
    mounted = nextVisitedRoomMeetingIds(mounted, ["meet-a"], null);
    sep = resolveRoomTabSeparation({
      activeMeetingId: null,
      mountedIds: mounted,
    });
    assert.equal(sep.chromeOwnerMeetingId, null);
    assert.equal(sep.roomNavReplacementActive, false);
    assert.equal(sep.roomLayerActive, false);
    assert.deepEqual(sep.mediaMountedMeetingIds, ["meet-a"]);
    assert.equal(shouldRegisterRoomChrome(false, true), false);
    assert.deepEqual(getRoomTabMediaDiscrete("meet-a"), {
      cameraPublished: true,
      micEnabled: true,
    });

    // → Inbox (still no room chrome / panels)
    sep = resolveRoomTabSeparation({
      activeMeetingId: null,
      mountedIds: mounted,
    });
    assert.equal(sep.chromeOwnerMeetingId, null);
    assert.equal(sep.roomNavReplacementActive, false);
    assert.deepEqual(getRoomTabMediaDiscrete("meet-a"), {
      cameraPublished: true,
      micEnabled: true,
    });

    // → Room A again
    sep = resolveRoomTabSeparation({
      activeMeetingId: "meet-a",
      mountedIds: mounted,
    });
    assert.equal(sep.chromeOwnerMeetingId, "meet-a");
    assert.equal(sep.roomNavReplacementActive, true);
    assert.equal(sep.roomLayerActive, true);
    assert.deepEqual(getRoomTabMediaDiscrete("meet-a"), {
      cameraPublished: true,
      micEnabled: true,
    });

    clearRoomTabMedia("meet-a");
  });

  test("Room A → Room B: chrome follows active only; both keep media mounts", () => {
    clearRoomTabMedia("meet-a");
    clearRoomTabMedia("meet-b");
    setRoomTabMedia("meet-a", {
      cameraPublished: true,
      micEnabled: false,
      audioLevel: 0,
    });
    setRoomTabMedia("meet-b", {
      cameraPublished: false,
      micEnabled: true,
      audioLevel: 0.1,
    });

    let mounted = nextVisitedRoomMeetingIds([], ["meet-a"], "meet-a");
    mounted = nextVisitedRoomMeetingIds(
      mounted,
      ["meet-a", "meet-b"],
      "meet-b",
    );

    let sep = resolveRoomTabSeparation({
      activeMeetingId: "meet-b",
      mountedIds: mounted,
    });
    assert.equal(sep.chromeOwnerMeetingId, "meet-b");
    assert.deepEqual(sep.mediaMountedMeetingIds, ["meet-a", "meet-b"]);
    assert.equal(nextRoomChromeOwnerId("meet-a", mounted), "meet-a");
    assert.equal(nextRoomChromeOwnerId(null, mounted), null);

    // Rapid A ↔ B
    sep = resolveRoomTabSeparation({
      activeMeetingId: "meet-a",
      mountedIds: mounted,
    });
    assert.equal(sep.chromeOwnerMeetingId, "meet-a");
    sep = resolveRoomTabSeparation({
      activeMeetingId: "meet-b",
      mountedIds: mounted,
    });
    assert.equal(sep.chromeOwnerMeetingId, "meet-b");

    assert.deepEqual(getRoomTabMediaDiscrete("meet-a"), {
      cameraPublished: true,
      micEnabled: false,
    });
    assert.deepEqual(getRoomTabMediaDiscrete("meet-b"), {
      cameraPublished: false,
      micEnabled: true,
    });

    clearRoomTabMedia("meet-a");
    clearRoomTabMedia("meet-b");
  });

  test("closing inactive/active room drops mount + chrome; survivor keeps media", () => {
    clearRoomTabMedia("meet-a");
    clearRoomTabMedia("meet-b");
    setRoomTabMedia("meet-a", {
      cameraPublished: true,
      micEnabled: true,
      audioLevel: 0.2,
    });
    setRoomTabMedia("meet-b", {
      cameraPublished: true,
      micEnabled: false,
      audioLevel: 0,
    });

    let mounted = nextVisitedRoomMeetingIds(
      ["meet-a", "meet-b"],
      ["meet-a", "meet-b"],
      "meet-a",
    );

    // Close inactive B while on A
    mounted = nextVisitedRoomMeetingIds(mounted, ["meet-a"], "meet-a");
    assert.deepEqual(mounted, ["meet-a"]);
    clearRoomTabMedia("meet-b");
    assert.deepEqual(getRoomTabMediaDiscrete("meet-b"), {
      cameraPublished: false,
      micEnabled: false,
    });
    assert.deepEqual(getRoomTabMediaDiscrete("meet-a"), {
      cameraPublished: true,
      micEnabled: true,
    });

    // Close active A
    mounted = nextVisitedRoomMeetingIds(mounted, [], null);
    assert.deepEqual(mounted, []);
    assert.equal(
      resolveRoomTabSeparation({
        activeMeetingId: null,
        mountedIds: mounted,
      }).chromeOwnerMeetingId,
      null,
    );
    clearRoomTabMedia("meet-a");
  });
});
