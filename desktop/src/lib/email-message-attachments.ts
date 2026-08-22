export function emailMessageAttachmentPath(
  inboxId: string,
  messageId: string,
  attachmentId: string,
): string {
  return `/api/v1/email/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`;
}
