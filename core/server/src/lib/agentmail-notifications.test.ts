import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGENTMAIL_NOTIFICATIONS_LABEL,
  hasAgentMailNotificationsLabel,
  isAgentMailNotificationsLabel,
} from "./agentmail-notifications.js";

describe("agentmail notifications label", () => {
  it("uses a stable lowercase folder label", () => {
    assert.equal(AGENTMAIL_NOTIFICATIONS_LABEL, "notifications");
    assert.equal(isAgentMailNotificationsLabel("Notifications"), true);
    assert.equal(isAgentMailNotificationsLabel("  NOTIFICATIONS "), true);
    assert.equal(isAgentMailNotificationsLabel("sent"), false);
  });

  it("detects the label on message label arrays", () => {
    assert.equal(hasAgentMailNotificationsLabel(null), false);
    assert.equal(hasAgentMailNotificationsLabel([]), false);
    assert.equal(hasAgentMailNotificationsLabel(["sent", "unread"]), false);
    assert.equal(
      hasAgentMailNotificationsLabel(["sent", "notifications"]),
      true,
    );
  });
});
