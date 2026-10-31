import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveChannelConnectPatch } from "./projects.js";
import { isPowerSyncSkippableError } from "../sync/payload-mappers.js";

const emptyExisting = {
  channel: null,
  channelStatus: "inactive",
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
});
