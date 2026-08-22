import {
  getEmailItemHref,
  getEmailListItemHref,
  getKnowledgeHref,
  type EmailListItem,
  type KnowledgeListItem,
  type TaskLinkPickerOption,
} from "@backsteros/ui";

/** Build attachable document options for TaskLinkAttachments. */
export function buildDocumentLinkOptions(
  documents: readonly KnowledgeListItem[],
): TaskLinkPickerOption[] {
  return documents
    .filter((doc) => (doc.kind ?? "document") === "document")
    .map((doc) => ({
      id: doc.id,
      label: doc.title?.trim() || "Untitled",
      href: getKnowledgeHref(doc.path ?? doc.id),
      detail: doc.path ?? null,
    }));
}

/** Build attachable email options from AgentMail list rows. */
export function buildEmailLinkOptions(
  messages: readonly EmailListItem[],
): TaskLinkPickerOption[] {
  return messages.map((item) => ({
    id: `${item.kind}:${item.inboxId}:${item.id}`,
    label: item.subject?.trim() || "(no subject)",
    href:
      item.kind === "draft"
        ? getEmailListItemHref(item)
        : getEmailItemHref(item.inboxId, item.id),
    detail: item.from?.trim() || null,
  }));
}
