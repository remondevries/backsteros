export type AgentChatModelOption = {
  id: string;
  displayName: string;
};

const STORAGE_KEY = "backsteros-desktop.agent-chat-model";
const DEFAULT_MODEL_ID = "auto";

let cachedModelId: string | null = null;

export function readAgentChatModelId(): string {
  if (cachedModelId) return cachedModelId;
  if (typeof window === "undefined") return DEFAULT_MODEL_ID;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)?.trim();
    cachedModelId = raw || DEFAULT_MODEL_ID;
    return cachedModelId;
  } catch {
    cachedModelId = DEFAULT_MODEL_ID;
    return DEFAULT_MODEL_ID;
  }
}

export function writeAgentChatModelId(modelId: string): void {
  const id = modelId.trim() || DEFAULT_MODEL_ID;
  cachedModelId = id;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

/** Short label for the composer chip (T3-style truncated name). */
export function formatAgentModelTriggerLabel(
  model: AgentChatModelOption | null | undefined,
  fallbackId?: string,
): string {
  const name = model?.displayName?.trim() || model?.id || fallbackId || "Auto";
  // Drop trailing parenthetical notes like "(NO ZDR)" for the chip.
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim() || "Auto";
}
