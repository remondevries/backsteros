import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  chatUiContactCardDataSchema,
  chatUiDocumentCardDataSchema,
  chatUiEstimateCardDataSchema,
  chatUiHabitCardDataSchema,
  chatUiInvoiceCardDataSchema,
  chatUiJournalCardDataSchema,
  chatUiMeetingCardDataSchema,
  chatUiMessageCardDataSchema,
  chatUiMessageSchema,
  chatUiPostCardDataSchema,
  chatUiTaskCardDataSchema,
  chatUiThreadSchema,
  chatUiTransactionCardDataSchema,
} from "./chat-ui.js";

describe("chat-ui message format", () => {
  it("accepts a minimal user text message", () => {
    const parsed = chatUiMessageSchema.parse({
      id: "m1",
      role: "user",
      parts: [{ type: "text", text: "Hello" }],
    });
    assert.equal(parsed.status, "done");
    assert.equal(parsed.parts[0]?.type, "text");
  });

  it("accepts assistant parts used by agents", () => {
    const parsed = chatUiMessageSchema.parse({
      id: "m2",
      role: "assistant",
      author: { name: "Grok" },
      status: "streaming",
      createdAt: "2026-10-30T08:00:00.000Z",
      parts: [
        { type: "text", text: "Working…", markdown: true },
        {
          type: "tool-call",
          name: "search_tasks",
          input: { q: "chat" },
          status: "running",
        },
        {
          type: "card",
          cardType: "task",
          id: "card-1",
          data: { taskId: "t1", displayId: "BSH-1", title: "Chat UI" },
        },
        {
          type: "diff",
          filename: "a.ts",
          content: "--- a\n+++ b\n",
        },
        { type: "status-line", text: "Synced" },
        { type: "error", message: "timeout", code: "ETIMEDOUT" },
        {
          type: "approval-request",
          id: "apr-1",
          title: "Run deploy?",
        },
        {
          type: "file",
          url: "https://example.com/a.png",
          kind: "image",
          mimeType: "image/png",
        },
      ],
    });
    assert.equal(parsed.parts.length, 8);
    assert.equal(parsed.status, "streaming");
  });

  it("rejects unknown part types", () => {
    assert.throws(() =>
      chatUiMessageSchema.parse({
        id: "m3",
        role: "user",
        parts: [{ type: "unknown", text: "nope" }],
      }),
    );
  });

  it("parses a thread and task card data", () => {
    const thread = chatUiThreadSchema.parse({
      id: "th1",
      messages: [
        {
          id: "m1",
          role: "system",
          parts: [{ type: "status-line", text: "Conversation opened" }],
        },
      ],
    });
    assert.equal(thread.messages.length, 1);

    const card = chatUiTaskCardDataSchema.parse({
      taskId: "uuid",
      displayId: "BSH-3",
      href: "/tasks/uuid",
    });
    assert.equal(card.displayId, "BSH-3");
    assert.equal(
      chatUiContactCardDataSchema.parse({ contactId: "c1", name: "Ada" }).name,
      "Ada",
    );
    assert.equal(
      chatUiDocumentCardDataSchema.parse({
        documentId: "d1",
        title: "Brief",
      }).title,
      "Brief",
    );
  });

  it("parses meeting / journal / habit / message / post / transaction card payloads", () => {
    assert.equal(
      chatUiMeetingCardDataSchema.parse({
        meetingId: "m1",
        displayId: "M-14",
        title: "Sync",
      }).displayId,
      "M-14",
    );
    assert.equal(
      chatUiJournalCardDataSchema.parse({
        date: "2026-10-30",
        title: "Notes",
      }).date,
      "2026-10-30",
    );
    assert.throws(() =>
      chatUiJournalCardDataSchema.parse({ date: "not-a-date" }),
    );
    assert.equal(
      chatUiHabitCardDataSchema.parse({
        habitId: "h1",
        date: "2026-10-30",
        completed: true,
      }).completed,
      true,
    );
    assert.equal(
      chatUiMessageCardDataSchema.parse({
        conversationId: "c1",
        channelType: "whatsapp",
      }).channelType,
      "whatsapp",
    );
    assert.equal(
      chatUiPostCardDataSchema.parse({
        postId: "p1",
        platform: "linkedin",
      }).platform,
      "linkedin",
    );
    assert.equal(
      chatUiTransactionCardDataSchema.parse({
        transactionId: "tx1",
        amountCents: -2000,
        currency: "EUR",
      }).amountCents,
      -2000,
    );
    assert.equal(
      chatUiInvoiceCardDataSchema.parse({
        invoiceId: "inv1",
        invoiceNumber: "2026-042",
      }).invoiceNumber,
      "2026-042",
    );
    assert.equal(
      chatUiEstimateCardDataSchema.parse({
        estimateId: "es1",
        displayId: "ES-12",
      }).displayId,
      "ES-12",
    );
  });
});
