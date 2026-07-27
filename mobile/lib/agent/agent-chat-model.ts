import * as SecureStore from "expo-secure-store";

export type AgentChatModelOption = {
  id: string;
  displayName: string;
};

const STORAGE_KEY = "backsteros-mobile.agent-chat-model";
const DEFAULT_MODEL_ID = "auto";

let cachedModelId: string | null = null;

export function readAgentChatModelIdCached(): string {
  return cachedModelId ?? DEFAULT_MODEL_ID;
}

export async function hydrateAgentChatModelId(): Promise<string> {
  try {
    const raw = (await SecureStore.getItemAsync(STORAGE_KEY))?.trim();
    cachedModelId = raw || DEFAULT_MODEL_ID;
    return cachedModelId;
  } catch {
    cachedModelId = DEFAULT_MODEL_ID;
    return DEFAULT_MODEL_ID;
  }
}

export async function writeAgentChatModelId(modelId: string): Promise<void> {
  const id = modelId.trim() || DEFAULT_MODEL_ID;
  cachedModelId = id;
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function formatAgentModelTriggerLabel(
  model: AgentChatModelOption | null | undefined,
  fallbackId?: string,
): string {
  const name = model?.displayName?.trim() || model?.id || fallbackId || "Auto";
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim() || "Auto";
}
