import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchMeetingRoomToken } from "./fetch-room-token.ts";

test("fetchMeetingRoomToken posts to core room-token and maps credentials", async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const credentials = await fetchMeetingRoomToken({
    meetingId: " meet-1 ",
    role: "host",
    displayName: "Director",
    requestJson: async (path, init) => {
      calls.push({ path, init });
      return {
        token: "jwt",
        url: "wss://client.lemo-design.com/livekit",
        room: "meet-1",
        meetingId: "meet-1",
        identity: "host-owner-1",
        provider: "livekit" as const,
      };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, "/api/v1/meetings/meet-1/room-token");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    role: "host",
    displayName: "Director",
  });
  assert.equal(credentials.room, "meet-1");
  assert.equal(credentials.provider, "livekit");
});

test("fetchMeetingRoomToken rejects empty meeting ids", async () => {
  await assert.rejects(
    () =>
      fetchMeetingRoomToken({
        meetingId: "  ",
        requestJson: async () => {
          throw new Error("should not call");
        },
      }),
    /meetingId is required/,
  );
});
