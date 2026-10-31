import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  pruneProjectChannelOverlay,
  type ProjectOverlay,
} from "./project-overlay";

describe("pruneProjectChannelOverlay", () => {
  it("clears connecting overlay when live is active", () => {
    const overlay: ProjectOverlay = {
      pf: {
        channelStatus: "connecting",
        channelRequestedAt: "2026-10-31T18:18:44.000Z",
      },
    };
    const next = pruneProjectChannelOverlay(overlay, [
      { id: "pf", channelStatus: "active" },
    ]);
    assert.equal(next.pf, undefined);
  });

  it("keeps connecting overlay while live is still inactive", () => {
    const overlay: ProjectOverlay = {
      pf: { channelStatus: "connecting", name: "PF" },
    };
    const next = pruneProjectChannelOverlay(overlay, [
      { id: "pf", channelStatus: "inactive" },
    ]);
    assert.equal(next.pf?.channelStatus, "connecting");
    assert.equal(next.pf?.name, "PF");
  });

  it("clears channel fields but keeps unrelated overlay keys", () => {
    const overlay: ProjectOverlay = {
      pf: {
        channelStatus: "connecting",
        name: "Renamed",
      },
    };
    const next = pruneProjectChannelOverlay(overlay, [
      { id: "pf", channelStatus: "needs_details" },
    ]);
    assert.deepEqual(next.pf, { name: "Renamed" });
  });
});
