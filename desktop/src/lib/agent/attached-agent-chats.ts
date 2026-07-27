/**
 * Soft attach map: taskId → Cursor chat id last bound into the task PTY.
 * Survives UI detach so View agent / remount can reattach without a new chat.
 */
const STORAGE_KEY = "backsteros-desktop.attached-agent-chats";

export function readAttachedAgentChats(): Map<string, string> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out = new Map<string, string>();
    for (const [taskId, chatId] of Object.entries(parsed)) {
      if (typeof chatId !== "string") continue;
      const normalized = chatId.trim().toLowerCase();
      if (normalized) out.set(taskId, normalized);
    }
    return out;
  } catch {
    return new Map();
  }
}

export function writeAttachedAgentChats(map: Map<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(map)),
    );
  } catch {
    /* ignore */
  }
}

export function setAttachedAgentChat(
  taskId: string,
  chatId: string | null,
): Map<string, string> {
  const next = readAttachedAgentChats();
  if (!chatId?.trim()) {
    next.delete(taskId);
  } else {
    next.set(taskId, chatId.trim().toLowerCase());
  }
  writeAttachedAgentChats(next);
  return next;
}
