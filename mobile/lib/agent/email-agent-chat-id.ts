import * as SecureStore from "expo-secure-store";

const EMAIL_AGENT_CHAT_STORAGE_PREFIX = "backsteros-mobile.email-agent-chat.";

const chatIdMemory = new Map<string, string>();

function chatStorageKey(taskId: string): string {
  return `${EMAIL_AGENT_CHAT_STORAGE_PREFIX}${taskId.trim()}`;
}

export async function readEmailAgentChatId(
  taskId: string,
): Promise<string | null> {
  const id = taskId.trim();
  if (!id) return null;
  const cached = chatIdMemory.get(id);
  if (cached) return cached;
  try {
    const raw = (await SecureStore.getItemAsync(chatStorageKey(id)))?.trim();
    if (raw) {
      chatIdMemory.set(id, raw);
      return raw;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function writeEmailAgentChatId(
  taskId: string,
  chatId: string | null,
): Promise<void> {
  const id = taskId.trim();
  if (!id) return;
  const key = chatStorageKey(id);
  const next = chatId?.trim() || null;
  if (next) chatIdMemory.set(id, next);
  else chatIdMemory.delete(id);
  try {
    if (next) await SecureStore.setItemAsync(key, next);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    /* ignore */
  }
}
