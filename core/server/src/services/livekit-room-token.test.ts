import assert from "node:assert/strict";
import { jwtVerify } from "jose";
import { test } from "node:test";

import type { AuthContext } from "../middleware/auth.js";
import {
  buildMeetingRoomParticipantIdentity,
  canMintMeetingHostRoomToken,
  meetingLiveKitRoomName,
  mintMeetingLiveKitToken,
  parseDotenv,
  resolveLiveKitClientUrl,
  resolveMeetingRoomParticipantKey,
  type LiveKitRoomConfig,
} from "./livekit-room-token.js";

const config: LiveKitRoomConfig = {
  url: "wss://client.lemo-design.com/livekit",
  apiKey: "devkey",
  apiSecret: "secret",
};

function auth(partial: Partial<AuthContext>): AuthContext {
  return {
    kind: "api_key",
    userId: "user-1",
    clerkUserId: null,
    apiKeyId: "key-1",
    contactId: null,
    workspaceId: "ws-1",
    membershipRole: null,
    scopes: [],
    ...partial,
  };
}

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

test("canMintMeetingHostRoomToken allows owner shell and Access keys, not agents", () => {
  assert.equal(
    canMintMeetingHostRoomToken(
      auth({
        kind: "local_shell",
        userId: "owner",
        apiKeyId: null,
        membershipRole: "owner",
        scopes: [],
      }),
    ),
    true,
  );
  assert.equal(
    canMintMeetingHostRoomToken(
      auth({
        scopes: ["settings:write", "tasks:write", "tasks:read"],
        contactId: null,
      }),
    ),
    true,
  );
  // Agent persona key (contact-bound), even if somehow overscoped.
  assert.equal(
    canMintMeetingHostRoomToken(
      auth({
        contactId: "agent-contact",
        scopes: ["settings:write", "tasks:write", "tasks:read"],
      }),
    ),
    false,
  );
  // Typical agent key: tasks only.
  assert.equal(
    canMintMeetingHostRoomToken(
      auth({
        contactId: "agent-contact",
        scopes: ["tasks:read", "tasks:write"],
      }),
    ),
    false,
  );
  assert.equal(
    canMintMeetingHostRoomToken(
      auth({
        contactId: null,
        scopes: ["tasks:read"],
      }),
    ),
    false,
  );
  assert.equal(canMintMeetingHostRoomToken(null), false);
});

test("buildMeetingRoomParticipantIdentity is unique per key / random suffix", () => {
  assert.equal(
    buildMeetingRoomParticipantIdentity({
      role: "host",
      participantKey: "user-42",
    }),
    "host-user-42",
  );
  assert.equal(
    buildMeetingRoomParticipantIdentity({
      role: "guest",
      participantKey: "contact/abc!",
    }),
    "guest-contactabc",
  );
  const a = buildMeetingRoomParticipantIdentity({
    role: "host",
    randomSuffix: () => "aaa111",
  });
  const b = buildMeetingRoomParticipantIdentity({
    role: "host",
    randomSuffix: () => "bbb222",
  });
  assert.equal(a, "host-aaa111");
  assert.equal(b, "host-bbb222");
  assert.notEqual(a, b);
});

test("mintMeetingLiveKitToken signs unique host JWTs for the same meeting room", async () => {
  const first = await mintMeetingLiveKitToken(
    {
      meetingId: "meeting-abc",
      role: "host",
      displayName: "Director",
      participantKey: "owner-1",
    },
    config,
  );
  const second = await mintMeetingLiveKitToken(
    {
      meetingId: "meeting-abc",
      role: "host",
      displayName: "Director 2",
      participantKey: "owner-2",
    },
    config,
  );
  assert.equal(first.room, "meeting-abc");
  assert.equal(second.room, "meeting-abc");
  assert.equal(first.identity, "host-owner-1");
  assert.equal(second.identity, "host-owner-2");
  assert.notEqual(first.identity, second.identity);

  const secret = new TextEncoder().encode(config.apiSecret);
  const firstPayload = (
    await jwtVerify(first.token, secret, { issuer: config.apiKey })
  ).payload;
  const secondPayload = (
    await jwtVerify(second.token, secret, { issuer: config.apiKey })
  ).payload;
  assert.equal(firstPayload.sub, "host-owner-1");
  assert.equal(secondPayload.sub, "host-owner-2");
  assert.equal(
    (firstPayload.video as { room?: string }).room,
    "meeting-abc",
  );
});

test("mintMeetingLiveKitToken guest identities stay unique under one room", async () => {
  const first = await mintMeetingLiveKitToken(
    { meetingId: "meeting-abc", role: "guest", participantKey: "g1" },
    config,
  );
  const second = await mintMeetingLiveKitToken(
    { meetingId: "meeting-abc", role: "guest", participantKey: "g2" },
    config,
  );
  assert.equal(first.identity, "guest-g1");
  assert.equal(second.identity, "guest-g2");
  assert.notEqual(first.identity, second.identity);
  assert.equal(first.room, second.room);
});

test("resolveMeetingRoomParticipantKey keeps host stable and guests explicit-or-random", () => {
  const owner = auth({ contactId: null, scopes: ["tasks:write", "settings:write"] });
  assert.equal(
    resolveMeetingRoomParticipantKey({
      role: "host",
      auth: owner,
    }),
    "user-1",
  );
  assert.equal(
    resolveMeetingRoomParticipantKey({
      role: "host",
      participantKey: " explicit-host ",
      auth: owner,
    }),
    "explicit-host",
  );
  assert.equal(
    resolveMeetingRoomParticipantKey({
      role: "guest",
      auth: owner,
    }),
    null,
  );
  assert.equal(
    resolveMeetingRoomParticipantKey({
      role: "guest",
      participantKey: "contact-9",
      auth: owner,
    }),
    "contact-9",
  );
});

test("guest mints without participantKey get unique random identities", async () => {
  const first = await mintMeetingLiveKitToken(
    { meetingId: "meeting-abc", role: "guest" },
    config,
  );
  const second = await mintMeetingLiveKitToken(
    { meetingId: "meeting-abc", role: "guest" },
    config,
  );
  assert.match(first.identity, /^guest-[a-zA-Z0-9]+$/);
  assert.match(second.identity, /^guest-[a-zA-Z0-9]+$/);
  assert.notEqual(first.identity, second.identity);
});
