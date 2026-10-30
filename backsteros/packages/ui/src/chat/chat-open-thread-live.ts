/**
 * Helpers for applying cloud shell-chat SSE pushes to the open desktop thread.
 */

export function isOpenChatThreadEvent(
  openThreadId: string | null | undefined,
  eventThreadId: string | null | undefined,
): boolean {
  const open = openThreadId?.trim() || "";
  const event = eventThreadId?.trim() || "";
  return open.length > 0 && open === event;
}

/**
 * Whether an agent.chat.status / agent.chat.message push should refresh the
 * open thread body (new assistant message and/or clear thinking).
 */
export function shouldRefreshOpenChatThreadOnPush(input: {
  openThreadId: string | null | undefined;
  eventThreadId: string | null | undefined;
  /** Message push always refreshes; status only on idle (reply / done). */
  kind: "message" | "status";
  status?: "working" | "idle" | null;
}): boolean {
  if (!isOpenChatThreadEvent(input.openThreadId, input.eventThreadId)) {
    return false;
  }
  if (input.kind === "message") return true;
  return input.status === "idle";
}
