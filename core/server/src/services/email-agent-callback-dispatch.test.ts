import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import { emailAgentCallbackResultSchema } from "@backsteros/contracts";

import { AgentMailApiError, AgentMailClient } from "../lib/agentmail-client.js";
import { conceptReplyClientId } from "../lib/agentmail-email-list.js";
import {
  NO_REPLYABLE_CONCEPT_RECIPIENT_MESSAGE,
  resolveEmailReplyTemplates,
} from "../lib/email-reply-assembler.js";
import { agentMailDraftLifecycleDeps } from "./agentmail-settings.js";
import {
  dispatchEmailAgentCallbackSuccess,
  emailAgentCallbackDispatchDeps,
} from "./email-agent-callback-dispatch.js";
import { resolveEmailAgentSuccessIntent } from "./email-agent-callback-intent.js";

process.env.DATABASE_URL ??=
  "postgres://backsteros:backsteros@127.0.0.1:5433/backsteros_test";

const TEMPLATES = resolveEmailReplyTemplates({
  greetingTemplateEn: "Hi {firstName},",
  signOffTemplateEn: "Best,\n{name}",
  signOffName: "Remon",
});

afterEach(() => {
  mock.restoreAll();
});

describe("emailAgentCallbackResultSchema", () => {
  it("accepts legacy body-only success as valid", () => {
    const parsed = emailAgentCallbackResultSchema.parse({
      ok: true,
      requestId: "req-1",
      body: "Thanks, we'll look into it.",
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(resolveEmailAgentSuccessIntent(parsed), "reply_draft");
    }
  });

  it("accepts task / calendar / note intents", () => {
    assert.equal(
      resolveEmailAgentSuccessIntent(
        emailAgentCallbackResultSchema.parse({
          ok: true,
          requestId: "r",
          intent: "task",
          task: { title: "Check store locator" },
        }) as Extract<
          ReturnType<typeof emailAgentCallbackResultSchema.parse>,
          { ok: true }
        >,
      ),
      "task",
    );
  });

  it("rejects task without title", () => {
    const result = emailAgentCallbackResultSchema.safeParse({
      ok: true,
      requestId: "r",
      intent: "task",
      task: { title: "" },
    });
    assert.equal(result.success, false);
  });
});

describe("OS-101 dispatchEmailAgentCallbackSuccess reply_draft", () => {
  function stubUpsertPath() {
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
    mock.method(
      emailAgentCallbackDispatchDeps,
      "getOrCreateEmailThreadMetadata",
      async () => ({
        id: "meta",
        inboxId: "inbox_1",
        threadKey: "thread:msg",
        number: 1,
        displayId: "E-1",
        status: "in_progress",
        priority: 0,
        dueDate: null,
        organizationId: null,
        contactId: null,
        assigneeId: null,
        projectId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );
    mock.method(
      emailAgentCallbackDispatchDeps,
      "promoteEmailThreadWorkflowStatus",
      async () => null,
    );
    mock.method(
      emailAgentCallbackDispatchDeps,
      "getAgentMailMessage",
      async () => ({
        inboxId: "inbox_1",
        threadId: "thread_1",
        messageId: "msg_cb",
        subject: "Invoice",
        from: "Ada <ada@example.com>",
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
      }),
    );
  }

  it("keeps EUR 18.15 body intact through real upsertEmailConceptReply", async () => {
    stubUpsertPath();
    const agentBody =
      "Thanks for sending over AgentMail invoice RLMOORV4-0001 for EUR 18.15. I'll go ahead and process it.";
    const messageId = "msg_cb_1815";
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
        draftId: "draft_cb_1815",
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

    const result = await dispatchEmailAgentCallbackSuccess({
      row: { workspaceId: "ws_1", inboxId: "inbox_1", messageId },
      body: {
        ok: true,
        requestId: "req-os101",
        intent: "reply_draft",
        body: agentBody,
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body, agentBody);
  });

  it("surfaces Moneybird import failure as thrown error + thread note", async () => {
    stubUpsertPath();
    const messageId = "msg_cb_moneybird";
    const notes: string[] = [];
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
    mock.method(
      emailAgentCallbackDispatchDeps,
      "createEmailThreadComment",
      async (
        _w: string,
        _i: string,
        _t: string,
        input: { body: string },
      ) => {
        notes.push(input.body);
        return {
          id: "note_1",
          body: input.body,
          author: "agent" as const,
          createdAt: new Date().toISOString(),
        };
      },
    );

    await assert.rejects(
      () =>
        dispatchEmailAgentCallbackSuccess({
          row: { workspaceId: "ws_1", inboxId: "inbox_1", messageId },
          body: {
            ok: true,
            requestId: "req-moneybird",
            intent: "reply_draft",
            body: "Thanks for EUR 18.15. I'll process it.",
          },
        }),
      (error: unknown) =>
        error instanceof AgentMailApiError &&
        error.status === 422 &&
        error.message === NO_REPLYABLE_CONCEPT_RECIPIENT_MESSAGE,
    );
    assert.equal(notes.length, 1);
    assert.match(notes[0]!, /Moneybird import address/);
  });
});
