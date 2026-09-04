import assert from "node:assert/strict";
import test from "node:test";

import {
  contentTypeFromFilename,
  resolveTaskAttachmentContentType,
} from "./task-attachment-content-type.js";

test("contentTypeFromFilename maps common extensions", () => {
  assert.equal(contentTypeFromFilename("brief.pdf"), "application/pdf");
  assert.equal(contentTypeFromFilename("photo.PNG"), "image/png");
  assert.equal(contentTypeFromFilename("note.eml"), "message/rfc822");
  assert.equal(contentTypeFromFilename("sheet.xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(contentTypeFromFilename("unknown.foo"), null);
});

test("resolveTaskAttachmentContentType prefers concrete Content-Type", () => {
  assert.equal(
    resolveTaskAttachmentContentType("image/jpeg; charset=binary", "x.bin"),
    "image/jpeg",
  );
  assert.equal(
    resolveTaskAttachmentContentType("application/octet-stream", "photo.png"),
    "image/png",
  );
  assert.equal(
    resolveTaskAttachmentContentType(undefined, "mail.eml"),
    "message/rfc822",
  );
  assert.equal(
    resolveTaskAttachmentContentType("", "mystery"),
    "application/octet-stream",
  );
});
