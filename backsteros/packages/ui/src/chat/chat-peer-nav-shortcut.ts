/**
 * ⌥J / ⌥K and ⌥← / ⌥→ — previous / next peer in the chat header strip.
 * Match by `code`: with Option held, `key` is often a special character on macOS.
 * Plain j/k stay list navigation (those handlers reject altKey).
 * ⌥← / ⌥→ are word jumps in text fields, so they only switch peers when focus
 * is not in an editable element.
 */

export type ChatPeerNavDirection = "left" | "right";

export function resolveChatPeerNavShortcut(
  event: Pick<
    KeyboardEvent,
    "altKey" | "metaKey" | "ctrlKey" | "shiftKey" | "code" | "repeat"
  >,
  options: { inEditable?: boolean } = {},
): ChatPeerNavDirection | null {
  if (event.repeat) return null;
  if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) {
    return null;
  }
  if (event.code === "KeyJ") return "left";
  if (event.code === "KeyK") return "right";
  if (options.inEditable) return null;
  if (event.code === "ArrowLeft") return "left";
  if (event.code === "ArrowRight") return "right";
  return null;
}

/** Text inputs, textareas, and contenteditable hosts (composer). */
export function isEditableKeyTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (target as HTMLInputElement).type;
  return !["button", "checkbox", "radio", "submit", "reset", "range"].includes(
    type,
  );
}

export function resolveAdjacentChatPeerId(
  peers: readonly { id: string }[],
  activePeerId: string | null,
  direction: ChatPeerNavDirection,
): string | null {
  if (peers.length < 2) return null;
  const index = peers.findIndex((peer) => peer.id === activePeerId);
  const current = index >= 0 ? index : 0;
  const delta = direction === "left" ? -1 : 1;
  const next = (current + delta + peers.length) % peers.length;
  return peers[next]?.id ?? null;
}

/** True when the shell right chat column exists and is collapsed. */
export function isShellChatPanelCollapsed(): boolean {
  if (typeof document === "undefined") return false;
  const panel = document.querySelector(".desktop-chat-panel");
  if (!panel) return false;
  return (
    panel.classList.contains("is-collapsed") ||
    panel.getAttribute("data-chat-panel-collapsed") === "true"
  );
}
