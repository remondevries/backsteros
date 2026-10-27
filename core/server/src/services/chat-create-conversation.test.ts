import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ChatwootApiError } from "../lib/chatwoot-client.js";
import {
  createChatConversation,
  ensureChatwootContact,
  isIgnorableContactInboxDuplicate,
  numericChannelSourceId,
  pickExactSupportContact,
  pickExactWhatsAppContact,
  type CreateChatConversationDeps,
} from "./chat-create-conversation.js";

function errCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  return (error as { code?: string }).code;
}

function contact(overrides: {
  id?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  phones?: { number: string }[] | null;
  facebookMessengerId?: string | null;
} = {}) {
  return {
    id: overrides.id ?? "contact-1",
    name: overrides.name ?? "Remon",
    email: overrides.email === undefined ? "remon@example.com" : overrides.email,
    phone: overrides.phone === undefined ? "+31612345678" : overrides.phone,
    phones: overrides.phones ?? null,
    socialAccounts: [{ platform: "instagram", url: "https://instagram.com/remon" }],
    facebookMessengerId: overrides.facebookMessengerId ?? null,
  };
}

function localConversation(overrides: {
  id?: string;
  externalId?: string | null;
  channelType?: string;
  inboxName?: string | null;
  contactUsername?: string | null;
  status?: string;
} = {}) {
  return {
    id: overrides.id ?? "local-1",
    workspaceId: "ws",
    externalId: overrides.externalId === undefined ? "cw-1" : overrides.externalId!,
    inboxId: "inbox-1",
    inboxName: overrides.inboxName ?? "Inbox",
    channelType: overrides.channelType ?? "Channel::Telegram",
    status: overrides.status ?? "open",
    contactName: "Remon",
    contactEmail: null,
    contactPhone: null,
    contactUsername: overrides.contactUsername ?? "7014761034",
    contactAvatarUrl: null,
    contactId: "contact-1",
    organizationId: null,
    lastMessagePreview: null,
    lastActivityAt: new Date(),
    unread: false,
    assigneeId: null,
    priority: 0,
    dueDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

describe("exact Chatwoot contact matching", () => {
  it("matches WhatsApp only on normalized phone digits", () => {
    const hits = [
      {
        id: "1",
        name: "Wrong",
        email: null,
        phone: "+31600000000",
        username: null,
        avatarUrl: null,
      },
      {
        id: "2",
        name: "Remon",
        email: null,
        phone: "+31 6 1234 5678",
        username: null,
        avatarUrl: null,
      },
    ];
    assert.equal(pickExactWhatsAppContact(hits, "31612345678")?.id, "2");
    assert.equal(pickExactWhatsAppContact(hits, "31699999999"), null);
  });

  it("does not match Support on name or partial email", () => {
    const hits = [
      {
        id: "1",
        name: "Remon",
        email: "remon@other.com",
        phone: null,
        username: null,
        avatarUrl: null,
      },
      {
        id: "2",
        name: "Someone Else",
        email: "remon@example.com",
        phone: null,
        username: null,
        avatarUrl: null,
      },
    ];
    assert.equal(
      pickExactSupportContact(hits, "remon@example.com")?.id,
      "2",
    );
    assert.equal(pickExactSupportContact(hits, "remon@"), null);
    assert.equal(pickExactSupportContact(hits, "Remon"), null);
  });

  it("rejects Instagram @handles as channel source ids", () => {
    assert.equal(numericChannelSourceId("remon"), null);
    assert.equal(numericChannelSourceId("@remon"), null);
    assert.equal(numericChannelSourceId("17841400000000000"), "17841400000000000");
  });

  it("only ignores 422 duplicate contact-inbox errors", () => {
    assert.equal(
      isIgnorableContactInboxDuplicate(
        new ChatwootApiError(422, "Source id already exists"),
      ),
      true,
    );
    assert.equal(
      isIgnorableContactInboxDuplicate(
        new ChatwootApiError(400, "bad request"),
      ),
      false,
    );
    assert.equal(
      isIgnorableContactInboxDuplicate(
        new ChatwootApiError(404, "not found"),
      ),
      false,
    );
  });
});

describe("ensureChatwootContact", () => {
  it("creates a new WhatsApp contact when phone search has only a name collision", async () => {
    const created: string[] = [];
    const result = await ensureChatwootContact({
      channel: "whatsapp",
      contact: contact({ phone: "+31612345678" }),
      inboxId: "wa-inbox",
      sourceId: "31612345678",
      existing: null,
      client: {
        searchContacts: async () => [
          {
            id: "other",
            name: "Remon",
            email: null,
            phone: "+31600000000",
            username: null,
            avatarUrl: null,
          },
        ],
        createContact: async () => {
          created.push("yes");
          return {
            id: "new-cw",
            name: "Remon",
            email: null,
            phone: "+31612345678",
            username: null,
            avatarUrl: null,
          };
        },
        getContactInboxes: async () => [],
        createContactInbox: async () => ({
          sourceId: "31612345678",
          inboxId: "wa-inbox",
          channelType: "Channel::Whatsapp",
        }),
        getConversation: async () => null,
      },
    });
    assert.equal(result.chatwootContactId, "new-cw");
    assert.deepEqual(created, ["yes"]);
  });

  it("does not match Support on partial email and creates instead", async () => {
    const created: string[] = [];
    const result = await ensureChatwootContact({
      channel: "support",
      contact: contact({ email: "remon@example.com" }),
      inboxId: "email-inbox",
      sourceId: "remon@example.com",
      existing: null,
      client: {
        searchContacts: async () => [
          {
            id: "partial",
            name: "Remon",
            email: "remon@example.org",
            phone: null,
            username: null,
            avatarUrl: null,
          },
        ],
        createContact: async () => {
          created.push("yes");
          return {
            id: "new-support",
            name: "Remon",
            email: "remon@example.com",
            phone: null,
            username: null,
            avatarUrl: null,
          };
        },
        getContactInboxes: async () => [],
        createContactInbox: async () => ({
          sourceId: "remon@example.com",
          inboxId: "email-inbox",
          channelType: "Channel::Email",
        }),
        getConversation: async () => null,
      },
    });
    assert.equal(result.chatwootContactId, "new-support");
    assert.deepEqual(created, ["yes"]);
  });

  it("refuses Telegram without an existing externalId (no search)", async () => {
    let searched = false;
    await assert.rejects(
      () =>
        ensureChatwootContact({
          channel: "telegram",
          contact: contact(),
          inboxId: "tg-inbox",
          sourceId: null,
          existing: { ...localConversation(), externalId: "" },
          client: {
            searchContacts: async () => {
              searched = true;
              return [];
            },
            createContact: async () => {
              throw new Error("should not create");
            },
            getContactInboxes: async () => [],
            createContactInbox: async () => ({
              sourceId: null,
              inboxId: null,
              channelType: null,
            }),
            getConversation: async () => null,
          },
        }),
      (error: unknown) => errCode(error) === "telegram_chat_required",
    );
    assert.equal(searched, false);
  });

  it("uses only the Chatwoot contact from the existing Telegram conversation", async () => {
    const result = await ensureChatwootContact({
      channel: "telegram",
      contact: contact(),
      inboxId: "tg-inbox",
      sourceId: "7014761034",
      existing: localConversation({
        externalId: "cw-tg-9",
        contactUsername: "7014761034",
      }),
      client: {
        searchContacts: async () => {
          throw new Error("must not search");
        },
        createContact: async () => {
          throw new Error("must not create");
        },
        getContactInboxes: async () => [],
        createContactInbox: async () => ({
          sourceId: null,
          inboxId: null,
          channelType: null,
        }),
        getConversation: async () => ({
          id: "cw-tg-9",
          inboxId: "tg-inbox",
          status: "open",
          channelType: "Channel::Telegram",
          contact: {
            id: "cw-contact-tg",
            name: "Remon",
            email: null,
            phone: null,
            username: "7014761034",
            avatarUrl: null,
          },
          lastActivityAt: new Date().toISOString(),
          unreadCount: 0,
          lastMessagePreview: null,
        }),
      },
    });
    assert.equal(result.chatwootContactId, "cw-contact-tg");
    assert.equal(result.sourceId, "7014761034");
  });

  it("refuses Instagram when only an @handle is available (no IGSID)", async () => {
    await assert.rejects(
      () =>
        ensureChatwootContact({
          channel: "instagram",
          contact: contact(),
          inboxId: "ig-inbox",
          sourceId: null,
          existing: localConversation({
            externalId: "cw-ig-1",
            channelType: "Channel::Instagram",
            contactUsername: "remon",
          }),
          client: {
            searchContacts: async () => [],
            createContact: async () => {
              throw new Error("must not create");
            },
            getContactInboxes: async () => [
              {
                sourceId: "remon",
                inboxId: "ig-inbox",
                channelType: "Channel::Instagram",
              },
            ],
            createContactInbox: async () => ({
              sourceId: null,
              inboxId: null,
              channelType: null,
            }),
            getConversation: async () => ({
              id: "cw-ig-1",
              inboxId: "ig-inbox",
              status: "open",
              channelType: "Channel::Instagram",
              contact: {
                id: "cw-ig-contact",
                name: "Remon",
                email: null,
                phone: null,
                username: "remon",
                avatarUrl: null,
              },
              lastActivityAt: new Date().toISOString(),
              unreadCount: 0,
              lastMessagePreview: null,
            }),
          },
        }),
      (error: unknown) => errCode(error) === "messaging_window_closed",
    );
  });

  it("rethrows non-duplicate createContactInbox 4xx", async () => {
    await assert.rejects(
      () =>
        ensureChatwootContact({
          channel: "whatsapp",
          contact: contact({ phone: "+31612345678" }),
          inboxId: "wa-inbox",
          sourceId: "31612345678",
          existing: null,
          client: {
            searchContacts: async () => [
              {
                id: "cw-wa",
                name: "Remon",
                email: null,
                phone: "+31612345678",
                username: null,
                avatarUrl: null,
              },
            ],
            createContact: async () => {
              throw new Error("must not create");
            },
            getContactInboxes: async () => [],
            createContactInbox: async () => {
              throw new ChatwootApiError(400, "invalid source id");
            },
            getConversation: async () => null,
          },
        }),
      (error: unknown) =>
        error instanceof ChatwootApiError && error.status === 400,
    );
  });
});

describe("createChatConversation", () => {
  const detail = {
    id: "local-1",
    messages: [],
  } as unknown as Awaited<
    ReturnType<CreateChatConversationDeps["getChatConversation"]>
  >;

  function baseDeps(
    overrides: Partial<CreateChatConversationDeps> & {
      local?: ReturnType<typeof localConversation> | null;
      lastIncomingAt?: string | null;
      client?: Record<string, unknown>;
    } = {},
  ): CreateChatConversationDeps {
    const local = overrides.local === undefined ? null : overrides.local;
    const client = {
      listInboxes: async () => [
        {
          id: "inbox-1",
          name: "WhatsApp",
          channelType: "Channel::Whatsapp",
        },
        {
          id: "tg-inbox",
          name: "Telegram",
          channelType: "Channel::Telegram",
        },
        {
          id: "ig-inbox",
          name: "Instagram",
          channelType: "Channel::Instagram",
        },
        {
          id: "fb-inbox",
          name: "Messenger",
          channelType: "Channel::FacebookPage",
        },
        {
          id: "email-inbox",
          name: "Support",
          channelType: "Channel::Email",
        },
      ],
      searchContacts: async () => [],
      createContact: async () => ({
        id: "cw-new",
        name: "Remon",
        email: "remon@example.com",
        phone: "+31612345678",
        username: null,
        avatarUrl: null,
      }),
      getContactInboxes: async () => [],
      createContactInbox: async () => ({
        sourceId: "31612345678",
        inboxId: "inbox-1",
        channelType: "Channel::Whatsapp",
      }),
      getConversation: async () => null,
      createConversation: async () => ({ id: "cw-new-convo", inboxId: "inbox-1" }),
      createMessage: async () => ({
        id: "m1",
        conversationId: "cw-1",
        content: "hi",
        contentType: "text",
        messageType: "outgoing" as const,
        private: false,
        senderName: "Agent",
        createdAt: new Date().toISOString(),
      }),
      toggleConversationStatus: async () => {},
      listMessages: async () => [],
      listMessageTemplates: async () => [],
      ...overrides.client,
    };

    return {
      loadContact: async () => contact(),
      findLocalChannelConversation: async () => local,
      lastIncomingAtForConversation: async () =>
        overrides.lastIncomingAt === undefined
          ? null
          : overrides.lastIncomingAt,
      listChannelInboxes: async (_ws, channel) => {
        const inboxes = await client.listInboxes();
        const mapped = inboxes.map((inbox) => ({
          id: inbox.id,
          name: inbox.name,
          channelType: inbox.channelType,
          channel:
            inbox.channelType.includes("Whatsapp")
              ? ("whatsapp" as const)
              : inbox.channelType.includes("Telegram")
                ? ("telegram" as const)
                : inbox.channelType.includes("Instagram")
                  ? ("instagram" as const)
                  : inbox.channelType.includes("Facebook")
                    ? ("messenger" as const)
                    : ("support" as const),
        }));
        return {
          inboxes: channel
            ? mapped.filter((inbox) => inbox.channel === channel)
            : mapped,
        };
      },
      getChatwootCredentials: async () =>
        ({
          baseUrl: "https://chatwoot.example",
          accountId: "1",
          apiAccessToken: "token",
        }) as never,
      createChatwootClient: () => client as never,
      upsertConversationFromChatwoot: async () =>
        ({
          conversation: { id: "local-1" },
        }) as never,
      upsertMessageFromChatwoot: async () => undefined as never,
      getChatConversation: async () => detail,
      publishChatUpdated: () => {},
      notifyPeerOfEntityWrite: () => {},
      linkConversationContact: async () => {},
      ...overrides,
    };
  }

  it("requires a WhatsApp template outside the 24h window", async () => {
    await assert.rejects(
      () =>
        createChatConversation(
          "ws",
          {
            channel: "whatsapp",
            contactId: "contact-1",
            content: "hello",
          },
          baseDeps({
            lastIncomingAt: "2020-01-01T00:00:00.000Z",
            local: localConversation({
              channelType: "Channel::Whatsapp",
              contactUsername: "31612345678",
            }),
          }),
        ),
      (error: unknown) => errCode(error) === "template_required",
    );
  });

  it("blocks Instagram when the messaging window is closed", async () => {
    await assert.rejects(
      () =>
        createChatConversation(
          "ws",
          {
            channel: "instagram",
            contactId: "contact-1",
            content: "hello",
          },
          baseDeps({
            lastIncomingAt: "2020-01-01T00:00:00.000Z",
            local: localConversation({
              channelType: "Channel::Instagram",
              contactUsername: "17841400000000000",
            }),
          }),
        ),
      (error: unknown) => errCode(error) === "messaging_window_closed",
    );
  });

  it("blocks Messenger when the messaging window is closed", async () => {
    await assert.rejects(
      () =>
        createChatConversation(
          "ws",
          {
            channel: "messenger",
            contactId: "contact-1",
            content: "hello",
          },
          baseDeps({
            lastIncomingAt: "2020-01-01T00:00:00.000Z",
            local: localConversation({
              channelType: "Channel::FacebookPage",
              contactUsername: "5232323873480533",
            }),
          }),
        ),
      (error: unknown) => errCode(error) === "messaging_window_closed",
    );
  });

  it("refuses Telegram without an existing thread", async () => {
    await assert.rejects(
      () =>
        createChatConversation(
          "ws",
          {
            channel: "telegram",
            contactId: "contact-1",
            content: "hello",
          },
          baseDeps({ local: null }),
        ),
      (error: unknown) => errCode(error) === "telegram_chat_required",
    );
  });

  it("requires a subject for Support tickets", async () => {
    await assert.rejects(
      () =>
        createChatConversation(
          "ws",
          {
            channel: "support",
            contactId: "contact-1",
            content: "Need help",
          },
          baseDeps({}),
        ),
      (error: unknown) => errCode(error) === "subject_required",
    );
  });

  it("reuses an existing Telegram thread instead of fresh create", async () => {
    let created = false;
    let messaged = false;
    const result = await createChatConversation(
      "ws",
      {
        channel: "telegram",
        contactId: "contact-1",
        content: "hello again",
      },
      baseDeps({
        local: localConversation({
          externalId: "cw-tg-1",
          channelType: "Channel::Telegram",
          contactUsername: "7014761034",
        }),
        lastIncomingAt: new Date().toISOString(),
        client: {
          getConversation: async () => ({
            id: "cw-tg-1",
            inboxId: "tg-inbox",
            status: "open",
            channelType: "Channel::Telegram",
            contact: {
              id: "cw-tg-contact",
              name: "Remon",
              email: null,
              phone: null,
              username: "7014761034",
              avatarUrl: null,
            },
            lastActivityAt: new Date().toISOString(),
            unreadCount: 0,
            lastMessagePreview: null,
          }),
          createConversation: async () => {
            created = true;
            return { id: "should-not", inboxId: "tg-inbox" };
          },
          createMessage: async () => {
            messaged = true;
            return {
              id: "m1",
              conversationId: "cw-tg-1",
              content: "hello again",
              contentType: "text",
              messageType: "outgoing" as const,
              private: false,
              senderName: "Agent",
              createdAt: new Date().toISOString(),
            };
          },
        },
      }),
    );
    assert.equal(result.id, "local-1");
    assert.equal(created, false);
    assert.equal(messaged, true);
  });

  it("fresh-creates WhatsApp with a template when outside the window", async () => {
    let created = false;
    const result = await createChatConversation(
      "ws",
      {
        channel: "whatsapp",
        contactId: "contact-1",
        content: "Hello from template",
        template: {
          name: "hello_world",
          category: "UTILITY",
          language: "en",
        },
      },
      baseDeps({
        lastIncomingAt: "2020-01-01T00:00:00.000Z",
        local: null,
        client: {
          searchContacts: async () => [
            {
              id: "cw-wa",
              name: "Remon",
              email: null,
              phone: "+31612345678",
              username: null,
              avatarUrl: null,
            },
          ],
          createConversation: async (input: {
            message: { templateParams?: { name: string } };
          }) => {
            created = true;
            assert.equal(input.message.templateParams?.name, "hello_world");
            return { id: "cw-wa-new", inboxId: "inbox-1" };
          },
        },
      }),
    );
    assert.equal(result.id, "local-1");
    assert.equal(created, true);
  });
});
