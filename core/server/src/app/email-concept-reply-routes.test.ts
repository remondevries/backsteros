import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { Hono } from "hono";

import type { AuthContext } from "../middleware/auth.js";
import { AgentMailClient } from "../lib/agentmail-client.js";
import { conceptReplyClientId } from "../lib/agentmail-email-list.js";
import {
  NO_REPLYABLE_CONCEPT_RECIPIENT_MESSAGE,
  resolveEmailReplyTemplates,
} from "../lib/email-reply-assembler.js";
import { agentMailDraftLifecycleDeps } from "../services/agentmail-settings.js";

process.env.DATABASE_URL ??=
  "postgres://backsteros:backsteros@127.0.0.1:5433/backsteros_test";

const { registerEmailRoutes } = await import("./email-routes.js");

const authWrite: AuthContext = {
  kind: "api_key",
  userId: null,
  clerkUserId: null,
  apiKeyId: "key-1",
  contactId: null,
  workspaceId: "ws_1",
  membershipRole: null,
  scopes: ["settings:write", "settings:read"],
};

const TEMPLATES = resolveEmailReplyTemplates({
  greetingTemplateEn: "Hi {firstName},",
  signOffTemplateEn: "Best,\n{name}",
  signOffName: "Remon",
});

function stubAgentMailDeps() {
  mock.method(agentMailDraftLifecycleDeps, "getCredentials", async () => ({
    apiKey: "am_test_fake_key",
    inboxId: "inbox_1",
    inboxIds: ["inbox_1"],
  }));
  mock.method(agentMailDraftLifecycleDeps, "getTemplates", async () => TEMPLATES);
  mock.method(agentMailDraftLifecycleDeps, "resolveSignOffAvatar", async () => null);
  mock.method(agentMailDraftLifecycleDeps, "patchThread", async () => null);
  mock.method(agentMailDraftLifecycleDeps, "deleteThread", async () => true);
  mock.method(agentMailDraftLifecycleDeps, "getOrCreateThread", async () => ({
    id: "meta",
    inboxId: "inbox_1",
    threadKey: "draft:x",
    number: 1,
    displayId: "E-1",
    status: "concept",
    priority: 0,
    dueDate: null,
    organizationId: null,
    contactId: null,
    assigneeId: null,
    projectId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  mock.method(AgentMailClient.prototype, "listInboxes", async () => [
    { inboxId: "inbox_1", email: "remon@example.com", displayName: null },
  ]);
  mock.method(AgentMailClient.prototype, "listDrafts", async () => []);
}

afterEach(() => {
  mock.restoreAll();
});

describe("OS-101 concept-reply route", () => {
  it("keeps EUR 18.15 body intact through POST concept-reply", async () => {
    stubAgentMailDeps();
    const body =
      "Thanks for sending over AgentMail invoice RLMOORV4-0001 for EUR 18.15. I'll go ahead and process it.";
    const messageId = "msg_route_1815";
    mock.method(AgentMailClient.prototype, "getMessage", async () => ({
      inboxId: "inbox_1",
      threadId: "thread_1",
      messageId,
      subject: "Invoice",
      from: "Ada Lovelace <ada@example.com>",
      to: ["remon@example.com"],
      preview: null,
      timestamp: "2026-10-01T08:00:00.000Z",
      labels: [],
      text: "Please process.",
      html: null,
      extractedText: "Please process.",
      extractedHtml: null,
      inReplyTo: null,
      attachments: [],
    }));
    mock.method(
      AgentMailClient.prototype,
      "createDraft",
      async (_inboxId: string, payload: Record<string, unknown>) => ({
        inboxId: "inbox_1",
        draftId: "draft_route_1815",
        subject: String(payload.subject ?? ""),
        preview: null,
        text: String(payload.text ?? ""),
        html: String(payload.html ?? ""),
        inReplyTo: messageId,
        clientId: conceptReplyClientId(messageId),
        to: (payload.to as string[]) ?? [],
        cc: [],
        attachments: [],
        updatedAt: "2026-10-01T08:00:00.000Z",
        createdAt: "2026-10-01T08:00:00.000Z",
      }),
    );

    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("auth", authWrite);
      await next();
    });
    registerEmailRoutes(app);

    const res = await app.request(
      `/api/v1/email/inboxes/inbox_1/messages/${encodeURIComponent(messageId)}/concept-reply`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      },
    );
    assert.equal(res.status, 200);
    const json = (await res.json()) as { body?: string };
    assert.equal(json.body, body);
  });

  it("returns 4xx JSON for Moneybird import parents", async () => {
    stubAgentMailDeps();
    const messageId = "msg_route_moneybird";
    mock.method(AgentMailClient.prototype, "getMessage", async () => ({
      inboxId: "inbox_1",
      threadId: "thread_1",
      messageId,
      subject: "Import",
      from: "Remon <remon@example.com>",
      to: ["lemo-desig-7aa4efe6@inkomend.moneybird.nl"],
      preview: null,
      timestamp: "2026-10-01T08:00:00.000Z",
      labels: [],
      text: "Forwarded.",
      html: null,
      extractedText: "Forwarded.",
      extractedHtml: null,
      inReplyTo: null,
      attachments: [],
    }));
    mock.method(AgentMailClient.prototype, "createDraft", async () => {
      throw new Error("createDraft should not run");
    });

    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("auth", authWrite);
      await next();
    });
    registerEmailRoutes(app);

    const res = await app.request(
      `/api/v1/email/inboxes/inbox_1/messages/${encodeURIComponent(messageId)}/concept-reply`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: "Thanks for EUR 18.15. I'll process it.",
        }),
      },
    );
    assert.ok(res.status >= 400 && res.status < 500);
    const json = (await res.json()) as { error?: string };
    assert.equal(json.error, NO_REPLYABLE_CONCEPT_RECIPIENT_MESSAGE);
  });
});
