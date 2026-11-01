import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shouldRequestLeadAgentTransfer } from "./lead-agent-transfer.ts";

describe("shouldRequestLeadAgentTransfer", () => {
  it("is true when swapping lead on a connected channel", () => {
    assert.equal(
      shouldRequestLeadAgentTransfer({
        previousContactId: "c-niels",
        nextContactId: "c-eva",
        channelUri: "grokbot://room",
      }),
      true,
    );
  });

  it("is false when clearing, first-assigning, same lead, or no channel", () => {
    assert.equal(
      shouldRequestLeadAgentTransfer({
        previousContactId: "c-niels",
        nextContactId: null,
        channelUri: "grokbot://room",
      }),
      false,
    );
    assert.equal(
      shouldRequestLeadAgentTransfer({
        previousContactId: null,
        nextContactId: "c-eva",
        channelUri: "grokbot://room",
      }),
      false,
    );
    assert.equal(
      shouldRequestLeadAgentTransfer({
        previousContactId: "c-niels",
        nextContactId: "c-niels",
        channelUri: "grokbot://room",
      }),
      false,
    );
    assert.equal(
      shouldRequestLeadAgentTransfer({
        previousContactId: "c-niels",
        nextContactId: "c-eva",
        channelUri: null,
      }),
      false,
    );
  });
});
