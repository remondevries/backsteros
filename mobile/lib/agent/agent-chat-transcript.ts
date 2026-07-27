import * as SecureStore from "expo-secure-store";
import type { AgentPtyConnection } from "@backsteros/contracts";

import {
  appendAgentChatTranscriptMessage,
  fetchAgentChatTranscript,
  putAgentChatTranscript,
} from "./agent-pty";

export type AgentChatRole = "user" | "assistant";

export type AgentChatMessage = {
  id: string;
  role: AgentChatRole;
  text: string;
  createdAt: number;
};

export type AgentChatViewMode = "chat" | "terminal";

const TRANSCRIPT_PREFIX = "backsteros-mobile.agent-chat-transcript.";
const VIEW_STORAGE_KEY = "backsteros-mobile.agent-chat-view.codebase";

let cachedViewMode: AgentChatViewMode | null = null;

function transcriptKey(chatId: string): string {
  return `${TRANSCRIPT_PREFIX}${chatId.trim().toLowerCase()}`;
}

function newMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createAgentChatMessage(
  role: AgentChatRole,
  text: string,
): AgentChatMessage {
  return {
    id: newMessageId(),
    role,
    text: text.trim(),
    createdAt: Date.now(),
  };
}

function parseTranscript(raw: string | null): AgentChatMessage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is AgentChatMessage =>
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof (entry as AgentChatMessage).id === "string" &&
          ((entry as AgentChatMessage).role === "user" ||
            (entry as AgentChatMessage).role === "assistant") &&
          typeof (entry as AgentChatMessage).text === "string" &&
          typeof (entry as AgentChatMessage).createdAt === "number",
      )
      .map((entry) => ({
        id: entry.id,
        role: entry.role,
        text: entry.text,
        createdAt: entry.createdAt,
      }));
  } catch {
    return [];
  }
}

export async function loadAgentChatTranscript(
  chatId: string | null | undefined,
): Promise<AgentChatMessage[]> {
  const id = chatId?.trim();
  if (!id) return [];
  try {
    return parseTranscript(await SecureStore.getItemAsync(transcriptKey(id)));
  } catch {
    return [];
  }
}

export async function saveAgentChatTranscript(
  chatId: string | null | undefined,
  messages: readonly AgentChatMessage[],
): Promise<void> {
  const id = chatId?.trim();
  if (!id) return;
  try {
    await SecureStore.setItemAsync(
      transcriptKey(id),
      JSON.stringify(messages),
    );
  } catch {
    /* ignore quota / secure store errors */
  }
}

/**
 * Load shared transcript from the laptop PTY sidecar.
 * Migrates / merges device-local history when the sidecar is missing turns.
 */
export async function syncAgentChatTranscript(
  connection: AgentPtyConnection,
  chatId: string | null | undefined,
): Promise<AgentChatMessage[]> {
  const id = chatId?.trim().toLowerCase();
  if (!id) return [];
  const local = await loadAgentChatTranscript(id);
  const remote = await fetchAgentChatTranscript(connection, id);
  if (!remote.ok) return local;

  const merged = mergeTranscriptMessages(remote.messages, local);
  if (
    merged.length > remote.messages.length ||
    (remote.messages.length === 0 && local.length > 0)
  ) {
    const put = await putAgentChatTranscript(connection, id, merged);
    if (put.ok) {
      await saveAgentChatTranscript(id, put.messages);
      return put.messages;
    }
  }

  const next = remote.messages.length > 0 ? remote.messages : merged;
  await saveAgentChatTranscript(id, next);
  return next;
}

function mergeTranscriptMessages(
  a: readonly AgentChatMessage[],
  b: readonly AgentChatMessage[],
): AgentChatMessage[] {
  const byKey = new Map<string, AgentChatMessage>();
  for (const message of [...a, ...b]) {
    const key = `${message.role}:${message.text}`;
    const existing = byKey.get(key);
    if (!existing || message.createdAt < existing.createdAt) {
      byKey.set(key, message);
    }
  }
  return [...byKey.values()].sort((x, y) => x.createdAt - y.createdAt);
}

/** Append one message to the shared sidecar store (best-effort). */
export function publishAgentChatTranscriptMessage(
  connection: AgentPtyConnection | null | undefined,
  chatId: string | null | undefined,
  message: AgentChatMessage,
): void {
  const id = chatId?.trim().toLowerCase();
  if (!id || !connection) return;
  void appendAgentChatTranscriptMessage(connection, id, message);
}

/** Sync read of last known preference (defaults to Terminal). */
export function readAgentChatViewModeCached(): AgentChatViewMode {
  return cachedViewMode ?? "terminal";
}

export async function hydrateAgentChatViewMode(): Promise<AgentChatViewMode> {
  try {
    const raw = await SecureStore.getItemAsync(VIEW_STORAGE_KEY);
    const mode: AgentChatViewMode = raw === "chat" ? "chat" : "terminal";
    cachedViewMode = mode;
    return mode;
  } catch {
    cachedViewMode = "terminal";
    return "terminal";
  }
}

export async function writeAgentChatViewMode(
  mode: AgentChatViewMode,
): Promise<void> {
  cachedViewMode = mode;
  try {
    await SecureStore.setItemAsync(VIEW_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}
