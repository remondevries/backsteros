/**
 * Pure helpers for chat multi-select delete mode (header gear → Delete messages).
 */

export function toggleChatMessageSelection(
  selectedIds: ReadonlySet<string>,
  messageId: string,
): Set<string> {
  const next = new Set(selectedIds);
  if (next.has(messageId)) next.delete(messageId);
  else next.add(messageId);
  return next;
}

export function chatSelectModeCountLabel(count: number): string {
  if (count <= 0) return "0 selected";
  if (count === 1) return "1 selected";
  return `${count} selected`;
}

/** Messages that can be checked / deleted (exclude system status rows). */
export function isChatMessageSelectable(role: string): boolean {
  return role === "user" || role === "assistant";
}
