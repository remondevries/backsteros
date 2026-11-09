import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decodeMeetingRoomDataMessage,
  encodeMeetingRoomDataMessage,
  isMeetingRoomGuestIdentity,
  isMeetingRoomHostIdentity,
  MEETING_ROOM_ATTR,
} from "./protocol.ts";

test("encode/decode round-trips room data messages", () => {
  const camera = encodeMeetingRoomDataMessage({ type: "bm.camera", on: true });
  assert.deepEqual(decodeMeetingRoomDataMessage(camera), {
    type: "bm.camera",
    on: true,
  });
  const phase = encodeMeetingRoomDataMessage({
    type: "bm.phase",
    phase: "ready",
  });
  assert.deepEqual(decodeMeetingRoomDataMessage(phase), {
    type: "bm.phase",
    phase: "ready",
  });
});

test("decodeMeetingRoomDataMessage ignores unknown / invalid payloads", () => {
  assert.equal(
    decodeMeetingRoomDataMessage(new TextEncoder().encode("{")),
    null,
  );
  assert.equal(
    decodeMeetingRoomDataMessage(
      new TextEncoder().encode(JSON.stringify({ type: "nope" })),
    ),
    null,
  );
});

test("identity helpers match portal host-/guest- prefixes", () => {
  assert.equal(isMeetingRoomHostIdentity("host-owner"), true);
  assert.equal(isMeetingRoomGuestIdentity("guest-contact1"), true);
  assert.equal(isMeetingRoomGuestIdentity("host-owner"), false);
  assert.equal(MEETING_ROOM_ATTR.camera, "bm.camera");
  assert.equal(MEETING_ROOM_ATTR.roomOpen, "bm.roomOpen");
});
