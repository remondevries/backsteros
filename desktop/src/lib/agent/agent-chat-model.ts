export type AgentChatModelOption = {
  id: string;
  displayName: string;
};

const STORAGE_KEY = "backsteros-desktop.agent-chat-model";
const DEFAULT_MODEL_ID = "auto";

let cachedModelId: string | null = null;

export function normalizeAgentChatModelId(
  modelId: string | null | undefined,
): string {
  const trimmed = typeof modelId === "string" ? modelId.trim() : "";
  return trimmed || DEFAULT_MODEL_ID;
}

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
  const id = normalizeAgentChatModelId(modelId);
  cachedModelId = id;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

/**
 * Composer chip value: live session pin if present, else global last-picked.
 */
export function resolveEffectiveAgentChatModelId(input: {
  sessionModelId?: string | null;
  globalModelId?: string | null;
}): string {
  const session = input.sessionModelId?.trim();
  if (session) return session;
  return normalizeAgentChatModelId(
    input.globalModelId ?? readAgentChatModelId(),
  );
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
