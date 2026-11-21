import type { AgentMailMessageAttachment } from "@backsteros/contracts";

import { EMAIL_SIGN_OFF_AVATAR_CID } from "../../lib/email-reply-assembler.js";

/** AgentMail draft PATCH with base64 content must stay under ~6 MB total. */
export const MAX_EMAIL_DRAFT_ATTACHMENT_BYTES = 4_500_000;

export function isSignOffAvatarAttachment(attachment: {
  contentId?: string | null;
}): boolean {
  const contentId = attachment.contentId?.trim() ?? "";
  return (
    contentId === EMAIL_SIGN_OFF_AVATAR_CID ||
    contentId === `<${EMAIL_SIGN_OFF_AVATAR_CID}>`
  );
}

type DraftAttachmentLike = {
  attachmentId: string;
  size?: number | null;
  filename?: string | null;
  contentType?: string | null;
  contentDisposition?: string | null;
  contentId?: string | null;
};

/** User-facing draft attachments — excludes the circular sign-off avatar. */
export function userFacingDraftAttachments(
  attachments: readonly DraftAttachmentLike[] | null | undefined,
): AgentMailMessageAttachment[] {
  return (attachments ?? [])
    .filter((attachment) => !isSignOffAvatarAttachment(attachment))
    .map((attachment) => ({
      attachmentId: attachment.attachmentId,
      size: attachment.size ?? undefined,
      filename: attachment.filename ?? null,
      contentType: attachment.contentType ?? null,
      contentDisposition: attachment.contentDisposition ?? null,
      contentId: attachment.contentId ?? null,
    }));
}
