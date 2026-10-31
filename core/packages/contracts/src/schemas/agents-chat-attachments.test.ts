import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  chatThreadAttachmentSchema,
  chatThreadLinkPreviewSchema,
  chatThreadMessageSchema,
  createChatThreadMessageInputSchema,
} from "./agents-chat.js";

describe("createChatThreadMessageInputSchema attachments / link previews", () => {
  it("accepts attachment-only messages", () => {
    const parsed = createChatThreadMessageInputSchema.parse({
      attachmentIds: ["att_1"],
    });
    assert.equal(parsed.body, "");
    assert.deepEqual(parsed.attachmentIds, ["att_1"]);
  });

  it("rejects empty body without attachments", () => {
    assert.throws(() => createChatThreadMessageInputSchema.parse({ body: "" }));
    assert.throws(() => createChatThreadMessageInputSchema.parse({}));
  });

  it("accepts skipLinkPreviews", () => {
    const parsed = createChatThreadMessageInputSchema.parse({
      body: "See https://example.com",
      skipLinkPreviews: true,
    });
    assert.equal(parsed.skipLinkPreviews, true);
  });
});

describe("chatThreadAttachmentSchema", () => {
  it("parses image attachment", () => {
    const parsed = chatThreadAttachmentSchema.parse({
      id: "a1",
      filename: "shot.png",
      mime: "image/png",
      size: 1200,
      url: "/api/v1/chat/threads/t1/attachments/a1",
      thumbnailUrl: "/api/v1/chat/threads/t1/attachments/a1",
      kind: "image",
    });
    assert.equal(parsed.kind, "image");
  });
});

describe("chatThreadMessageSchema with attachments + linkPreviews", () => {
  it("allows both arrays", () => {
    const preview = chatThreadLinkPreviewSchema.parse({
      url: "https://example.com/post",
      siteName: "Example",
      title: "Hello",
      description: "World",
      faviconUrl: "https://example.com/favicon.ico",
      imageUrl: "https://example.com/og.png",
    });
    const parsed = chatThreadMessageSchema.parse({
      id: "m1",
      threadId: "t1",
      role: "user",
      authorContactId: null,
      authorName: "Remon",
      body: "https://example.com/post",
      status: "done",
      createdAt: "2026-10-31T08:00:00.000Z",
      updatedAt: "2026-10-31T08:00:00.000Z",
      attachments: [
        {
          id: "a1",
          filename: "notes.pdf",
          mime: "application/pdf",
          size: 10,
          url: "/api/v1/chat/threads/t1/attachments/a1",
          thumbnailUrl: null,
          kind: "pdf",
        },
      ],
      linkPreviews: [preview],
    });
    assert.equal(parsed.attachments?.[0]?.kind, "pdf");
    assert.equal(parsed.linkPreviews?.[0]?.title, "Hello");
  });
});
