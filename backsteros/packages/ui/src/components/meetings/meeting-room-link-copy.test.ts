import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldShowMeetingRoomLinkCopy } from "./meeting-room-link-copy.js";

test("shouldShowMeetingRoomLinkCopy requires a non-empty URL", () => {
  assert.equal(shouldShowMeetingRoomLinkCopy(null), false);
  assert.equal(shouldShowMeetingRoomLinkCopy(undefined), false);
  assert.equal(shouldShowMeetingRoomLinkCopy(""), false);
  assert.equal(shouldShowMeetingRoomLinkCopy("   "), false);
  assert.equal(
    shouldShowMeetingRoomLinkCopy(
      "https://client.lemo-design.com/meet/meet-a",
    ),
    true,
  );
});
