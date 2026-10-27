import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  parseChatwootConversationFromWebhookPayload,
  parseChatwootConversationPayload,
  parseChatwootMessagePayload,
} from "./chatwoot-client.js";

describe("parseChatwootConversationFromWebhookPayload", () => {
  test("message_created uses nested conversation id, not message id", () => {
    const summary = parseChatwootConversationFromWebhookPayload({
      event: "message_created",
      id: 9001,
      content: "Hello again",
      conversation_id: 7,
      conversation: {
        id: 7,
        inbox_id: 3,
        status: "open",
        meta: { sender: { name: "Visitor", email: "v@example.com" } },
        messages: [{ content: "Hello again" }],
      },
      sender: { name: "Visitor" },
    });
    assert.equal(summary?.id, "7");
    assert.notEqual(summary?.id, "9001");
    assert.equal(summary?.contact.name, "Visitor");
  });

  test("message_created falls back to conversation_id when nested object missing", () => {
    const summary = parseChatwootConversationFromWebhookPayload({
      event: "message_created",
      id: 42,
      conversation_id: 11,
      content: "Ping",
      sender: { name: "Ada" },
    });
    assert.equal(summary?.id, "11");
    assert.equal(summary?.contact.name, "Ada");
  });

  test("conversation_created still reads top-level conversation id", () => {
    const summary = parseChatwootConversationFromWebhookPayload({
      event: "conversation_created",
      id: 55,
      inbox_id: 2,
      status: "open",
      meta: { sender: { name: "Bob" } },
    });
    assert.equal(summary?.id, "55");
    assert.equal(summary?.contact.name, "Bob");
  });
});

describe("parseChatwootMessagePayload", () => {
  test("keeps message id separate from conversation id", () => {
    const message = parseChatwootMessagePayload({
      id: 9001,
      conversation_id: 7,
      content: "Hello",
      message_type: 0,
      created_at: 1_700_000_000,
    });
    assert.equal(message?.id, "9001");
    assert.equal(message?.conversationId, "7");
  });
});

describe("parseChatwootConversationPayload contact username", () => {
  test("reads Telegram handle from additional_attributes", () => {
    const summary = parseChatwootConversationPayload({
      id: 12,
      inbox_id: 1,
      status: "open",
      meta: {
        channel: "Channel::Telegram",
        sender: {
          name: "Remon de Vries",
          additional_attributes: {
            username: "remondevries",
            social_telegram_user_name: "remondevries",
            social_telegram_user_id: 7014761034,
          },
        },
      },
    });
    assert.equal(summary?.contact.username, "remondevries");
    assert.equal(summary?.channelType, "Channel::Telegram");
  });

  test("reads Facebook PSID from additional_attributes", () => {
    const summary = parseChatwootConversationPayload({
      id: 9,
      inbox_id: 2,
      status: "open",
      meta: {
        channel: "Channel::FacebookPage",
        sender: {
          name: "Remon",
          additional_attributes: {
            social_facebook_user_id: "1029384756",
          },
        },
      },
    });
    assert.equal(summary?.contact.username, "1029384756");
  });

  test("reads Facebook PSID from contact_inboxes source_id", () => {
    const summary = parseChatwootConversationPayload({
      id: 13,
      inbox_id: 5,
      status: "open",
      meta: {
        channel: "Channel::FacebookPage",
        sender: {
          name: "Remon de Vries",
          additional_attributes: {
            avatar_url_hash: "abc",
          },
          contact_inboxes: [
            {
              source_id: "5232323873480533",
              inbox: { channel_type: "Channel::FacebookPage" },
            },
          ],
        },
      },
    });
    assert.equal(summary?.contact.username, "5232323873480533");
  });

  test("reads Instagram handle from additional_attributes", () => {
    const summary = parseChatwootConversationPayload({
      id: 15,
      inbox_id: 7,
      status: "open",
      meta: {
        channel: "Channel::Instagram",
        sender: {
          name: "Remon de Vries",
          additional_attributes: {
            social_instagram_user_name: "remon_devries",
            social_profiles: { instagram: "remon_devries" },
          },
        },
      },
    });
    assert.equal(summary?.contact.username, "remon_devries");
    assert.equal(summary?.channelType, "Channel::Instagram");
  });

  test("falls back to Instagram source_id when handle attrs are missing", () => {
    const summary = parseChatwootConversationPayload({
      id: 16,
      inbox_id: 7,
      status: "open",
      meta: {
        channel: "Channel::Instagram",
        sender: {
          name: "Remon de Vries",
          additional_attributes: { avatar_url_hash: "abc" },
          contact_inboxes: [
            {
              source_id: "5174845292553392",
              inbox: { channel_type: "Channel::Instagram" },
            },
          ],
        },
      },
    });
    assert.equal(summary?.contact.username, "5174845292553392");
  });

  test("reads WhatsApp phone as contact username", () => {
    const summary = parseChatwootConversationPayload({
      id: 17,
      inbox_id: 8,
      status: "open",
      meta: {
        channel: "Channel::Whatsapp",
        sender: {
          name: "Remon de Vries",
          phone_number: "+31615508080",
          additional_attributes: {},
        },
      },
    });
    assert.equal(summary?.contact.phone, "+31615508080");
    assert.equal(summary?.contact.username, "31615508080");
    assert.equal(summary?.channelType, "Channel::Whatsapp");
  });

  test("reads X / Twitter screen_name from additional_attributes", () => {
    const summary = parseChatwootConversationPayload({
      id: 18,
      inbox_id: 9,
      status: "open",
      meta: {
        channel: "Channel::TwitterProfile",
        sender: {
          name: "Remon de Vries",
          additional_attributes: {
            screen_name: "remon_devries",
          },
        },
      },
    });
    assert.equal(summary?.contact.username, "remon_devries");
    assert.equal(summary?.channelType, "Channel::TwitterProfile");
  });

  test("extracts X handle from Display (@handle) when channel is Api", () => {
    const summary = parseChatwootConversationPayload({
      id: 17,
      inbox_id: 8,
      status: "open",
      meta: {
        channel: "Channel::Api",
        sender: {
          name: "Remon de Vries (@remondevries)",
        },
      },
    });
    assert.equal(summary?.contact.username, "remondevries");
    assert.equal(summary?.channelType, "Channel::Api");
  });
});
