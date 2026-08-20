import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AgentMailMessage } from "@backsteros/contracts";

import {
  conceptReplyClientId,
  embedConceptDraftsInMessages,
  isLikelyConceptDraft,
  loadConceptDraftForThreadAcrossInboxes,
  resolveConceptDraftParentLink,
  resolveConceptDraftParentMessageId,
  resolveDraftAcrossInboxes,
} from "./agentmail-email-list.js";
import { AgentMailClient } from "./agentmail-client.js";

describe("agentmail-email-list", () => {
  it("resolves concept draft parent from stable client id", () => {
    const messageId = "msg_parent";
    const clientId = conceptReplyClientId(messageId);
    assert.equal(
      resolveConceptDraftParentMessageId(clientId, ["other", messageId]),
      messageId,
    );
    assert.equal(resolveConceptDraftParentMessageId("other-id", [messageId]), null);
  });

  it("only treats BacksterOS concept drafts as enrich candidates", () => {
    assert.equal(
      isLikelyConceptDraft({
        inboxId: "inbox_1",
        draftId: "draft_1",
        subject: "Reply concept",
        preview: null,
        text: null,
        inReplyTo: null,
        clientId: null,
        updatedAt: "2026-08-19T10:00:00Z",
        createdAt: "2026-08-19T10:00:00Z",
      }),
      true,
    );
    assert.equal(
      isLikelyConceptDraft({
        inboxId: "inbox_1",
        draftId: "draft_2",
        subject: "Re: Invoice",
        preview: null,
        text: null,
        inReplyTo: null,
        clientId: null,
        updatedAt: "2026-08-19T10:00:00Z",
        createdAt: "2026-08-19T10:00:00Z",
      }),
      false,
    );
  });

  it("embeds concept drafts on parent messages instead of separate rows", () => {
    const messages: AgentMailMessage[] = [
      {
        kind: "message",
        inboxId: "inbox_1",
        threadId: "thread_b",
        messageId: "msg_new",
        draftId: null,
        inReplyToMessageId: null,
        subject: "Newer",
        from: "Bob",
        preview: null,
        timestamp: "2026-08-19T10:00:00Z",
      },
    ];
    const drafts: AgentMailMessage[] = [
      {
        kind: "draft",
        inboxId: "inbox_1",
        messageId: "draft_1",
        draftId: "draft_1",
        inReplyToMessageId: "msg_new",
        subject: "Reply concept",
        from: "Draft",
        preview: "Thanks for reaching out",
        timestamp: "2026-08-19T11:00:00Z",
      },
    ];

    const merged = embedConceptDraftsInMessages(messages, drafts);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.messageId, "msg_new");
    assert.equal(merged[0]?.conceptDraftId, "draft_1");
    assert.equal(merged[0]?.conceptPreview, "Thanks for reaching out");
  });

  it("embeds concept drafts linked only by stable client id across inboxes", () => {
    const messageId = "msg_parent";
    const clientId = conceptReplyClientId(messageId);
    const messages: AgentMailMessage[] = [
      {
        kind: "message",
        inboxId: "inbox_a",
        threadId: "thread_1",
        messageId,
        draftId: null,
        inReplyToMessageId: null,
        subject: "Question",
        from: "Alice",
        preview: null,
        timestamp: "2026-08-19T10:00:00Z",
      },
    ];
    const drafts: AgentMailMessage[] = [
      {
        kind: "draft",
        inboxId: "inbox_b",
        messageId: "draft_other_inbox",
        draftId: "draft_other_inbox",
        inReplyToMessageId: resolveConceptDraftParentLink(
          { inReplyTo: null, clientId },
          [messageId],
        ),
        subject: "Re: Question",
        from: "Draft",
        preview: "Draft body",
        timestamp: "2026-08-19T11:00:00Z",
      },
    ];

    const merged = embedConceptDraftsInMessages(messages, drafts);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.messageId, messageId);
    assert.equal(merged[0]?.conceptDraftId, "draft_other_inbox");
  });

  it("resolves drafts across inboxes when the hinted inbox is wrong", async () => {
    const client = new AgentMailClient({
      apiKey: "am_test_key",
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/inboxes/inbox_a/drafts/draft_1")) {
          return new Response("Draft not found", { status: 404 });
        }
        if (url.includes("/inboxes/inbox_b/drafts/draft_1")) {
          return new Response(
            JSON.stringify({
              inbox_id: "inbox_b",
              draft_id: "draft_1",
              subject: "Re: Hello",
              text: "Body",
              to: ["user@example.com"],
              updated_at: "2026-08-19T10:00:00Z",
              created_at: "2026-08-19T10:00:00Z",
            }),
            { status: 200 },
          );
        }
        return new Response("not found", { status: 404 });
      },
    });

    const draft = await resolveDraftAcrossInboxes(
      client,
      ["inbox_a", "inbox_b"],
      "draft_1",
      "inbox_a",
    );
    assert.equal(draft.inboxId, "inbox_b");
    assert.equal(draft.draftId, "draft_1");
  });

  it("loads a concept draft linked to another message in the same thread", async () => {
    const parentId = "msg_root";
    const openedId = "msg_reply";
    const clientId = conceptReplyClientId(parentId);
    const client = new AgentMailClient({
      apiKey: "am_test_key",
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/inboxes/inbox_1/drafts") || url.includes("/drafts?")) {
          return new Response(
            JSON.stringify({
              drafts: [
                {
                  inbox_id: "inbox_1",
                  draft_id: "draft_thread",
                  subject: "Re: Hello",
                  preview: "Please send the contract",
                  text: null,
                  // List omits client_id / in_reply_to (AgentMail sparse summary).
                  updated_at: "2026-08-19T12:00:00Z",
                  created_at: "2026-08-19T12:00:00Z",
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes("/drafts/draft_thread")) {
          return new Response(
            JSON.stringify({
              inbox_id: "inbox_1",
              draft_id: "draft_thread",
              client_id: clientId,
              in_reply_to: parentId,
              subject: "Re: Hello",
              text: "Please send the contract",
              to: ["ada@example.com"],
              updated_at: "2026-08-19T12:00:00Z",
              created_at: "2026-08-19T12:00:00Z",
            }),
            { status: 200 },
          );
        }
        return new Response("not found", { status: 404 });
      },
    });

    const draft = await loadConceptDraftForThreadAcrossInboxes(
      client,
      ["inbox_1"],
      [openedId, parentId],
    );
    assert.ok(draft);
    assert.equal(draft?.draftId, "draft_thread");
    assert.equal(draft?.inReplyTo, parentId);
    assert.equal(draft?.clientId, clientId);
  });
});
