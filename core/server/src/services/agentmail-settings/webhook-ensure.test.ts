import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyAgentMailWebhookEnsure,
  isAgentMailDoorWebhookUrl,
} from "./settings.js";

const DOOR =
  "https://agent.backsteros.com/api/v1/webhooks/agentmail";
const STAGING =
  "https://staging.backsteros.com/api/v1/webhooks/agentmail";

describe("AgentMail webhook ensure (OS-188)", () => {
  it("accepts only the agents-door webhook path", () => {
    assert.equal(isAgentMailDoorWebhookUrl(DOOR), true);
    assert.equal(
      isAgentMailDoorWebhookUrl(
        "https://agents.backsteros.com/api/v1/webhooks/agentmail",
      ),
      true,
    );
    assert.equal(isAgentMailDoorWebhookUrl(STAGING), false);
    assert.equal(
      isAgentMailDoorWebhookUrl("https://agent.backsteros.com/other"),
      false,
    );
  });

  it("recreates when the stored URL is staging / not the door", () => {
    const decision = classifyAgentMailWebhookEnsure({
      targetUrl: DOOR,
      storedUrl: STAGING,
      desiredInboxIds: ["inbox_a", "inbox_b"],
      remote: {
        enabled: true,
        url: STAGING,
        inboxIds: ["inbox_a"],
      },
    });
    assert.equal(decision.action, "recreate");
    if (decision.action === "recreate") {
      assert.match(decision.reason, /mismatch|not the agents door|staging/i);
    }
  });

  it("recreates when the remote webhook is disabled", () => {
    const decision = classifyAgentMailWebhookEnsure({
      targetUrl: DOOR,
      storedUrl: DOOR,
      desiredInboxIds: ["inbox_a", "inbox_b"],
      remote: {
        enabled: false,
        url: DOOR,
        inboxIds: ["inbox_a", "inbox_b"],
      },
    });
    assert.equal(decision.action, "recreate");
    if (decision.action === "recreate") {
      assert.match(decision.reason, /enabled:false/);
    }
  });

  it("updates inboxes when the door hook is healthy but incomplete", () => {
    const decision = classifyAgentMailWebhookEnsure({
      targetUrl: DOOR,
      storedUrl: DOOR,
      desiredInboxIds: ["inbox_a", "inbox_b", "inbox_c"],
      remote: {
        enabled: true,
        url: DOOR,
        inboxIds: ["inbox_a"],
      },
    });
    assert.equal(decision.action, "update-inboxes");
    if (decision.action === "update-inboxes") {
      assert.deepEqual(decision.toAdd, ["inbox_b", "inbox_c"]);
      assert.deepEqual(decision.toRemove, []);
    }
  });

  it("no-ops when the door hook already covers every inbox", () => {
    const decision = classifyAgentMailWebhookEnsure({
      targetUrl: DOOR,
      storedUrl: DOOR,
      desiredInboxIds: ["inbox_a", "inbox_b"],
      remote: {
        enabled: true,
        url: DOOR,
        inboxIds: ["inbox_a", "inbox_b"],
      },
    });
    assert.equal(decision.action, "noop");
  });
});
