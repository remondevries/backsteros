import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EMAIL_SIGN_OFF_AVATAR_CID } from "../../lib/email-reply-assembler.js";
import { userFacingDraftAttachments } from "./draft-attachments.js";

describe("userFacingDraftAttachments", () => {
  it("excludes the sign-off avatar and keeps file attachments", () => {
    const attachments = userFacingDraftAttachments([
      {
        attachmentId: "att_avatar",
        size: 1200,
        filename: "signoff-avatar.png",
        contentType: "image/png",
        contentDisposition: "inline",
        contentId: EMAIL_SIGN_OFF_AVATAR_CID,
      },
      {
        attachmentId: "att_pdf",
        size: 4096,
        filename: "invoice.pdf",
        contentType: "application/pdf",
        contentDisposition: "attachment",
        contentId: null,
      },
    ]);

    assert.equal(attachments.length, 1);
    assert.equal(attachments[0]?.attachmentId, "att_pdf");
    assert.equal(attachments[0]?.filename, "invoice.pdf");
  });

  it("returns an empty list when only the avatar is present", () => {
    const attachments = userFacingDraftAttachments([
      {
        attachmentId: "att_avatar",
        size: 1200,
        filename: "signoff-avatar.png",
        contentType: "image/png",
        contentDisposition: "inline",
        contentId: `<${EMAIL_SIGN_OFF_AVATAR_CID}>`,
      },
    ]);
    assert.deepEqual(attachments, []);
  });
});
