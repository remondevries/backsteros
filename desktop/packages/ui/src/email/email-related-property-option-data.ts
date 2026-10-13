import { formatEmailDisplayId } from "./email-display-id.js";
import {
  collapseEmailListItemsByThread,
  getEmailItemHref,
  type EmailListItem,
} from "./email.js";

export type EmailRelatedPropertyOption = {
  value: string;
  label: string;
  secondaryLabel?: string;
  searchTerms: string;
  href: string;
};

/**
 * Related-property picker rows: one per registered email thread.
 */
export function buildEmailRelatedPropertyOptionData(
  messages: readonly EmailListItem[],
): EmailRelatedPropertyOption[] {
  const collapsed = collapseEmailListItemsByThread(messages);
  const options: EmailRelatedPropertyOption[] = [];
  const seen = new Set<string>();
  for (const item of collapsed) {
    if (item.kind === "draft") continue;
    const threadId = item.emailThreadId?.trim();
    if (!threadId || seen.has(threadId)) continue;
    seen.add(threadId);
    const displayId =
      item.displayId?.trim() ||
      (item.number != null ? formatEmailDisplayId(item.number) : null);
    const subject = item.subject?.trim() || displayId || "Untitled email";
    options.push({
      value: threadId,
      label: subject,
      secondaryLabel: displayId && displayId !== subject ? displayId : undefined,
      searchTerms: [subject, displayId, item.from].filter(Boolean).join(" "),
      href: getEmailItemHref(item.inboxId, item.id),
    });
  }
  return options;
}
