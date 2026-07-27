/** T3 `CHAT_LIST_ANCHOR_OFFSET` — pin the new user turn slightly below the top edge. */
export { CHAT_LIST_ANCHOR_OFFSET } from "./t3-port/chat-list";

/** Fallback if `scrollend` never fires after a smooth pin (T3 ChatView). */
export const ANCHOR_SCROLL_SETTLE_FALLBACK_MS = 750;

/** Debounce before showing the scroll-to-end pill (T3 Debouncer wait). */
export const SCROLL_TO_END_SHOW_DEBOUNCE_MS = 150;

export type AgentChatScrollMode =
  | "following-end"
  | "anchoring-new-turn"
  | "free-scrolling";

/**
 * Tiny local stand-in for T3’s TanStack Debouncer: schedule `onFire` once after
 * `waitMs` from the first `maybeExecute`; `cancel` drops a pending show.
 */
export function createShowDebouncer(
  onFire: () => void,
  waitMs: number = SCROLL_TO_END_SHOW_DEBOUNCE_MS,
): { maybeExecute: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    maybeExecute() {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        onFire();
      }, waitMs);
    },
    cancel() {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
    },
  };
}
