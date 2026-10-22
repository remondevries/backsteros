import { normalizePhoneKey, parseBareEmailAddress } from "@backsteros/contracts";
import type { ChatConversation } from "@backsteros/contracts";

function emailKey(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return parseBareEmailAddress(value);
}

function phoneKey(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const key = normalizePhoneKey(value);
  return key || null;
}

/** True when two chat rows look like the same website visitor. */
export function chatConversationsShareVisitor(
  left: Pick<
    ChatConversation,
    "contactEmail" | "contactPhone" | "contactName"
  >,
  right: Pick<
    ChatConversation,
    "contactEmail" | "contactPhone" | "contactName"
  >,
): boolean {
  const leftEmail = emailKey(left.contactEmail);
  const rightEmail = emailKey(right.contactEmail);
  if (leftEmail && rightEmail && leftEmail === rightEmail) return true;

  const leftPhone = phoneKey(left.contactPhone);
  const rightPhone = phoneKey(right.contactPhone);
  if (leftPhone && rightPhone && leftPhone === rightPhone) return true;

  const leftName = left.contactName?.trim().toLowerCase() ?? "";
  const rightName = right.contactName?.trim().toLowerCase() ?? "";
  if (
    leftName &&
    rightName &&
    leftName === rightName &&
    !leftEmail &&
    !rightEmail &&
    !leftPhone &&
    !rightPhone
  ) {
    return true;
  }
  return false;
}

/** Other threads for the same visitor, newest activity first. */
export function previousChatConversations(
  conversations: readonly ChatConversation[],
  current: Pick<
    ChatConversation,
    "id" | "contactEmail" | "contactPhone" | "contactName"
  >,
): ChatConversation[] {
  return conversations
    .filter(
      (row) =>
        row.id !== current.id && chatConversationsShareVisitor(row, current),
    )
    .sort((left, right) =>
      (right.lastActivityAt ?? right.updatedAt).localeCompare(
        left.lastActivityAt ?? left.updatedAt,
      ),
    );
}
