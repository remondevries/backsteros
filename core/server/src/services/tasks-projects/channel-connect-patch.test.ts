import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveChannelConnectPatch } from "./projects.js";
import { isPowerSyncSkippableError } from "../sync/payload-mappers.js";

const emptyExisting = {
  channel: null,
  channelStatus: "inactive",
  channelStage: null,
  channelPendingLink: null,
  channelRequestedAt: null,
};

describe("resolveChannelConnectPatch", () => {
  it("rejects channelStatus=connecting for client PATCH", () => {
    assert.throws(
      () =>
        resolveChannelConnectPatch({
          existing: emptyExisting,
          input: { channelStatus: "connecting" },
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "CHANNEL_CONNECT_VIA_ENDPOINT",
    );
  });

  it("allows connecting when twin/leader apply sets allowConnectingStatus", () => {
    const patch = resolveChannelConnectPatch({
      existing: emptyExisting,
      input: {
        channelStatus: "connecting",
        channelPendingLink: null,
        channelRequestedAt: "2026-10-31T12:00:00.000Z",
      },
      allowConnectingStatus: true,
    });
    assert.equal(patch.channelStatus, "connecting");
    assert.equal(patch.channelPendingLink, null);
    assert.ok(patch.channelRequestedAt instanceof Date);
  });

  it("treats CHANNEL_CONNECT_VIA_ENDPOINT as PowerSync-skippable", () => {
    assert.equal(
      isPowerSyncSkippableError(new Error("CHANNEL_CONNECT_VIA_ENDPOINT")),
      true,
    );
  });

  it("accepts channelStage while connecting and clears it on active", () => {
    const connecting = resolveChannelConnectPatch({
      existing: {
        ...emptyExisting,
        channelStatus: "connecting",
      },
      input: { channelStage: "creating_room" },
      allowConnectingStatus: true,
    });
    assert.equal(connecting.channelStage, "creating_room");
    assert.equal(connecting.channelStatus, "connecting");

    const active = resolveChannelConnectPatch({
      existing: {
        ...emptyExisting,
        channelStatus: "connecting",
        channelStage: "finishing",
      },
      input: {
        channel: {
          uri: "grokbot://app/v1/agent?id=550e8400-e29b-41d4-a716-446655440000",
          name: "Room",
        },
        channelStatus: "active",
      },
    });
    assert.equal(active.channelStatus, "active");
    assert.equal(active.channelStage, null);
  });

  it("clears channelStage on inactive", () => {
    const patch = resolveChannelConnectPatch({
      existing: {
        ...emptyExisting,
        channelStatus: "connecting",
        channelStage: "adding_users",
      },
      input: { channelStatus: "inactive", channel: null },
    });
    assert.equal(patch.channelStatus, "inactive");
    assert.equal(patch.channelStage, null);
  });
});
