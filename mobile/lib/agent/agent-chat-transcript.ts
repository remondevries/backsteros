import * as SecureStore from "expo-secure-store";
import type { AgentPtyConnection } from "@backsteros/contracts";

import {
  createAgentChatMessage,
  normalizeAgentChatMessage,
  parseTranscriptMessages,
  type AgentChatMessage,
  type AgentChatRole,
  type AgentChatTurnOutcome,
  type AgentChatTurnStatus,
} from "./agent-chat-message";
import {
  mergeTranscriptMessages,
  repairInvertedUserAssistantPairs,
  transcriptNeedsRemoteUpdate,
} from "./agent-chat-transcript-merge";
import {
  appendAgentChatTranscriptMessage,
  fetchAgentChatTranscript,
  putAgentChatTranscript,
} from "./agent-pty";

export type {
  AgentChatMessage,
  AgentChatRole,
  AgentChatTurnOutcome,
  AgentChatTurnStatus,
};
export type {
  AgentChatActivityItem,
  AgentChatPlanStep,
  AgentChatTurnSegment,
} from "./agent-chat-activity";
export {
  createAgentChatMessage,
  normalizeAgentChatMessage,
  parseTranscriptMessages,
};
export { mergeTranscriptMessages, repairInvertedUserAssistantPairs };

export type AgentChatViewMode = "chat" | "terminal";

const TRANSCRIPT_PREFIX = "backsteros-mobile.agent-chat-transcript.";
const VIEW_STORAGE_KEY = "backsteros-mobile.agent-chat-view.codebase";

let cachedViewMode: AgentChatViewMode | null = null;

function transcriptKey(chatId: string): string {
  return `${TRANSCRIPT_PREFIX}${chatId.trim().toLowerCase()}`;
}

function parseTranscript(raw: string | null): AgentChatMessage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return repairInvertedUserAssistantPairs(parseTranscriptMessages(parsed));
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
 * Merges so text-only remotes cannot wipe richer activity timelines.
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
  if (transcriptNeedsRemoteUpdate(remote.messages, merged)) {
    const put = await putAgentChatTranscript(connection, id, merged);
    if (put.ok) {
      await saveAgentChatTranscript(id, put.messages);
      return put.messages;
    }
  }

  await saveAgentChatTranscript(id, merged);
  return merged;
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
