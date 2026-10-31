/**
 * Stick-to-bottom helpers for ChatThread.
 *
 * assistant-ui's Viewport autoScroll initializes once and follows growth while
 * `followBottom` stays true. Peer switches (ExternalStoreRuntime) do not fire
 * `threadSwitched`, and large markdown can finish laying out after the first
 * scroll — leaving the transcript pinned at the top. These helpers re-pin on
 * peer/message identity changes and while the user remains near the bottom.
 */

export const CHAT_THREAD_NEAR_BOTTOM_PX = 96;

export function isChatViewportNearBottom(
  el: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
  thresholdPx = CHAT_THREAD_NEAR_BOTTOM_PX,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
}

export function scrollChatViewportToBottom(el: HTMLElement): void {
  el.scrollTop = el.scrollHeight;
}

/** Stable fingerprint for “which transcript is showing”. */
export function chatThreadStickAnchor(
  peerId: string | null,
  messages: readonly { readonly id: string }[],
): string {
  if (messages.length === 0) return `${peerId ?? "none"}:empty`;
  const first = messages[0]!.id;
  const last = messages[messages.length - 1]!.id;
  return `${peerId ?? "none"}:${first}:${last}:${messages.length}`;
}
