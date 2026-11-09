import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  collectOpenRoomMeetingIds,
  getOpenRoomMeetingIds,
  getOpenRoomMeetingIdsEpoch,
  nextVisitedRoomMeetingIds,
  resetOpenRoomMeetingIdsForTests,
  setOpenRoomMeetingIds,
  subscribeOpenRoomMeetingIds,
} from "./room-session-keep-alive.js";

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
    // First visit room A.
    let visited = nextVisitedRoomMeetingIds([], ["meet-a"], "meet-a");
    assert.deepEqual(visited, ["meet-a"]);

    // Background to a normal tab — A stays mounted while its product tab is open.
    visited = nextVisitedRoomMeetingIds(visited, ["meet-a"], null);
    assert.deepEqual(visited, ["meet-a"]);

    // Open room B (both tabs open). A must remain; B mounts on visit.
    visited = nextVisitedRoomMeetingIds(
      visited,
      ["meet-a", "meet-b"],
      "meet-b",
    );
    assert.deepEqual(visited, ["meet-a", "meet-b"]);

    // Switch active back to A — both stay; no silent drop of B.
    visited = nextVisitedRoomMeetingIds(
      visited,
      ["meet-a", "meet-b"],
      "meet-a",
    );
    assert.deepEqual(visited, ["meet-a", "meet-b"]);

    // Close B's product tab — only B drops (no cross-room leakage).
    visited = nextVisitedRoomMeetingIds(visited, ["meet-a"], "meet-a");
    assert.deepEqual(visited, ["meet-a"]);

    // Stale room tab in open set without a visit must not auto-mount.
    visited = nextVisitedRoomMeetingIds(
      visited,
      ["meet-a", "meet-stale"],
      null,
    );
    assert.deepEqual(visited, ["meet-a"]);
  });
});
