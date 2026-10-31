import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  answerChatThreadMessageEmailDraftInputSchema,
  answerChatThreadMessageInputSchema,
  chatThreadMessageEmailDraftInputSchema,
  chatThreadMessageEmailDraftSchema,
  createChatThreadMessageInputSchema,
  formatChatThreadEmailDraftResultBody,
} from "./agents-chat.js";

describe("chatThreadMessageEmailDraftInputSchema", () => {
  it("accepts contact refs and emails", () => {
    const parsed = chatThreadMessageEmailDraftInputSchema.parse({
      to: ["[@contact:C-12]", "ops@example.com", { contactId: "c1" }],
      subject: "Hello",
      body: "Body text",
      note: "For review",
    });
    assert.equal(parsed.to.length, 3);
    assert.equal(parsed.subject, "Hello");
  });

  it("rejects empty to / oversized subject / body", () => {
    assert.throws(() =>
      chatThreadMessageEmailDraftInputSchema.parse({
        to: [],
        subject: "Hi",
        body: "x",
      }),
    );
    assert.throws(() =>
      chatThreadMessageEmailDraftInputSchema.parse({
        to: ["a@b.co"],
        subject: "x".repeat(201),
        body: "ok",
      }),
    );
    assert.throws(() =>
      chatThreadMessageEmailDraftInputSchema.parse({
        to: ["a@b.co"],
        subject: "ok",
        body: "x".repeat(20_481),
      }),
    );
  });
});

describe("chatThreadMessageEmailDraftSchema (stored)", () => {
  it("requires resolved recipients with emails", () => {
    const parsed = chatThreadMessageEmailDraftSchema.parse({
      to: [{ email: "ada@example.com", name: "Ada", contactId: "c1" }],
      subject: "Invoice",
      body: "Please pay",
      from: { inboxId: "inb1", email: "me@example.com", displayName: "Remon" },
    });
    assert.equal(parsed.to[0]?.name, "Ada");
  });
});

describe("createChatThreadMessageInputSchema with emailDraft", () => {
  it("allows emailDraft without body", () => {
    const parsed = createChatThreadMessageInputSchema.parse({
      emailDraft: {
        to: ["ada@example.com"],
        subject: "Hi",
        body: "Hello",
      },
    });
    assert.ok(parsed.emailDraft);
  });
});

describe("answerChatThreadMessageEmailDraftInputSchema", () => {
  it("accepts send with edits and discard", () => {
    assert.deepEqual(
      answerChatThreadMessageEmailDraftInputSchema.parse({
        emailAction: "discard",
      }),
      { emailAction: "discard" },
    );
    const sent = answerChatThreadMessageEmailDraftInputSchema.parse({
      emailAction: "send",
      edits: {
        to: ["new@example.com"],
        subject: "Revised",
        body: "New body",
      },
    });
    assert.equal(sent.emailAction, "send");
    assert.equal(sent.edits?.subject, "Revised");
  });
});

describe("answerChatThreadMessageInputSchema email branch", () => {
  it("accepts emailAction", () => {
    const parsed = answerChatThreadMessageInputSchema.parse({
      emailAction: "send",
    });
    assert.ok("emailAction" in parsed);
    assert.equal(parsed.emailAction, "send");
  });
});

describe("formatChatThreadEmailDraftResultBody", () => {
  const draft = chatThreadMessageEmailDraftSchema.parse({
    to: [{ email: "ada@example.com", name: "Ada" }],
    subject: "Invoice INV-9",
    body: "Hi",
  });

  it("formats sent and discarded summaries", () => {
    assert.equal(
      formatChatThreadEmailDraftResultBody(draft, {
        action: "sent",
        sentAt: "2026-10-31T12:00:00.000Z",
        finalTo: draft.to,
        finalSubject: draft.subject,
        finalBody: draft.body,
      }),
      "Sent: Invoice INV-9 to Ada",
    );
    assert.equal(
      formatChatThreadEmailDraftResultBody(draft, {
        action: "discarded",
        sentAt: "2026-10-31T12:00:00.000Z",
      }),
      "Discarded: Invoice INV-9",
    );
  });
});
