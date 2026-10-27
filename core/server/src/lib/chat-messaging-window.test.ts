import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateMessagingWindow,
  resolveChatCreateChannel,
} from "./chat-messaging-window.js";

describe("evaluateMessagingWindow", () => {
  const now = new Date("2026-10-27T15:00:00.000Z");

  it("requires a WhatsApp template with no prior incoming message", () => {
    const result = evaluateMessagingWindow({
      channel: "whatsapp",
      lastIncomingAt: null,
      hasChannelIdentity: true,
      now,
    });
    assert.equal(result.open, false);
    assert.equal(result.requiresTemplate, true);
    assert.match(result.reason ?? "", /template/i);
  });

  it("allows free-form WhatsApp inside the 24h window", () => {
    const result = evaluateMessagingWindow({
      channel: "whatsapp",
      lastIncomingAt: "2026-10-27T10:00:00.000Z",
      hasChannelIdentity: true,
      now,
    });
    assert.equal(result.open, true);
    assert.equal(result.requiresTemplate, false);
    assert.equal(result.reason, null);
  });

  it("requires a WhatsApp template after the 24h window", () => {
    const result = evaluateMessagingWindow({
      channel: "whatsapp",
      lastIncomingAt: "2026-10-26T10:00:00.000Z",
      hasChannelIdentity: true,
      now,
    });
    assert.equal(result.open, false);
    assert.equal(result.requiresTemplate, true);
    assert.match(result.reason ?? "", /window is closed/i);
  });

  it("blocks Instagram cold outreach without channel identity", () => {
    const result = evaluateMessagingWindow({
      channel: "instagram",
      lastIncomingAt: null,
      hasChannelIdentity: false,
      now,
    });
    assert.equal(result.open, false);
    assert.equal(result.requiresTemplate, false);
    assert.match(result.reason ?? "", /cold outreach/i);
  });

  it("blocks Messenger outside the 24h window with a clear reason", () => {
    const result = evaluateMessagingWindow({
      channel: "messenger",
      lastIncomingAt: "2026-10-20T15:00:00.000Z",
      hasChannelIdentity: true,
      now,
    });
    assert.equal(result.open, false);
    assert.match(result.reason ?? "", /Messenger/i);
    assert.match(result.reason ?? "", /window is closed/i);
  });

  it("allows Messenger inside the window when identity exists", () => {
    const result = evaluateMessagingWindow({
      channel: "messenger",
      lastIncomingAt: "2026-10-27T12:00:00.000Z",
      hasChannelIdentity: true,
      now,
    });
    assert.equal(result.open, true);
    assert.equal(result.reason, null);
  });

  it("uses a 7-day window for Instagram with HUMAN_AGENT", () => {
    const result = evaluateMessagingWindow({
      channel: "instagram",
      lastIncomingAt: "2026-10-22T15:00:00.000Z",
      hasChannelIdentity: true,
      humanAgentTag: true,
      now,
    });
    assert.equal(result.open, true);
    assert.equal(result.windowHours, 24 * 7);
  });

  it("blocks Telegram without an existing bot chat_id", () => {
    const result = evaluateMessagingWindow({
      channel: "telegram",
      lastIncomingAt: null,
      hasChannelIdentity: false,
      now,
    });
    assert.equal(result.open, false);
    assert.match(result.reason ?? "", /started the bot/i);
  });

  it("allows Telegram once a prior chat exists", () => {
    const result = evaluateMessagingWindow({
      channel: "telegram",
      lastIncomingAt: "2026-01-01T00:00:00.000Z",
      hasChannelIdentity: true,
      now,
    });
    assert.equal(result.open, true);
    assert.equal(result.reason, null);
  });

  it("blocks Support without a contact email", () => {
    const result = evaluateMessagingWindow({
      channel: "support",
      lastIncomingAt: null,
      hasChannelIdentity: false,
      now,
    });
    assert.equal(result.open, false);
    assert.match(result.reason ?? "", /email/i);
  });

  it("allows Support when the contact has an email", () => {
    const result = evaluateMessagingWindow({
      channel: "support",
      lastIncomingAt: null,
      hasChannelIdentity: true,
      now,
    });
    assert.equal(result.open, true);
    assert.equal(result.reason, null);
  });

  it("blocks X without a numeric user id and warns about encrypted Chat", () => {
    const blocked = evaluateMessagingWindow({
      channel: "x",
      lastIncomingAt: null,
      hasChannelIdentity: false,
      now,
    });
    assert.equal(blocked.open, false);
    assert.match(blocked.reason ?? "", /numeric X user id/i);
    assert.match(blocked.reason ?? "", /encrypted X Chat/i);

    const open = evaluateMessagingWindow({
      channel: "x",
      lastIncomingAt: null,
      hasChannelIdentity: true,
      now,
    });
    assert.equal(open.open, true);
    assert.match(open.reason ?? "", /encrypted X Chat/i);
  });
});

describe("resolveChatCreateChannel", () => {
  it("maps Chatwoot channel types", () => {
    assert.equal(resolveChatCreateChannel("Channel::Whatsapp"), "whatsapp");
    assert.equal(resolveChatCreateChannel("Channel::Instagram"), "instagram");
    assert.equal(
      resolveChatCreateChannel("Channel::FacebookPage"),
      "messenger",
    );
    assert.equal(resolveChatCreateChannel("Channel::Telegram"), "telegram");
    assert.equal(resolveChatCreateChannel("Channel::Email"), "support");
    assert.equal(
      resolveChatCreateChannel("Channel::Api", "Lemo-Design X (@lemodesign)"),
      "x",
    );
    assert.equal(
      resolveChatCreateChannel("Channel::Api", "Support desk"),
      "support",
    );
    assert.equal(
      resolveChatCreateChannel("Channel::Api", "WhatsApp Cloud"),
      "whatsapp",
    );
    assert.equal(resolveChatCreateChannel("Channel::Api", "Website"), null);
  });
});
