import assert from "node:assert/strict";
import { jwtVerify } from "jose";
import { test } from "node:test";

import {
  meetingLiveKitRoomName,
  mintMeetingLiveKitToken,
  parseDotenv,
  resolveLiveKitClientUrl,
  type LiveKitRoomConfig,
} from "./livekit-room-token.js";

test("parseDotenv ignores comments and strips quotes", () => {
  const parsed = parseDotenv(
    '# comment\nLIVEKIT_URL="wss://example/livekit"\nLIVEKIT_API_KEY=devkey\n',
  );
  assert.equal(parsed.LIVEKIT_URL, "wss://example/livekit");
  assert.equal(parsed.LIVEKIT_API_KEY, "devkey");
});

test("resolveLiveKitClientUrl prefers portal CLIENT_URL and keeps remote hosts", () => {
  assert.equal(
    resolveLiveKitClientUrl(
      {
        LIVEKIT_CLIENT_URL: "wss://client.lemo-design.com/livekit",
        LIVEKIT_URL: "ws://127.0.0.1:7880",
      },
      {},
    ),
    "wss://client.lemo-design.com/livekit",
  );
  assert.equal(
    resolveLiveKitClientUrl({ LIVEKIT_URL: "ws://10.0.0.2:7880" }, {}),
    "ws://127.0.0.1:7880",
  );
});

test("meetingLiveKitRoomName is the meeting id", () => {
  assert.equal(meetingLiveKitRoomName(" meet-1 "), "meet-1");
  assert.throws(() => meetingLiveKitRoomName("  "));
});

test("mintMeetingLiveKitToken signs a host JWT for the meeting room", async () => {
  const config: LiveKitRoomConfig = {
    url: "wss://client.lemo-design.com/livekit",
    apiKey: "devkey",
    apiSecret: "secret",
  };
  const result = await mintMeetingLiveKitToken(
    { meetingId: "meeting-abc", role: "host", displayName: "Director" },
    config,
  );
  assert.equal(result.provider, "livekit");
  assert.equal(result.room, "meeting-abc");
  assert.equal(result.meetingId, "meeting-abc");
  assert.equal(result.url, config.url);

  const secret = new TextEncoder().encode(config.apiSecret);
  const { payload } = await jwtVerify(result.token, secret, {
    issuer: config.apiKey,
  });
  assert.equal(payload.sub, "host-director");
  assert.equal(payload.name, "Director");
  const video = payload.video as { room?: string; roomJoin?: boolean };
  assert.equal(video.room, "meeting-abc");
  assert.equal(video.roomJoin, true);
});
