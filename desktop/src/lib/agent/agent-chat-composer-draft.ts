import type { AgentChatImageAttachment } from "./agent-chat-transcript";

const STORAGE_PREFIX = "backsteros-desktop.agent-chat-composer-draft.";

export type AgentChatComposerDraft = {
  text: string;
  images: AgentChatImageAttachment[];
};

const emptyDraft = (): AgentChatComposerDraft => ({
  text: "",
  images: [],
});

/** In-memory cache so remounts keep image payloads even if localStorage strips them. */
const memoryDrafts = new Map<string, AgentChatComposerDraft>();

function storageKey(taskId: string): string {
  return `${STORAGE_PREFIX}${taskId}`;
}

function normalizeImages(raw: unknown): AgentChatImageAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentChatImageAttachment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const mimeType =
      typeof record.mimeType === "string" ? record.mimeType.trim() : "";
    if (!id || !name || !mimeType) continue;
    const dataBase64 =
      typeof record.dataBase64 === "string" && record.dataBase64.length > 0
        ? record.dataBase64
        : undefined;
    out.push({ id, name, mimeType, dataBase64 });
  }
  return out;
}

function normalizeDraft(raw: unknown): AgentChatComposerDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text : "";
  return {
    text,
    images: normalizeImages(record.images),
  };
}

function cloneDraft(draft: AgentChatComposerDraft): AgentChatComposerDraft {
  return {
    text: draft.text,
    images: draft.images.map((image) => ({ ...image })),
  };
}

/** Load the unsent composer draft for a task (memory first, then localStorage). */
export function readAgentChatComposerDraft(
  taskId: string | null | undefined,
): AgentChatComposerDraft {
  const id = taskId?.trim();
  if (!id) return emptyDraft();

  const cached = memoryDrafts.get(id);
  if (cached) return cloneDraft(cached);

  if (typeof window === "undefined") return emptyDraft();
  try {
    const raw = window.localStorage.getItem(storageKey(id));
    if (!raw) return emptyDraft();
    const parsed = normalizeDraft(JSON.parse(raw) as unknown);
    if (!parsed) return emptyDraft();
    memoryDrafts.set(id, cloneDraft(parsed));
    return parsed;
  } catch {
    return emptyDraft();
  }
}

function persistToLocalStorage(
  id: string,
  draft: AgentChatComposerDraft,
): void {
  if (typeof window === "undefined") return;
  const key = storageKey(id);
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
    return;
  } catch {
    /* quota — retry without image payloads */
  }
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        text: draft.text,
        images: draft.images.map(({ dataBase64: _data, ...meta }) => meta),
      }),
    );
  } catch {
    try {
      window.localStorage.setItem(
        key,
        JSON.stringify({ text: draft.text, images: [] }),
      );
    } catch {
      /* ignore */
    }
  }
}

/** Persist the unsent composer draft for a task across navigation/remounts. */
export function writeAgentChatComposerDraft(
  taskId: string | null | undefined,
  draft: AgentChatComposerDraft,
): void {
  const id = taskId?.trim();
  if (!id) return;

  const next = {
    text: draft.text,
    images: draft.images.map((image) => ({ ...image })),
  };
  const isEmpty = next.text.length === 0 && next.images.length === 0;
  if (isEmpty) {
    clearAgentChatComposerDraft(id);
    return;
  }

  memoryDrafts.set(id, next);
  persistToLocalStorage(id, next);
}

/** Drop the stored composer draft after send / clear. */
export function clearAgentChatComposerDraft(
  taskId: string | null | undefined,
): void {
  const id = taskId?.trim();
  if (!id) return;
  memoryDrafts.delete(id);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(id));
  } catch {
    /* ignore */
  }
}
