/**
 * ⌘/Ctrl+Enter while the file-task modal is open should only wake the webhook.
 * Shared by the modal capture listener and other global Cmd+Enter handlers.
 */
export function isFileTaskSubmitShortcut(event: {
  readonly key: string;
  readonly repeat: boolean;
  readonly defaultPrevented: boolean;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}): boolean {
  if (event.defaultPrevented || event.repeat) return false;
  if (event.key !== "Enter") return false;
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false;
  return true;
}
