import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ChatwootApiError } from "../lib/chatwoot-client.js";
import {
  createChatConversation,
  ensureChatwootContact,
  findChatwootContactForTelegramChatId,
  isIgnorableContactInboxDuplicate,
  normalizeXUserId,
  numericChannelSourceId,
  pickExactSupportContact,
  pickExactWhatsAppContact,
  pickExactXContact,
  pickInboxXConversation,
  telegramUsernameFromSocialAccounts,
  type CreateChatConversationDeps,
} from "./chat-create-conversation.js";
import { X_LEMO_DESIGN_INBOX_ID } from "../lib/chat-messaging-window.js";

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
  telegramChatId?: string | null;
  xUserId?: string | null;
} = {}) {
  return {
    id: overrides.id ?? "contact-1",
    name: overrides.name ?? "Remon",
    email: overrides.email === undefined ? "remon@example.com" : overrides.email,
    phone: overrides.phone === undefined ? "+31612345678" : overrides.phone,
    phones: overrides.phones ?? null,
    socialAccounts: [{ platform: "instagram", url: "https://instagram.com/remon" }],
    facebookMessengerId: overrides.facebookMessengerId ?? null,
    telegramChatId: overrides.telegramChatId ?? null,
    xUserId: overrides.xUserId === undefined ? null : overrides.xUserId,
  };
}

function localConversation(overrides: {
  id?: string;
  externalId?: string | null;
  inboxId?: string;
  channelType?: string;
  inboxName?: string | null;
  contactUsername?: string | null;
  status?: string;
} = {}) {
  return {
    id: overrides.id ?? "local-1",
    workspaceId: "ws",
    externalId: overrides.externalId === undefined ? "cw-1" : overrides.externalId!,
    inboxId: overrides.inboxId ?? "inbox-1",
    inboxName: overrides.inboxName ?? "Inbox",
    channelType: overrides.channelType ?? "Channel::Telegram",
    status: overrides.status ?? "open",
    contactName: "Remon",
    contactEmail: null,
    contactPhone: null,
    contactUsername:
      overrides.contactUsername === undefined
        ? "7014761034"
        : overrides.contactUsername,
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
        identifier: null,
        avatarUrl: null,
      },
      {
        id: "2",
        name: "Remon",
        email: null,
        phone: "+31 6 1234 5678",
        username: null,
        identifier: null,
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
        identifier: null,
        avatarUrl: null,
      },
      {
        id: "2",
        name: "Someone Else",
        email: "remon@example.com",
        phone: null,
        username: null,
        identifier: null,
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

  it("rejects X @handles and matches only numeric identifier", () => {
    assert.equal(normalizeXUserId("@remondevries"), null);
    assert.equal(normalizeXUserId("remondevries"), null);
    assert.equal(normalizeXUserId("50254162"), "50254162");
    const hits = [
      {
        id: "handle-hit",
        name: "Remon",
        email: null,
        phone: null,
        username: "remondevries",
        identifier: null,
        avatarUrl: null,
      },
      {
        id: "exact",
        name: "Remon",
        email: null,
        phone: null,
        username: "remondevries",
        identifier: "50254162",
        avatarUrl: null,
      },
      {
        id: "by-attr",
        name: "Remon",
        email: null,
        phone: null,
        username: "remondevries",
        identifier: null,
        customAttributes: { x_user_id: "50254162" },
        avatarUrl: null,
      },
    ];
    assert.equal(pickExactXContact(hits, "50254162")?.id, "exact");
    assert.equal(
      pickExactXContact(
        hits.filter((hit) => hit.id !== "exact"),
        "50254162",
      )?.id,
      "by-attr",
    );
    assert.equal(pickExactXContact(hits, "@remondevries"), null);
  });

  it("requires exact x_user_id on inbox conversations (no inbox-only fallback)", () => {
    const otherUser = {
      id: "99",
      inboxId: X_LEMO_DESIGN_INBOX_ID,
      status: "open",
      channelType: "Channel::Api",
      contact: {
        id: "cw-other",
        name: "Other",
        email: null,
        phone: null,
        username: "someoneelse",
        identifier: "11111111",
        customAttributes: { x_user_id: "11111111" },
        avatarUrl: null,
      },
      additionalAttributes: { x_user_id: "11111111" },
      customAttributes: { x_user_id: "11111111" },
      xUserId: "11111111",
      lastActivityAt: new Date().toISOString(),
      unreadCount: 0,
      lastMessagePreview: null,
    };
    assert.equal(
      pickInboxXConversation([otherUser], X_LEMO_DESIGN_INBOX_ID, "50254162"),
      null,
    );
    const match = {
      ...otherUser,
      id: "17",
      contact: {
        ...otherUser.contact,
        id: "cw-x-existing",
        identifier: null,
        customAttributes: { x_user_id: "50254162" },
        xUserId: "50254162",
      },
      additionalAttributes: { x_user_id: "50254162" },
      customAttributes: { x_user_id: "50254162" },
      xUserId: "50254162",
    };
    assert.equal(
      pickInboxXConversation(
        [otherUser, match],
        X_LEMO_DESIGN_INBOX_ID,
        "50254162",
      )?.id,
      "17",
    );
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
            identifier: null,
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
            identifier: null,
            avatarUrl: null,
          };
        },
        updateContact: async () => ({
          id: "stub",
          name: null,
          email: null,
          phone: null,
          username: null,
          identifier: null,
          avatarUrl: null,
        }),
        listContactConversations: async () => [],
        getContactInboxes: async () => [],
        createContactInbox: async () => ({
          sourceId: "31612345678",
          inboxId: "wa-inbox",
          channelType: "Channel::Whatsapp",
        }),
        filterContactsByCustomAttribute: async () => [],
        filterConversationsByAttribute: async () => [],
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
            identifier: null,
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
            identifier: null,
            avatarUrl: null,
          };
        },
        updateContact: async () => ({
          id: "stub",
          name: null,
          email: null,
          phone: null,
          username: null,
          identifier: null,
          avatarUrl: null,
        }),
        listContactConversations: async () => [],
        getContactInboxes: async () => [],
        createContactInbox: async () => ({
          sourceId: "remon@example.com",
          inboxId: "email-inbox",
          channelType: "Channel::Email",
        }),
        filterContactsByCustomAttribute: async () => [],
        filterConversationsByAttribute: async () => [],
        getConversation: async () => null,
      },
    });
    assert.equal(result.chatwootContactId, "new-support");
    assert.deepEqual(created, ["yes"]);
  });

  it("refuses Telegram without a known chat_id", async () => {
    let searched = false;
    await assert.rejects(
      () =>
        ensureChatwootContact({
          channel: "telegram",
          contact: contact(),
          inboxId: "tg-inbox",
          sourceId: null,
          existing: localConversation({
            externalId: "",
            contactUsername: null,
          }),
          client: {
            searchContacts: async () => {
              searched = true;
              return [];
            },
            createContact: async () => {
              throw new Error("should not create");
            },
            updateContact: async () => ({
              id: "stub",
              name: null,
              email: null,
              phone: null,
              username: null,
              identifier: null,
              avatarUrl: null,
            }),
            listContactConversations: async () => [],
            getContactInboxes: async () => [],
            createContactInbox: async () => ({
              sourceId: null,
              inboxId: null,
              channelType: null,
            }),
            filterContactsByCustomAttribute: async () => [],
            filterConversationsByAttribute: async () => [],
            getConversation: async () => null,
          },
        }),
      (error: unknown) =>
        errCode(error) === "telegram_chat_unknown" &&
        (error as { message?: string }).message ===
          "contact has never messaged the bot",
    );
    assert.equal(searched, false);
  });

  it("creates Telegram Chatwoot contact from stored chat_id without local thread", async () => {
    let createdInbox = false;
    let createdBody: { phone?: string | null; email?: string | null } = {};
    const result = await ensureChatwootContact({
      channel: "telegram",
      contact: contact({
        telegramChatId: "7014761034",
        phone: "+31 (0)6 461 96 570",
      }),
      inboxId: "tg-inbox",
      sourceId: "7014761034",
      existing: null as never,
      client: {
        searchContacts: async () => [],
        listConversations: async () => [],
        createContact: async (input) => {
          createdBody = { phone: input.phone ?? null, email: input.email ?? null };
          return {
            id: "cw-new-tg",
            name: "Remon",
            email: null,
            phone: null,
            username: null,
            identifier: "7014761034",
            telegramChatId: "7014761034",
            avatarUrl: null,
          };
        },
        updateContact: async () => ({
          id: "stub",
          name: null,
          email: null,
          phone: null,
          username: null,
          identifier: null,
          avatarUrl: null,
        }),
        listContactConversations: async () => [],
        getContactInboxes: async () => [],
        createContactInbox: async (input) => {
          createdInbox = true;
          assert.equal(input.sourceId, "7014761034");
          return {
            sourceId: input.sourceId,
            inboxId: input.inboxId,
            channelType: "Channel::Telegram",
          };
        },
        filterContactsByCustomAttribute: async () => [],
        filterConversationsByAttribute: async () => [],
        getConversation: async () => null,
      },
    });
    assert.equal(result.chatwootContactId, "cw-new-tg");
    assert.equal(result.sourceId, "7014761034");
    assert.equal(createdInbox, true);
    // Never send phone/email — they collide with other Chatwoot contacts.
    assert.equal(createdBody.phone, null);
    assert.equal(createdBody.email, null);
  });

  it("reuses Chatwoot contact that owns telegram contact_inbox source_id (not attribute collisions)", async () => {
    const result = await ensureChatwootContact({
      channel: "telegram",
      contact: contact({
        telegramChatId: "7014761034",
        phone: "+31 (0)6 461 96 570",
      }),
      inboxId: "4",
      sourceId: "7014761034",
      existing: null as never,
      client: {
        searchContacts: async () => [
          {
            id: "8",
            name: "Rayon",
            email: null,
            phone: null,
            username: "rayonnl6",
            identifier: null,
            telegramChatId: "7014761034",
            avatarUrl: null,
          },
          {
            id: "9",
            name: "Remon de Vries",
            email: null,
            phone: null,
            username: "remondevries",
            identifier: null,
            telegramChatId: "7014761034",
            avatarUrl: null,
          },
        ],
        listConversations: async () => [],
        createContact: async () => {
          throw new Error("must not create — contact_inbox already exists");
        },
        updateContact: async () => ({
          id: "stub",
          name: null,
          email: null,
          phone: null,
          username: null,
          identifier: null,
          avatarUrl: null,
        }),
        listContactConversations: async () => [],
        getContactInboxes: async (contactId) => {
          if (contactId === "9") {
            return [
              {
                sourceId: "7014761034",
                inboxId: "4",
                channelType: "Channel::Telegram",
              },
            ];
          }
          return [];
        },
        createContactInbox: async () => {
          throw new Error("must not create inbox");
        },
        filterContactsByCustomAttribute: async () => [],
        filterConversationsByAttribute: async () => [],
        getConversation: async () => null,
      },
    });
    assert.equal(result.chatwootContactId, "9");
    assert.equal(result.sourceId, "7014761034");
  });

  it("findChatwootContactForTelegramChatId prefers inbox source_id owner", async () => {
    const found = await findChatwootContactForTelegramChatId(
      {
        searchContacts: async () => [
          {
            id: "8",
            name: "Rayon",
            email: null,
            phone: null,
            username: "rayonnl6",
            identifier: null,
            telegramChatId: "7014761034",
            avatarUrl: null,
          },
          {
            id: "9",
            name: "Remon",
            email: null,
            phone: null,
            username: "remondevries",
            identifier: null,
            telegramChatId: "7014761034",
            avatarUrl: null,
          },
        ],
        listConversations: async () => [],
        getContactInboxes: async (id) =>
          id === "9"
            ? [
                {
                  sourceId: "7014761034",
                  inboxId: "4",
                  channelType: "Channel::Telegram",
                },
              ]
            : [],
      },
      "7014761034",
      "4",
      "remondevries",
    );
    assert.equal(found?.id, "9");
    assert.equal(
      telegramUsernameFromSocialAccounts([
        { platform: "Telegram", url: "https://t.me/remondevries" },
      ]),
      "remondevries",
    );
  });

  it("finds Telegram contact via inbox conversation chat_id when search misses", async () => {
    const found = await findChatwootContactForTelegramChatId(
      {
        // Live Chatwoot SearchService: chat id → []; @handle → wrong contacts 2/14
        searchContacts: async (q) => {
          if (q === "remondevries") {
            return [
              {
                id: "2",
                name: "Brandon Small",
                email: "hello@remondevries.com",
                phone: null,
                username: null,
                identifier: null,
                avatarUrl: null,
              },
              {
                id: "14",
                name: "Remon de Vries (@remondevries)",
                email: null,
                phone: null,
                username: null,
                identifier: "50254162",
                avatarUrl: null,
              },
            ];
          }
          return [];
        },
        getContactInboxes: async (id) => {
          if (id === "9") {
            return [
              {
                sourceId: "7014761034",
                inboxId: "4",
                channelType: "Channel::Telegram",
              },
            ];
          }
          return [
            {
              sourceId: "other",
              inboxId: "1",
              channelType: "Channel::WebWidget",
            },
          ];
        },
        listConversations: async ({ status } = {}) => {
          if (status !== "open") return [];
          return [
            {
              id: "12",
              inboxId: "4",
              status: "open",
              channelType: "Channel::Telegram",
              contact: {
                id: "9",
                name: "Remon de Vries",
                email: null,
                phone: null,
                username: "remondevries",
                identifier: null,
                avatarUrl: null,
              },
              additionalAttributes: { chat_id: 7014761034 },
              lastActivityAt: new Date().toISOString(),
              unreadCount: 0,
              lastMessagePreview: null,
            },
          ];
        },
      },
      "7014761034",
      "4",
      "remondevries",
    );
    assert.equal(found?.id, "9");
    assert.equal(found?.telegramChatId, "7014761034");
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
        updateContact: async () => ({
          id: "stub",
          name: null,
          email: null,
          phone: null,
          username: null,
          identifier: null,
          avatarUrl: null,
        }),
        listContactConversations: async () => [],
        getContactInboxes: async () => [],
        createContactInbox: async () => ({
          sourceId: null,
          inboxId: null,
          channelType: null,
        }),
        filterContactsByCustomAttribute: async () => [],
        filterConversationsByAttribute: async () => [],
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
            identifier: null,
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

  it("falls back to Chatwoot contact_inbox source_id when telegram_chat_id empty and username is @handle", async () => {
    const result = await ensureChatwootContact({
      channel: "telegram",
      contact: contact({ telegramChatId: null }),
      inboxId: "4",
      sourceId: null,
      existing: localConversation({
        externalId: "12",
        inboxId: "4",
        contactUsername: "remondevries",
      }),
      client: {
        searchContacts: async () => {
          throw new Error("must not search");
        },
        createContact: async () => {
          throw new Error("must not create");
        },
        updateContact: async () => ({
          id: "stub",
          name: null,
          email: null,
          phone: null,
          username: null,
          identifier: null,
          avatarUrl: null,
        }),
        listContactConversations: async () => [],
        getContactInboxes: async () => [
          {
            sourceId: "7014761034",
            inboxId: "4",
            channelType: "Channel::Telegram",
          },
        ],
        createContactInbox: async () => ({
          sourceId: null,
          inboxId: null,
          channelType: null,
        }),
        filterContactsByCustomAttribute: async () => [],
        filterConversationsByAttribute: async () => [],
        getConversation: async () => ({
          id: "12",
          inboxId: "4",
          status: "open",
          channelType: "Channel::Telegram",
          contact: {
            id: "9",
            name: "Remon de Vries",
            email: null,
            phone: null,
            username: "remondevries",
            identifier: null,
            telegramChatId: null,
            avatarUrl: null,
          },
          lastActivityAt: new Date().toISOString(),
          unreadCount: 0,
          lastMessagePreview: null,
        }),
      },
    });
    assert.equal(result.chatwootContactId, "9");
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
            updateContact: async () => ({
              id: "stub",
              name: null,
              email: null,
              phone: null,
              username: null,
              identifier: null,
              avatarUrl: null,
            }),
            listContactConversations: async () => [],
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
            filterContactsByCustomAttribute: async () => [],
            filterConversationsByAttribute: async () => [],
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
                identifier: null,
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
                identifier: null,
                avatarUrl: null,
              },
            ],
            createContact: async () => {
              throw new Error("must not create");
            },
            updateContact: async () => ({
          id: "stub",
          name: null,
          email: null,
          phone: null,
          username: null,
          identifier: null,
          avatarUrl: null,
        }),
        listContactConversations: async () => [],
        getContactInboxes: async () => [],
            createContactInbox: async () => {
              throw new ChatwootApiError(400, "invalid source id");
            },
            filterContactsByCustomAttribute: async () => [],
            filterConversationsByAttribute: async () => [],
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
        {
          id: X_LEMO_DESIGN_INBOX_ID,
          name: "Lemo-Design X (@lemodesign)",
          channelType: "Channel::Api",
        },
      ],
      searchContacts: async () => [],
      filterContactsByCustomAttribute: async () => [],
      filterConversationsByAttribute: async () => [],
      createContact: async () => ({
        id: "cw-new",
        name: "Remon",
        email: "remon@example.com",
        phone: "+31612345678",
        username: null,
        identifier: null,
        avatarUrl: null,
      }),
      updateContact: async () => ({
        id: "cw-new",
        name: "Remon",
        email: null,
        phone: null,
        username: null,
        identifier: null,
        avatarUrl: null,
      }),
      getContactInboxes: async () => [],
      listConversations: async () => [],
      listContactConversations: async () => [],
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
                    : inbox.id === X_LEMO_DESIGN_INBOX_ID ||
                        inbox.name.toLowerCase().includes("lemodesign")
                      ? ("x" as const)
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

  it("refuses Telegram without a known chat_id (422 telegram_chat_unknown)", async () => {
    await assert.rejects(
      () =>
        createChatConversation(
          "ws",
          {
            channel: "telegram",
            contactId: "contact-1",
            content: "hello",
          },
          baseDeps({
            local: null,
            loadContact: async () => contact(),
          }),
        ),
      (error: unknown) =>
        errCode(error) === "telegram_chat_unknown" &&
        (error as { status?: number }).status === 422 &&
        (error as { message?: string }).message ===
          "contact has never messaged the bot",
    );
  });

  it("dry-run Telegram falls back to Chatwoot contact_inbox source_id when telegram_chat_id empty", async () => {
    const result = await createChatConversation(
      "ws",
      {
        channel: "telegram",
        contactId: "contact-1",
        content: "hello",
        dryRun: true,
        inboxId: "4",
      },
      baseDeps({
        local: localConversation({
          id: "kO6jTg7TtVQdPXWLg2N2z",
          externalId: "12",
          inboxId: "4",
          contactUsername: "remondevries",
        }),
        lastIncomingAt: new Date().toISOString(),
        loadContact: async () => contact({ telegramChatId: null }),
        client: {
          getConversation: async () => ({
            id: "12",
            inboxId: "4",
            status: "open",
            channelType: "Channel::Telegram",
            contact: {
              id: "9",
              name: "Remon",
              email: null,
              phone: null,
              username: "remondevries",
              identifier: null,
              telegramChatId: null,
              avatarUrl: null,
            },
            lastActivityAt: new Date().toISOString(),
            unreadCount: 0,
            lastMessagePreview: null,
          }),
          getContactInboxes: async () => [
            {
              sourceId: "7014761034",
              inboxId: "4",
              channelType: "Channel::Telegram",
            },
          ],
          listInboxes: async () => [
            {
              id: "4",
              name: "Telegram",
              channelType: "Channel::Telegram",
            },
          ],
        },
      }),
    );
    assert.equal("dryRun" in result && result.dryRun, true);
    if (!("dryRun" in result) || !result.dryRun) {
      throw new Error("expected dry-run result");
    }
    assert.equal(result.sourceId, "7014761034");
    assert.equal(result.window.open, true);
    assert.equal(result.window.sourceId, "7014761034");
  });

  it("live OS-146: search misses contact 9, finds via chat_id, never POST /contacts (phone taken)", async () => {
    let createdContact = false;
    let messaged = false;
    const result = await createChatConversation(
      "ws",
      {
        channel: "telegram",
        contactId: "9c36dc9c-6e9e-4f21-a602-4f7291231e60",
        content: "fresh telegram after delete",
        inboxId: "4",
      },
      baseDeps({
        local: null,
        loadContact: async () =>
          contact({
            id: "9c36dc9c-6e9e-4f21-a602-4f7291231e60",
            telegramChatId: "7014761034",
            phone: "+31 (0)6 461 96 570",
            email: "email@remondevries.com",
          }),
        client: {
          listInboxes: async () => [
            {
              id: "4",
              name: "Telegram",
              channelType: "Channel::Telegram",
            },
          ],
          // Exact live Chatwoot SearchService behaviour
          searchContacts: async (q) => {
            if (q === "7014761034") return [];
            if (q === "remondevries") {
              return [
                {
                  id: "2",
                  name: "Brandon Small",
                  email: "hello@remondevries.com",
                  phone: null,
                  username: null,
                  identifier: null,
                  avatarUrl: null,
                },
                {
                  id: "14",
                  name: "Remon de Vries (@remondevries)",
                  email: null,
                  phone: null,
                  username: null,
                  identifier: "50254162",
                  avatarUrl: null,
                },
              ];
            }
            return [];
          },
          getContactInboxes: async (id) => {
            if (id === "9") {
              return [
                {
                  sourceId: "7014761034",
                  inboxId: "4",
                  channelType: "Channel::Telegram",
                },
              ];
            }
            return [];
          },
          listConversations: async ({ status } = {}) => {
            if (status !== "open") return [];
            return [
              {
                id: "12",
                inboxId: "4",
                status: "open",
                channelType: "Channel::Telegram",
                contact: {
                  id: "9",
                  name: "Remon de Vries",
                  email: null,
                  phone: null,
                  username: "remondevries",
                  identifier: null,
                  avatarUrl: null,
                },
                additionalAttributes: { chat_id: 7014761034 },
                lastActivityAt: new Date().toISOString(),
                unreadCount: 0,
                lastMessagePreview: null,
              },
            ];
          },
          createContact: async () => {
            createdContact = true;
            throw new ChatwootApiError(
              422,
              JSON.stringify({
                message: "Phone number has already been taken",
              }),
              "Phone number has already been taken",
            );
          },
          listContactConversations: async (contactId) => {
            assert.equal(contactId, "9");
            return [
              {
                id: "12",
                inboxId: "4",
                status: "open",
                channelType: "Channel::Telegram",
                contact: {
                  id: "9",
                  name: "Remon de Vries",
                  email: null,
                  phone: null,
                  username: "remondevries",
                  identifier: null,
                  avatarUrl: null,
                },
                lastActivityAt: new Date().toISOString(),
                unreadCount: 0,
                lastMessagePreview: null,
              },
            ];
          },
          createConversation: async () => {
            throw new Error("must reuse conversation 12, not create");
          },
          createMessage: async (conversationId, input) => {
            messaged = true;
            assert.equal(conversationId, "12");
            assert.equal(input.content, "fresh telegram after delete");
            return {
              id: "m-out",
              conversationId: "12",
              content: input.content,
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
    assert.equal(createdContact, false);
    assert.equal(messaged, true);
    assert.equal(result.id, "local-1");
  });

  it("on Chatwoot identifier already taken, falls back to conversation chat_id reuse", async () => {
    let createdContact = false;
    const result = await ensureChatwootContact({
      channel: "telegram",
      contact: contact({
        telegramChatId: "7014761034",
        phone: "+31 (0)6 461 96 570",
      }),
      inboxId: "4",
      sourceId: "7014761034",
      existing: null as never,
      client: {
        searchContacts: async () => [],
        // First find misses (empty list); after create 422, find succeeds via chat_id
        listConversations: async () => {
          if (!createdContact) return [];
          return [
            {
              id: "12",
              inboxId: "4",
              status: "open",
              channelType: "Channel::Telegram",
              contact: {
                id: "9",
                name: "Remon",
                email: null,
                phone: null,
                username: "remondevries",
                identifier: null,
                avatarUrl: null,
              },
              additionalAttributes: { chat_id: 7014761034 },
              lastActivityAt: new Date().toISOString(),
              unreadCount: 0,
              lastMessagePreview: null,
            },
          ];
        },
        getContactInboxes: async (id) =>
          id === "9"
            ? [
                {
                  sourceId: "7014761034",
                  inboxId: "4",
                  channelType: "Channel::Telegram",
                },
              ]
            : [],
        createContact: async () => {
          createdContact = true;
          throw new ChatwootApiError(
            422,
            JSON.stringify({
              message: "Identifier has already been taken",
            }),
            "Identifier has already been taken",
          );
        },
        updateContact: async () => ({
          id: "stub",
          name: null,
          email: null,
          phone: null,
          username: null,
          identifier: null,
          avatarUrl: null,
        }),
        listContactConversations: async () => [],
        createContactInbox: async () => ({
          sourceId: null,
          inboxId: null,
          channelType: null,
        }),
        filterContactsByCustomAttribute: async () => [],
        filterConversationsByAttribute: async () => [],
        getConversation: async () => null,
      },
    });
    assert.equal(createdContact, true);
    assert.equal(result.chatwootContactId, "9");
    assert.equal(result.sourceId, "7014761034");
  });

  it("after local delete, reuses still-open Chatwoot Telegram conversation via contact_inbox owner", async () => {
    let createdConversation = false;
    let messaged = false;
    const result = await createChatConversation(
      "ws",
      {
        channel: "telegram",
        contactId: "contact-1",
        content: "hello again",
        inboxId: "4",
      },
      baseDeps({
        local: null,
        loadContact: async () =>
          contact({
            telegramChatId: "7014761034",
            phone: "+31 (0)6 461 96 570",
          }),
        client: {
          listInboxes: async () => [
            {
              id: "4",
              name: "Telegram",
              channelType: "Channel::Telegram",
            },
          ],
          searchContacts: async () => [
            {
              id: "8",
              name: "Rayon",
              email: null,
              phone: null,
              username: "rayonnl6",
              identifier: null,
              telegramChatId: "7014761034",
              avatarUrl: null,
            },
            {
              id: "9",
              name: "Remon",
              email: null,
              phone: null,
              username: "remondevries",
              identifier: null,
              telegramChatId: "7014761034",
              avatarUrl: null,
            },
          ],
          createContact: async () => {
            throw new Error("must not create contact");
          },
          getContactInboxes: async (id) =>
            id === "9"
              ? [
                  {
                    sourceId: "7014761034",
                    inboxId: "4",
                    channelType: "Channel::Telegram",
                  },
                ]
              : [],
          createContactInbox: async () => {
            throw new Error("must not create inbox");
          },
          listContactConversations: async () => [
            {
              id: "12",
              inboxId: "4",
              status: "open",
              channelType: "Channel::Telegram",
              contact: {
                id: "9",
                name: "Remon",
                email: null,
                phone: null,
                username: "remondevries",
                identifier: null,
                avatarUrl: null,
              },
              lastActivityAt: new Date().toISOString(),
              unreadCount: 0,
              lastMessagePreview: null,
            },
          ],
          createConversation: async () => {
            createdConversation = true;
            throw new Error("must reuse existing Chatwoot conversation 12");
          },
          createMessage: async (conversationId, input) => {
            messaged = true;
            assert.equal(conversationId, "12");
            assert.equal(input.content, "hello again");
            return {
              id: "m-out",
              conversationId: "12",
              content: input.content,
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
    assert.equal(createdConversation, false);
    assert.equal(messaged, true);
    assert.equal(result.id, "local-1");
  });

  it("starts Telegram from stored chat_id after local conversation was deleted", async () => {
    let created = false;
    const result = await createChatConversation(
      "ws",
      {
        channel: "telegram",
        contactId: "contact-1",
        content: "hello again",
      },
      baseDeps({
        local: null,
        loadContact: async () => contact({ telegramChatId: "7014761034" }),
        client: {
          searchContacts: async () => [],
          createContact: async (input) => {
            assert.equal(input.phone, undefined);
            assert.equal(input.email, undefined);
            assert.equal(input.identifier, "7014761034");
            return {
              id: "cw-tg",
              name: "Remon",
              email: null,
              phone: null,
              username: null,
              identifier: "7014761034",
              telegramChatId: "7014761034",
              avatarUrl: null,
            };
          },
          listConversations: async () => [],
          getContactInboxes: async () => [],
          createContactInbox: async () => ({
            sourceId: "7014761034",
            inboxId: "tg-inbox",
            channelType: "Channel::Telegram",
          }),
          listContactConversations: async () => [],
          createConversation: async (input) => {
            created = true;
            assert.equal(input.sourceId, "7014761034");
            return {
              id: "cw-new",
              inboxId: "tg-inbox",
              status: "open",
              channelType: "Channel::Telegram",
              contact: {
                id: "cw-tg",
                name: "Remon",
                email: null,
                phone: null,
                username: "7014761034",
                identifier: "7014761034",
                avatarUrl: null,
              },
            };
          },
          getConversation: async () => null,
          listMessages: async () => [],
          createMessage: async () => {
            throw new Error("should create conversation, not message");
          },
          filterContactsByCustomAttribute: async () => [],
          filterConversationsByAttribute: async () => [],
          updateContact: async () => ({
            id: "stub",
            name: null,
            email: null,
            phone: null,
            username: null,
            identifier: null,
            avatarUrl: null,
          }),
        },
      }),
    );
    assert.equal(created, true);
    assert.equal((result as { id?: string }).id, "local-1");
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
              identifier: null,
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
              identifier: null,
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

  it("reuses Chatwoot conversation 17 for X user 50254162 instead of creating a duplicate", async () => {
    let created = false;
    let messagedOn: string | null = null;
    const result = await createChatConversation(
      "ws",
      {
        channel: "x",
        contactId: "contact-1",
        content: "hello on X",
      },
      baseDeps({
        local: null,
        loadContact: async () => contact({ xUserId: "50254162" }),
        client: {
          searchContacts: async () => [
            {
              id: "cw-x-existing",
              name: "Remon",
              email: null,
              phone: null,
              username: "remondevries",
              identifier: "50254162",
              avatarUrl: null,
            },
          ],
          getContactInboxes: async () => [
            {
              sourceId: "296b329e-a434-491d-b794-df60e164b4c8",
              inboxId: X_LEMO_DESIGN_INBOX_ID,
              channelType: "Channel::Api",
            },
          ],
          listContactConversations: async () => [
            {
              id: "17",
              inboxId: X_LEMO_DESIGN_INBOX_ID,
              status: "open",
              channelType: "Channel::Api",
              contact: {
                id: "cw-x-existing",
                name: "Remon",
                email: null,
                phone: null,
                username: "remondevries",
                identifier: "50254162",
                avatarUrl: null,
              },
              lastActivityAt: new Date().toISOString(),
              unreadCount: 0,
              lastMessagePreview: null,
            },
          ],
          createConversation: async () => {
            created = true;
            return { id: "should-not", inboxId: X_LEMO_DESIGN_INBOX_ID };
          },
          createMessage: async (conversationId: string) => {
            messagedOn = conversationId;
            return {
              id: "m1",
              conversationId,
              content: "hello on X",
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
    assert.equal(messagedOn, "17");
  });

  it("fresh-creates an X conversation in inbox 8 with x_user_id attributes", async () => {
    let createdBody: Record<string, unknown> | null = null;
    const result = await createChatConversation(
      "ws",
      {
        channel: "x",
        contactId: "contact-1",
        content: "brand new X DM",
      },
      baseDeps({
        local: null,
        loadContact: async () => contact({ xUserId: "999888777" }),
        client: {
          searchContacts: async () => [],
          createContact: async (input: {
            identifier?: string | null;
            customAttributes?: Record<string, unknown>;
          }) => {
            assert.equal(input.identifier, "999888777");
            assert.equal(input.customAttributes?.x_user_id, "999888777");
            return {
              id: "cw-x-new",
              name: "Remon",
              email: null,
              phone: null,
              username: null,
              identifier: "999888777",
              avatarUrl: null,
            };
          },
          getContactInboxes: async () => [],
          createContactInbox: async (input: {
            inboxId: string;
            sourceId: string;
          }) => {
            assert.equal(input.inboxId, X_LEMO_DESIGN_INBOX_ID);
            assert.match(input.sourceId, /^[0-9a-f-]{36}$/i);
            return {
              sourceId: input.sourceId,
              inboxId: input.inboxId,
              channelType: "Channel::Api",
            };
          },
          listContactConversations: async () => [],
          createConversation: async (input: {
            inboxId: string;
            additionalAttributes?: Record<string, unknown>;
            customAttributes?: Record<string, unknown>;
          }) => {
            createdBody = input as unknown as Record<string, unknown>;
            assert.equal(input.inboxId, X_LEMO_DESIGN_INBOX_ID);
            assert.equal(input.additionalAttributes?.x_user_id, "999888777");
            assert.equal(input.customAttributes?.x_user_id, "999888777");
            return { id: "cw-x-convo", inboxId: X_LEMO_DESIGN_INBOX_ID };
          },
        },
      }),
    );
    assert.equal(result.id, "local-1");
    assert.ok(createdBody);
  });

  it("ignores non-inbox-8 conversations and fresh-creates in the X inbox", async () => {
    let createdOn: string | null = null;
    let messagedOn: string | null = null;
    const result = await createChatConversation(
      "ws",
      {
        channel: "x",
        contactId: "contact-1",
        content: "hello on X",
      },
      baseDeps({
        local: null,
        loadContact: async () => contact({ xUserId: "50254162" }),
        client: {
          searchContacts: async () => [
            {
              id: "cw-x-existing",
              name: "Remon",
              email: null,
              phone: null,
              username: "remondevries",
              identifier: "50254162",
              avatarUrl: null,
            },
          ],
          getContactInboxes: async () => [
            {
              sourceId: "296b329e-a434-491d-b794-df60e164b4c8",
              inboxId: X_LEMO_DESIGN_INBOX_ID,
              channelType: "Channel::Api",
            },
          ],
          listContactConversations: async () => [
            {
              id: "99",
              inboxId: "wa-inbox",
              status: "open",
              channelType: "Channel::Whatsapp",
              contact: {
                id: "cw-x-existing",
                name: "Remon",
                email: null,
                phone: null,
                username: null,
                identifier: "50254162",
                avatarUrl: null,
              },
              lastActivityAt: new Date().toISOString(),
              unreadCount: 0,
              lastMessagePreview: null,
            },
          ],
          createConversation: async (input: { inboxId: string }) => {
            createdOn = input.inboxId;
            return { id: "cw-x-fresh", inboxId: input.inboxId };
          },
          createMessage: async (conversationId: string) => {
            messagedOn = conversationId;
            return {
              id: "m1",
              conversationId,
              content: "hello on X",
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
    assert.equal(createdOn, X_LEMO_DESIGN_INBOX_ID);
    assert.equal(messagedOn, null);
  });

  it("reuses conv-17 contact matched by custom_attributes.x_user_id without identifier", async () => {
    let created = false;
    let messagedOn: string | null = null;
    const result = await createChatConversation(
      "ws",
      {
        channel: "x",
        contactId: "contact-1",
        content: "hello on X",
      },
      baseDeps({
        local: null,
        loadContact: async () => contact({ xUserId: "50254162" }),
        client: {
          searchContacts: async () => [],
          filterContactsByCustomAttribute: async () => [
            {
              id: "cw-x-existing",
              name: "Remon",
              email: null,
              phone: null,
              username: "remondevries",
              identifier: null,
              customAttributes: { x_user_id: "50254162" },
              xUserId: "50254162",
              avatarUrl: null,
            },
          ],
          getContactInboxes: async () => [
            {
              sourceId: "296b329e-a434-491d-b794-df60e164b4c8",
              inboxId: X_LEMO_DESIGN_INBOX_ID,
              channelType: "Channel::Api",
            },
          ],
          listContactConversations: async () => [
            {
              id: "17",
              inboxId: X_LEMO_DESIGN_INBOX_ID,
              status: "open",
              channelType: "Channel::Api",
              contact: {
                id: "cw-x-existing",
                name: "Remon",
                email: null,
                phone: null,
                username: "remondevries",
                identifier: null,
                customAttributes: { x_user_id: "50254162" },
                avatarUrl: null,
              },
              lastActivityAt: new Date().toISOString(),
              unreadCount: 0,
              lastMessagePreview: null,
            },
          ],
          createConversation: async () => {
            created = true;
            return { id: "should-not", inboxId: X_LEMO_DESIGN_INBOX_ID };
          },
          createMessage: async (conversationId: string) => {
            messagedOn = conversationId;
            return {
              id: "m1",
              conversationId,
              content: "hello on X",
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
    assert.equal(messagedOn, "17");
  });

  it("does not reuse another user's inbox-8 conversation from a Chatwoot filter", async () => {
    let createdOn: string | null = null;
    let messagedOn: string | null = null;
    let createdContact = false;
    const result = await createChatConversation(
      "ws",
      {
        channel: "x",
        contactId: "contact-1",
        content: "hello on X",
      },
      baseDeps({
        local: null,
        loadContact: async () => contact({ xUserId: "50254162" }),
        client: {
          searchContacts: async () => [],
          filterContactsByCustomAttribute: async () => [],
          // Filter noise: another X user in inbox 8 — must not be reused.
          filterConversationsByAttribute: async () => [
            {
              id: "99",
              inboxId: X_LEMO_DESIGN_INBOX_ID,
              status: "open",
              channelType: "Channel::Api",
              contact: {
                id: "cw-other",
                name: "Other",
                email: null,
                phone: null,
                username: "someoneelse",
                identifier: "11111111",
                customAttributes: { x_user_id: "11111111" },
                avatarUrl: null,
              },
              additionalAttributes: { x_user_id: "11111111" },
              customAttributes: { x_user_id: "11111111" },
              xUserId: "11111111",
              lastActivityAt: new Date().toISOString(),
              unreadCount: 0,
              lastMessagePreview: null,
            },
          ],
          createContact: async () => {
            createdContact = true;
            return {
              id: "cw-x-new",
              name: "Remon",
              email: null,
              phone: null,
              username: null,
              identifier: "50254162",
              avatarUrl: null,
            };
          },
          getContactInboxes: async () => [],
          createContactInbox: async (input: {
            inboxId: string;
            sourceId: string;
          }) => ({
            sourceId: input.sourceId,
            inboxId: input.inboxId,
            channelType: "Channel::Api",
          }),
          listContactConversations: async () => [],
          createConversation: async (input: { inboxId: string }) => {
            createdOn = input.inboxId;
            return { id: "cw-x-fresh", inboxId: input.inboxId };
          },
          createMessage: async (conversationId: string) => {
            messagedOn = conversationId;
            return {
              id: "m1",
              conversationId,
              content: "hello on X",
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
    assert.equal(createdContact, true);
    assert.equal(createdOn, X_LEMO_DESIGN_INBOX_ID);
    assert.equal(messagedOn, null);
  });

  it("refuses to overwrite a Chatwoot contact with a different x_user_id", async () => {
    await assert.rejects(
      () =>
        createChatConversation(
          "ws",
          {
            channel: "x",
            contactId: "contact-1",
            content: "hello",
          },
          baseDeps({
            local: null,
            loadContact: async () => contact({ xUserId: "50254162" }),
            client: {
              // Matched via custom_attributes, but identifier belongs to another X user.
              searchContacts: async () => [
                {
                  id: "cw-conflict",
                  name: "Someone",
                  email: null,
                  phone: null,
                  username: null,
                  identifier: "11111111",
                  customAttributes: { x_user_id: "50254162" },
                  xUserId: "50254162",
                  avatarUrl: null,
                },
              ],
            },
          }),
        ),
      (error: unknown) => errCode(error) === "x_user_id_conflict",
    );
  });

  it("refuses X create when the contact only has an @handle", async () => {
    await assert.rejects(
      () =>
        createChatConversation(
          "ws",
          {
            channel: "x",
            contactId: "contact-1",
            content: "hello",
          },
          baseDeps({
            loadContact: async () => contact({ xUserId: "@remondevries" }),
          }),
        ),
      (error: unknown) =>
        errCode(error) === "messaging_window_closed" ||
        errCode(error) === "x_user_id_required",
    );
  });
});
