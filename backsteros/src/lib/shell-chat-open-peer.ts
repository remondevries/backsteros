/**
 * Open the shell chat column on a specific agent peer (contact id).
 * ChatUiDevPreview + chrome listen for this event.
 */

export const SHELL_CHAT_OPEN_PEER_EVENT = "backsteros:shell-chat-open-peer";

export type ShellChatOpenPeerDetail = {
  contactId: string;
};

export function openShellChatPeer(contactId: string): void {
  const id = contactId.trim();
  if (!id || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ShellChatOpenPeerDetail>(SHELL_CHAT_OPEN_PEER_EVENT, {
      detail: { contactId: id },
    }),
  );
}
