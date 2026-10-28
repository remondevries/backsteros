/**
 * OS-146 — agent chat/email scopes, dryRun, idempotency, settings lock.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { Hono } from "hono";

import type { AuthContext } from "../middleware/auth.js";
import {
  clearIdempotencyCacheForTests,
  withIdempotency,
} from "../lib/idempotency.js";
import * as chatCreateService from "../services/chat-create-conversation.js";

process.env.DATABASE_URL ??=
  "postgres://backsteros:backsteros@127.0.0.1:5433/backsteros_test";

const { registerChatRoutes } = await import("./chat-routes.js");
const { isAgentPersonaAuth } = await import("./route-helpers.js");

const agentAuth: AuthContext = {
  kind: "api_key",
  userId: null,
  clerkUserId: null,
  apiKeyId: "agent-key-1",
  contactId: "contact-agent",
  workspaceId: "ws_1",
  membershipRole: null,
  scopes: [
    "chat:read",
    "chat:write",
    "email:read",
    "email:send",
    "contacts:read",
  ],
};

function mount(register: (app: Hono) => void, auth: AuthContext): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("auth", auth);
    await next();
  });
  app.use("/api/v1/settings/*", async (c, next) => {
    if (isAgentPersonaAuth(c.get("auth"))) {
      return c.json({ error: "Insufficient scope", code: "forbidden" }, 403);
    }
    await next();
  });
  register(app);
  return app;
}

function chatDeps(overrides: {
  phone?: string | null;
  phones?: { number: string; label?: string }[];
  inboxes?: Array<{
    id: string;
    name: string;
    channelType: string;
    channel:
      | "whatsapp"
      | "instagram"
      | "messenger"
      | "telegram"
      | "support"
      | "x";
  }>;
} = {}) {
  let writeCalls = 0;
  let listInboxCalls = 0;
  return {
    writeCalls: () => writeCalls,
    listInboxCalls: () => listInboxCalls,
    /** @deprecated use writeCalls — dryRun may list inboxes */
    externalCalls: () => writeCalls,
    loadContact: async () =>
      ({
        id: "c1",
        name: "Jan",
        phone: overrides.phone === undefined ? "+31612345678" : overrides.phone,
        phones: overrides.phones ?? [],
        email: "jan@example.com",
        facebookMessengerId: "psid-1",
        xUserId: "12345",
      }) as never,
    findLocalChannelConversation: async () => null,
    lastIncomingAtForConversation: async () => null,
    listChannelInboxes: async (
      _ws: string,
      channel?: string,
    ) => {
      listInboxCalls += 1;
      const all = overrides.inboxes ?? [
        {
          id: "7",
          name: "WA",
          channelType: "Channel::Whatsapp",
          channel: "whatsapp" as const,
        },
        {
          id: "1",
          name: "IG",
          channelType: "Channel::Instagram",
          channel: "instagram" as const,
        },
        {
          id: "2",
          name: "FB",
          channelType: "Channel::Facebook",
          channel: "messenger" as const,
        },
        {
          id: "3",
          name: "TG",
          channelType: "Channel::Telegram",
          channel: "telegram" as const,
        },
        {
          id: "4",
          name: "Support",
          channelType: "Channel::Email",
          channel: "support" as const,
        },
        {
          id: "5",
          name: "X",
          channelType: "Channel::Api",
          channel: "x" as const,
        },
      ];
      return {
        inboxes: channel
          ? all.filter((inbox) => inbox.channel === channel)
          : all,
      };
    },
    getChatwootCredentials: async () => {
      writeCalls += 1;
      return {
        baseUrl: "https://example.test",
        accountId: "1",
        apiToken: "t",
      };
    },
    createChatwootClient: () => {
      writeCalls += 1;
      throw new Error("Chatwoot client should not be created");
    },
    upsertConversationFromChatwoot: async () => {
      writeCalls += 1;
      throw new Error("no");
    },
    upsertMessageFromChatwoot: async () => {
      writeCalls += 1;
      throw new Error("no");
    },
    getChatConversation: async () => null,
    publishChatUpdated: () => undefined,
    notifyPeerOfEntityWrite: () => undefined,
    linkConversationContact: async () => undefined,
  };
}

afterEach(() => {
  mock.restoreAll();
  clearIdempotencyCacheForTests();
});

describe("OS-146 agent chat/email", () => {
  it("treats contact-bound api keys as agent personas", () => {
    assert.equal(isAgentPersonaAuth(agentAuth), true);
    assert.equal(
      isAgentPersonaAuth({ ...agentAuth, contactId: null }),
      false,
    );
  });

  it("blocks agent personas on settings middleware", async () => {
    const app = mount(() => {
      /* settings middleware only */
    }, agentAuth);
    app.get("/api/v1/settings", (c) => c.json({ ok: true }));
    assert.equal((await app.request("/api/v1/settings")).status, 403);
  });

  it("dryRun create conversation makes no Chatwoot write call", async () => {
    const deps = chatDeps();
    const preview = await chatCreateService.createChatConversation(
      "ws_1",
      {
        channel: "whatsapp",
        contactId: "c1",
        content: "Hello",
        dryRun: true,
      },
      deps,
    );
    assert.equal((preview as { dryRun?: boolean }).dryRun, true);
    assert.equal(
      (preview as { requiresTemplate?: boolean }).requiresTemplate,
      true,
    );
    assert.equal((preview as { inboxId?: string | null }).inboxId, "7");
    assert.equal(
      (preview as { sourceId?: string | null }).sourceId,
      "31612345678",
    );
    assert.equal(deps.writeCalls(), 0);
    assert.ok(deps.listInboxCalls() >= 1);
  });

  it("dryRun resolves default WhatsApp inbox and normalises landline sourceId", async () => {
    const deps = chatDeps({
      phone: "+31 (0) 58 266 42 42",
      phones: [{ label: "work", number: "+31 (0) 58 266 42 42" }],
    });
    const preview = await chatCreateService.createChatConversation(
      "ws_1",
      {
        channel: "whatsapp",
        contactId: "c1",
        content: "Hello",
        dryRun: true,
      },
      deps,
    );
    assert.equal((preview as { inboxId?: string | null }).inboxId, "7");
    assert.equal(
      (preview as { sourceId?: string | null }).sourceId,
      "31582664242",
    );
    assert.equal(deps.writeCalls(), 0);
  });

  it("dryRun prefers mobile over landline for WhatsApp sourceId", async () => {
    const deps = chatDeps({
      phone: "+31 (0) 58 266 42 42",
      phones: [
        { label: "work", number: "+31 (0) 58 266 42 42" },
        { label: "mobile", number: "+31 (0)6 461 96 570" },
      ],
    });
    const preview = await chatCreateService.createChatConversation(
      "ws_1",
      {
        channel: "whatsapp",
        contactId: "c1",
        content: "Hello",
        dryRun: true,
      },
      deps,
    );
    assert.equal(
      (preview as { sourceId?: string | null }).sourceId,
      "31646196570",
    );
  });

  it("dryRun works for each chat channel without Chatwoot writes", async () => {
    const channels = [
      "whatsapp",
      "instagram",
      "messenger",
      "telegram",
      "support",
      "x",
    ] as const;
    for (const channel of channels) {
      const deps = chatDeps();
      const preview = await chatCreateService.createChatConversation(
        "ws_1",
        {
          channel,
          contactId: "c1",
          content: "Hello",
          subject: channel === "support" ? "Subject" : undefined,
          dryRun: true,
        },
        deps,
      );
      assert.equal((preview as { dryRun?: boolean }).dryRun, true);
      assert.equal((preview as { channel?: string }).channel, channel);
      assert.ok((preview as { inboxId?: string | null }).inboxId);
      assert.equal(deps.writeCalls(), 0);
    }
  });

  it("returns template_required with status 422 and no Chatwoot call", async () => {
    const deps = chatDeps();
    await assert.rejects(
      () =>
        chatCreateService.createChatConversation(
          "ws_1",
          {
            channel: "whatsapp",
            contactId: "c1",
            content: "Hello free-form",
          },
          deps,
        ),
      (error: unknown) =>
        Boolean(
          error &&
            typeof error === "object" &&
            (error as { code?: string }).code === "template_required" &&
            (error as { status?: number }).status === 422,
        ),
    );
    assert.equal(deps.externalCalls(), 0);
  });

  it("Idempotency-Key coalesces duplicate create/send work", async () => {
    let runs = 0;
    const scope = "api_key:agent-key-1:chat";
    const run = async () => {
      runs += 1;
      return { status: 200, body: { id: "conv-1" } };
    };
    const first = await withIdempotency(scope, "os146-chat-1", run);
    const second = await withIdempotency(scope, "os146-chat-1", run);
    assert.deepEqual(first, second);
    assert.equal(runs, 1);
  });

  it("email start dryRun makes no AgentMail compose/send call", async () => {
    let composeCalls = 0;
    let sendCalls = 0;
    const { startEmailThread } = await import(
      "../services/agentmail-settings/send-lifecycle.js"
    );
    const preview = await startEmailThread(
      "ws_1",
      {
        inboxId: "inbox_1",
        to: "jan@example.com",
        subject: "Hello",
        body: "Body",
        dryRun: true,
      },
      {
        getStoredCredentials: async () => ({
          apiKey: "am_stored",
          inboxId: "inbox_1",
          inboxIds: ["inbox_1"],
        }),
        listKnownInboxIds: async () => ["inbox_1"],
        composeDraft: async () => {
          composeCalls += 1;
          throw new Error("compose should not run");
        },
        sendDraft: async () => {
          sendCalls += 1;
          throw new Error("send should not run");
        },
        loadContactId: async () => "c1",
        patchThread: async () => null,
      },
    );
    assert.equal((preview as { dryRun?: boolean }).dryRun, true);
    assert.equal(composeCalls, 0);
    assert.equal(sendCalls, 0);
  });

  it("email start dryRun rejects unknown inboxId with inbox_not_found", async () => {
    const { startEmailThread } = await import(
      "../services/agentmail-settings/send-lifecycle.js"
    );
    await assert.rejects(
      () =>
        startEmailThread(
          "ws_1",
          {
            inboxId: "inbox_missing",
            to: "jan@example.com",
            subject: "Hello",
            body: "Body",
            dryRun: true,
          },
          {
            getStoredCredentials: async () => ({
              apiKey: "am_stored",
              inboxId: null,
              inboxIds: [],
            }),
            listKnownInboxIds: async () => ["inbox_real"],
            composeDraft: async () => {
              throw new Error("compose should not run");
            },
            sendDraft: async () => {
              throw new Error("send should not run");
            },
            loadContactId: async () => "c1",
            patchThread: async () => null,
          },
        ),
      (error: unknown) =>
        Boolean(
          error &&
            typeof error === "object" &&
            (error as { code?: string }).code === "inbox_not_found" &&
            (error as { status?: number }).status === 404,
        ),
    );
  });

  it("agent without chat:write cannot create conversations", async () => {
    const noWrite: AuthContext = {
      ...agentAuth,
      scopes: ["chat:read", "email:read", "contacts:read"],
    };
    const app = mount(registerChatRoutes, noWrite);
    const res = await app.request("/api/v1/chat/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: "whatsapp",
        contactId: "c1",
        content: "Hi",
      }),
    });
    assert.equal(res.status, 403);
  });
});
