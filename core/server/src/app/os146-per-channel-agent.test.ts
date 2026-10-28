/**
 * OS-146 acceptance: per-channel create + follow-up with mocked Chatwoot/AgentMail,
 * using agent scopes that exclude settings:read/write.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as chatCreateService from "../services/chat-create-conversation.js";
import * as chatService from "../services/chat-service.js";
import { X_LEMO_DESIGN_INBOX_ID } from "../lib/chat-messaging-window.js";
import { AGENT_KEY_SCOPES } from "@backsteros/contracts";

process.env.DATABASE_URL ??=
  "postgres://backsteros:backsteros@127.0.0.1:5433/backsteros_test";

const AGENT_SCOPES = [
  "chat:read",
  "chat:write",
  "email:read",
  "email:send",
  "contacts:read",
] as const;

assert.equal(AGENT_SCOPES.includes("settings:read" as never), false);
assert.equal(AGENT_SCOPES.includes("settings:write" as never), false);
assert.equal(AGENT_KEY_SCOPES.includes("settings:read" as never), false);
assert.equal(AGENT_KEY_SCOPES.includes("settings:write" as never), false);
assert.ok(AGENT_KEY_SCOPES.includes("chat:read"));
assert.ok(AGENT_KEY_SCOPES.includes("email:send"));

function contactRow() {
  return {
    id: "c1",
    name: "Jan",
    phone: "+31612345678",
    phones: [],
    email: "jan@example.com",
    facebookMessengerId: "psid-1",
    xUserId: "50254162",
  } as never;
}

function localOpen(channelType: string, username: string) {
  return {
    id: "local-1",
    externalId: "ext-99",
    contactUsername: username,
    status: "open",
    inboxId: "1",
    channelType,
    inboxName: "Inbox",
    contactAvatarUrl: null,
  } as never;
}

function makeClient(
  calls: { createMessage: number; createConversation: number },
  channelType: string,
  username: string,
) {
  const contact = {
    id: "cw-1",
    name: "Jan",
    email: "jan@example.com",
    phone: "+31612345678",
    username,
    identifier: username,
    avatarUrl: null,
    customAttributes: { x_user_id: "50254162" },
  };
  return {
    createConversation: async () => {
      calls.createConversation += 1;
      return {
        id: "ext-new",
        inboxId: "1",
        status: "open",
        channelType,
        contact,
      };
    },
    createMessage: async (_id: string, input: { content: string }) => {
      calls.createMessage += 1;
      return {
        id: `msg-${calls.createMessage}`,
        content: input.content,
        contentType: "text",
        messageType: "outgoing" as const,
        senderName: "Agent",
        private: false,
        createdAt: new Date().toISOString(),
      };
    },
    searchContacts: async () => [contact],
    filterContactsByCustomAttribute: async () => [contact],
    createContact: async () => contact,
    createContactInbox: async () => undefined,
    listContactConversations: async () => [],
    getContact: async () => contact,
    getContactInboxes: async () => [
      { inboxId: "1", sourceId: username },
    ],
    getConversation: async () => ({
      id: "ext-99",
      inboxId: "1",
      status: "open",
      channelType,
      contact,
      lastActivityAt: new Date().toISOString(),
      unreadCount: 0,
      lastMessagePreview: null,
    }),
    updateContact: async () => undefined,
    reopenConversation: async () => undefined,
  };
}

describe("OS-146 per-channel create + follow-up (agent scopes, no settings)", () => {
  const chatChannels = [
    {
      channel: "whatsapp" as const,
      channelType: "Channel::Whatsapp",
      username: "31612345678",
      template: { name: "hello", category: "UTILITY", language: "en" },
      openWindow: false,
    },
    {
      channel: "instagram" as const,
      channelType: "Channel::Instagram",
      username: "17841400000000000",
      openWindow: true,
    },
    {
      channel: "messenger" as const,
      channelType: "Channel::Facebook",
      username: "psid-1",
      openWindow: true,
    },
    {
      channel: "telegram" as const,
      channelType: "Channel::Telegram",
      username: "123456",
      openWindow: true,
    },
    {
      channel: "x" as const,
      channelType: "Channel::Api",
      username: "50254162",
      openWindow: true,
      inboxId: X_LEMO_DESIGN_INBOX_ID,
    },
    {
      channel: "support" as const,
      channelType: "Channel::Email",
      username: "jan@example.com",
      openWindow: true,
      subject: "Help",
    },
  ];

  for (const spec of chatChannels) {
    it(`${spec.channel}: create then follow-up with mocked Chatwoot`, async () => {
      const calls = { createMessage: 0, createConversation: 0 };
      const client = makeClient(calls, spec.channelType, spec.username);
      const detail = {
        id: "local-1",
        messages: [{ id: "m1", content: "Hi", direction: "outgoing" }],
      };

      const created = await chatCreateService.createChatConversation(
        "ws_1",
        {
          channel: spec.channel,
          contactId: "c1",
          content: "Hello from agent",
          subject: spec.subject,
          template: spec.template,
          inboxId: spec.inboxId,
        },
        {
          loadContact: async () => contactRow(),
          findLocalChannelConversation: async () =>
            // Instagram/Messenger/Telegram need an existing thread; WhatsApp
            // template path may cold-start; support/x can open with identity.
            spec.channel === "whatsapp" && spec.template
              ? null
              : localOpen(spec.channelType, spec.username),
          lastIncomingAtForConversation: async () =>
            spec.openWindow ? new Date().toISOString() : null,
          listChannelInboxes: async () => ({
            inboxes: [
              {
                id: spec.inboxId ?? "1",
                name: spec.channel,
                channelType: spec.channelType,
                channel: spec.channel,
              },
            ],
          }),
          getChatwootCredentials: async () =>
            ({
              baseUrl: "https://chatwoot.example",
              accountId: "1",
              apiAccessToken: "token",
            }) as never,
          createChatwootClient: () => client as never,
          upsertConversationFromChatwoot: async () =>
            ({ conversation: { id: "local-1" } }) as never,
          upsertMessageFromChatwoot: async () => undefined as never,
          getChatConversation: async () => detail as never,
          publishChatUpdated: () => undefined,
          notifyPeerOfEntityWrite: () => undefined,
          linkConversationContact: async () => undefined,
        },
      );

      assert.equal((created as { id?: string }).id, "local-1");

      const follow = await chatService.createChatMessage(
        "ws_1",
        "local-1",
        { content: "Follow-up from agent" },
        {
          getChatwootCredentials: async () =>
            ({
              baseUrl: "https://chatwoot.example",
              accountId: "1",
              apiAccessToken: "token",
            }) as never,
          createChatwootClient: () => client as never,
          loadConversation: async () => ({
            id: "local-1",
            externalId: "ext-99",
          }),
          upsertMessageFromChatwoot: async () =>
            ({
              message: {
                id: "follow-1",
                workspaceId: "ws_1",
                conversationId: "local-1",
                externalId: "msg-follow",
                direction: "outgoing",
                content: "Follow-up from agent",
                contentType: "text",
                senderName: "Agent",
                private: false,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              created: true,
            }) as never,
          touchConversation: async () => undefined,
          publishChatUpdated: () => undefined,
          nudgeChatTwin: () => undefined,
        },
      );

      assert.equal(follow.content, "Follow-up from agent");
      // Open-window create sends the first body via Chatwoot; WhatsApp template
      // cold-start may only createConversation, then follow-up createMessage.
      const expectedSends =
        spec.channel === "whatsapp" && spec.template ? 1 : 2;
      assert.equal(calls.createMessage, expectedSends);
      assert.ok(
        calls.createMessage >= 1,
        "follow-up must call Chatwoot createMessage",
      );
    });
  }

  it("email: start thread then follow-up send with mocked AgentMail", async () => {
    let composeCalls = 0;
    let sendCalls = 0;
    const { startEmailThread } = await import(
      "../services/agentmail-settings/send-lifecycle.js"
    );

    const first = await startEmailThread(
      "ws_1",
      {
        inboxId: "inbox_1",
        to: "jan@example.com",
        subject: "Hello",
        body: "First message",
      },
      {
        getStoredCredentials: async () => ({
          apiKey: "am",
          inboxId: "inbox_1",
          inboxIds: ["inbox_1"],
        }),
        listKnownInboxIds: async () => ["inbox_1"],
        composeDraft: async () => {
          composeCalls += 1;
          return {
            draftId: "draft-1",
            inboxId: "inbox_1",
            composeSessionId: "s1",
          };
        },
        sendDraft: async () => {
          sendCalls += 1;
          return {
            inboxId: "inbox_1",
            messageId: "msg-1",
            threadId: "thread-1",
            subject: "Hello",
          };
        },
        loadContactId: async () => "c1",
        patchThread: async () => null,
      },
    );
    assert.equal((first as { messageId?: string }).messageId, "msg-1");

    const follow = await startEmailThread(
      "ws_1",
      {
        inboxId: "inbox_1",
        to: "jan@example.com",
        subject: "Re: Hello",
        body: "Follow-up",
      },
      {
        getStoredCredentials: async () => ({
          apiKey: "am",
          inboxId: "inbox_1",
          inboxIds: ["inbox_1"],
        }),
        listKnownInboxIds: async () => ["inbox_1"],
        composeDraft: async () => {
          composeCalls += 1;
          return {
            draftId: "draft-2",
            inboxId: "inbox_1",
            composeSessionId: "s2",
          };
        },
        sendDraft: async () => {
          sendCalls += 1;
          return {
            inboxId: "inbox_1",
            messageId: "msg-2",
            threadId: "thread-1",
            subject: "Re: Hello",
          };
        },
        loadContactId: async () => "c1",
        patchThread: async () => null,
      },
    );
    assert.equal((follow as { messageId?: string }).messageId, "msg-2");
    assert.equal(composeCalls, 2);
    assert.equal(sendCalls, 2);
  });
});
