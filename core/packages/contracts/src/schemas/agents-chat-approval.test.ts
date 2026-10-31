import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  answerChatThreadMessageApprovalInputSchema,
  answerChatThreadMessageInputSchema,
  chatThreadMessageApprovalSchema,
  chatThreadMessageSchema,
  createChatThreadMessageInputSchema,
} from "./agents-chat.js";

describe("chatThreadMessageApprovalSchema", () => {
  it("defaults kind to generic and destructive to false", () => {
    const parsed = chatThreadMessageApprovalSchema.parse({
      title: "Deploy production",
      summary: "Ship commit abc123",
    });
    assert.equal(parsed.kind, "generic");
    assert.equal(parsed.destructive, false);
  });

  it("accepts fields, details, and labels", () => {
    const parsed = chatThreadMessageApprovalSchema.parse({
      title: "Send invoice",
      kind: "invoice",
      summary: "€1.200 to Acme",
      fields: [
        { label: "Amount", value: "€1.200" },
        { label: "Recipient", value: "Acme BV" },
      ],
      details: "```diff\n+ line\n```",
      approveLabel: "Send",
      rejectLabel: "Hold",
      destructive: true,
    });
    assert.equal(parsed.fields?.length, 2);
    assert.equal(parsed.approveLabel, "Send");
    assert.equal(parsed.destructive, true);
  });

  it("rejects oversized title / summary / too many fields", () => {
    assert.throws(() =>
      chatThreadMessageApprovalSchema.parse({
        title: "x".repeat(121),
        summary: "ok",
      }),
    );
    assert.throws(() =>
      chatThreadMessageApprovalSchema.parse({
        title: "ok",
        summary: "x".repeat(501),
      }),
    );
    assert.throws(() =>
      chatThreadMessageApprovalSchema.parse({
        title: "ok",
        summary: "ok",
        fields: Array.from({ length: 13 }, (_, i) => ({
          label: `L${i}`,
          value: `V${i}`,
        })),
      }),
    );
  });

  it("rejects details over 8KB", () => {
    assert.throws(() =>
      chatThreadMessageApprovalSchema.parse({
        title: "ok",
        summary: "ok",
        details: "x".repeat(8193),
      }),
    );
  });
});

describe("createChatThreadMessageInputSchema with approval", () => {
  it("accepts body + approval", () => {
    const parsed = createChatThreadMessageInputSchema.parse({
      body: "Please confirm",
      approval: {
        title: "Deploy",
        kind: "deploy",
        summary: "Push to production",
      },
    });
    assert.equal(parsed.approval?.kind, "deploy");
  });
});

describe("chatThreadMessageSchema approvalAnswer", () => {
  it("allows null approvalAnswer when approval present", () => {
    const parsed = chatThreadMessageSchema.parse({
      id: "m1",
      threadId: "t1",
      role: "assistant",
      authorContactId: null,
      authorName: "Sander",
      body: "Confirm?",
      status: "done",
      createdAt: "2026-10-31T08:00:00.000Z",
      updatedAt: "2026-10-31T08:00:00.000Z",
      approval: {
        title: "Deploy",
        kind: "deploy",
        summary: "Ship it",
        destructive: false,
      },
      approvalAnswer: null,
    });
    assert.equal(parsed.approvalAnswer, null);
  });
});

describe("answerChatThreadMessageApprovalInputSchema", () => {
  it("accepts approved / rejected with optional note", () => {
    assert.deepEqual(
      answerChatThreadMessageApprovalInputSchema.parse({
        decision: "approved",
      }),
      { decision: "approved" },
    );
    const rejected = answerChatThreadMessageApprovalInputSchema.parse({
      decision: "rejected",
      note: "Wrong amount",
    });
    assert.equal(rejected.decision, "rejected");
    assert.equal(rejected.note, "Wrong amount");
  });
});

describe("answerChatThreadMessageInputSchema", () => {
  it("accepts choices values or approval decision", () => {
    assert.deepEqual(
      answerChatThreadMessageInputSchema.parse({ values: ["ship"] }),
      { values: ["ship"] },
    );
    const approval = answerChatThreadMessageInputSchema.parse({
      decision: "approved",
    });
    assert.ok("decision" in approval);
    assert.equal(approval.decision, "approved");
  });
});
