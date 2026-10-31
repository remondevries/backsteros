import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveChatAttachmentContentType } from "./chat-attachment-content-type.js";

describe("resolveChatAttachmentContentType", () => {
  it("sniffs png as image", () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    const resolved = resolveChatAttachmentContentType(
      "application/octet-stream",
      "x.bin",
      bytes,
    );
    assert.equal(resolved.kind, "image");
    assert.equal(resolved.contentType, "image/png");
  });

  it("sniffs pdf", () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\nrest");
    const resolved = resolveChatAttachmentContentType(null, "doc.pdf", bytes);
    assert.equal(resolved.kind, "pdf");
    assert.equal(resolved.contentType, "application/pdf");
  });

  it("never treats svg as image", () => {
    const bytes = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    const resolved = resolveChatAttachmentContentType(
      "image/svg+xml",
      "x.svg",
      bytes,
    );
    assert.equal(resolved.kind, "file");
  });
});
