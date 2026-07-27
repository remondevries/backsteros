import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isAgentCliOpenFromSignals } from "./agent-cli-open.ts";

describe("isAgentCliOpenFromSignals", () => {
  it("is closed when the UI is detached even with sticky attach/title", () => {
    assert.equal(
      isAgentCliOpenFromSignals({
        uiConnected: false,
        hasAgentTitle: true,
        titleConfirmed: true,
        hookLive: true,
        activity: "working",
        attached: true,
        markedAsAgent: true,
      }),
      false,
    );
  });

  it("is open for hard title / hook signals on a live socket", () => {
    assert.equal(
      isAgentCliOpenFromSignals({
        uiConnected: true,
        hasAgentTitle: false,
        titleConfirmed: true,
        hookLive: false,
        attached: false,
        markedAsAgent: false,
      }),
      true,
    );
    assert.equal(
      isAgentCliOpenFromSignals({
        uiConnected: true,
        hasAgentTitle: false,
        titleConfirmed: false,
        hookLive: true,
        attached: false,
        markedAsAgent: false,
      }),
      true,
    );
    assert.equal(
      isAgentCliOpenFromSignals({
        uiConnected: true,
        hasAgentTitle: true,
        titleConfirmed: false,
        hookLive: false,
        attached: false,
        markedAsAgent: false,
      }),
      true,
    );
  });

  it("is open while working/attention even without title marks", () => {
    assert.equal(
      isAgentCliOpenFromSignals({
        uiConnected: true,
        hasAgentTitle: false,
        titleConfirmed: false,
        hookLive: false,
        activity: "working",
        attached: false,
        markedAsAgent: false,
      }),
      true,
    );
  });

  it("soft-opens only when attach and markAsAgent both set on a live socket", () => {
    assert.equal(
      isAgentCliOpenFromSignals({
        uiConnected: true,
        hasAgentTitle: false,
        titleConfirmed: false,
        hookLive: false,
        activity: "idle",
        attached: true,
        markedAsAgent: false,
      }),
      false,
    );
    assert.equal(
      isAgentCliOpenFromSignals({
        uiConnected: true,
        hasAgentTitle: false,
        titleConfirmed: false,
        hookLive: false,
        activity: "idle",
        attached: false,
        markedAsAgent: true,
      }),
      false,
    );
    assert.equal(
      isAgentCliOpenFromSignals({
        uiConnected: true,
        hasAgentTitle: false,
        titleConfirmed: false,
        hookLive: false,
        activity: "idle",
        attached: true,
        markedAsAgent: true,
      }),
      true,
    );
  });

  it("is closed for a plain shell with no agent signals", () => {
    assert.equal(
      isAgentCliOpenFromSignals({
        uiConnected: true,
        hasAgentTitle: false,
        titleConfirmed: false,
        hookLive: false,
        activity: "idle",
        attached: false,
        markedAsAgent: false,
      }),
      false,
    );
  });
});
