import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  meetingRoomHref,
  resolveStartRoomTabDecision,
} from "./start-room-tab.js";

describe("resolveStartRoomTabDecision", () => {
  test("first open → open new room href", () => {
    const decision = resolveStartRoomTabDecision(
      [
        { id: "t-inbox", href: "/inbox" },
        { id: "t-meet", href: "/calendar/meetings/meet-a" },
      ],
      "meet-a",
    );
    assert.deepEqual(decision, {
      action: "open",
      href: "/calendar/meetings/meet-a/room",
    });
  });

  test("existing room tab → activate (no second Director tab)", () => {
    const decision = resolveStartRoomTabDecision(
      [
        { id: "t-inbox", href: "/inbox" },
        { id: "t-room", href: "/calendar/meetings/meet-a/room" },
        { id: "t-meet", href: "/calendar/meetings/meet-a" },
      ],
      "meet-a",
    );
    assert.deepEqual(decision, {
      action: "activate",
      tabId: "t-room",
      href: "/calendar/meetings/meet-a/room",
    });
  });

  test("encoded meeting id in href still matches", () => {
    const id = "meet/with space";
    const decision = resolveStartRoomTabDecision(
      [{ id: "t-room", href: meetingRoomHref(id) }],
      id,
    );
    assert.equal(decision.action, "activate");
    if (decision.action === "activate") {
      assert.equal(decision.tabId, "t-room");
    }
  });

  test("different meeting keeps open", () => {
    const decision = resolveStartRoomTabDecision(
      [{ id: "t-room", href: "/calendar/meetings/meet-a/room" }],
      "meet-b",
    );
    assert.deepEqual(decision, {
      action: "open",
      href: "/calendar/meetings/meet-b/room",
    });
  });

  test("rapid repeated Start room stays activate (no duplicate tab)", () => {
    const tabs = [
      { id: "t-room", href: "/calendar/meetings/meet-a/room" },
      { id: "t-meet", href: "/calendar/meetings/meet-a" },
    ];
    const first = resolveStartRoomTabDecision(tabs, "meet-a");
    const second = resolveStartRoomTabDecision(tabs, "meet-a");
    assert.deepEqual(first, second);
    assert.equal(first.action, "activate");
  });
});
