/**
 * Persist AgentMail messages the user removed that AgentMail itself cannot
 * delete (orphan thread_id → Thread not found on DELETE/PATCH).
 *
 * Stored in workspace_settings.settings.agentmailHiddenMessages so list rows
 * stay gone across refresh without a schema migration.
 */

import {
  getSettings,
  updateSettings,
} from "../crm-domain/workspace-settings.js";

export type AgentMailHiddenMessage = {
  inboxId: string;
  messageId: string;
  threadId: string | null;
  hiddenAt: string;
};

const SETTINGS_KEY = "agentmailHiddenMessages";
const MAX_HIDES = 2000;

function asHideList(value: unknown): AgentMailHiddenMessage[] {
  if (!Array.isArray(value)) return [];
  const out: AgentMailHiddenMessage[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const inboxId =
      typeof row.inboxId === "string" ? row.inboxId.trim() : "";
    const messageId =
      typeof row.messageId === "string" ? row.messageId.trim() : "";
    if (!inboxId || !messageId) continue;
    out.push({
      inboxId,
      messageId,
      threadId:
        typeof row.threadId === "string" && row.threadId.trim()
          ? row.threadId.trim()
          : null,
      hiddenAt:
        typeof row.hiddenAt === "string" && row.hiddenAt.trim()
          ? row.hiddenAt.trim()
          : new Date().toISOString(),
    });
  }
  return out;
}

export function agentMailHideMessageKey(
  inboxId: string,
  messageId: string,
): string {
  return `${inboxId.trim().toLowerCase()}\0${messageId.trim()}`;
}

export function agentMailHideThreadKey(
  inboxId: string,
  threadId: string,
): string {
  return `${inboxId.trim().toLowerCase()}\0thread:${threadId.trim()}`;
}

export async function rememberAgentMailHiddenMessages(
  workspaceId: string,
  hides: ReadonlyArray<{
    inboxId: string;
    messageId: string;
    threadId?: string | null;
  }>,
): Promise<void> {
  if (!workspaceId.trim() || hides.length === 0) return;

  const current = (await getSettings(workspaceId)) as Record<string, unknown>;
  const existing = asHideList(current[SETTINGS_KEY]);
  const byKey = new Map(
    existing.map((row) => [
      agentMailHideMessageKey(row.inboxId, row.messageId),
      row,
    ]),
  );
  const now = new Date().toISOString();

  for (const hide of hides) {
    const inboxId = hide.inboxId.trim();
    const messageId = hide.messageId.trim();
    if (!inboxId || !messageId) continue;
    byKey.set(agentMailHideMessageKey(inboxId, messageId), {
      inboxId,
      messageId,
      threadId: hide.threadId?.trim() || null,
      hiddenAt: now,
    });
  }

  const next = [...byKey.values()]
    .sort((a, b) => a.hiddenAt.localeCompare(b.hiddenAt))
    .slice(-MAX_HIDES);

  await updateSettings(workspaceId, { [SETTINGS_KEY]: next });
}

export async function loadAgentMailHiddenLookup(workspaceId: string): Promise<{
  messageKeys: Set<string>;
  threadKeys: Set<string>;
}> {
  const current = (await getSettings(workspaceId)) as Record<string, unknown>;
  const hides = asHideList(current[SETTINGS_KEY]);
  const messageKeys = new Set<string>();
  const threadKeys = new Set<string>();
  for (const row of hides) {
    messageKeys.add(agentMailHideMessageKey(row.inboxId, row.messageId));
    if (row.threadId) {
      threadKeys.add(agentMailHideThreadKey(row.inboxId, row.threadId));
    }
  }
  return { messageKeys, threadKeys };
}

export function isAgentMailMessageHidden(
  lookup: { messageKeys: Set<string>; threadKeys: Set<string> },
  item: { inboxId: string; messageId: string; threadId?: string | null },
): boolean {
  const inboxId = item.inboxId.trim();
  const messageId = item.messageId.trim();
  if (
    inboxId &&
    messageId &&
    lookup.messageKeys.has(agentMailHideMessageKey(inboxId, messageId))
  ) {
    return true;
  }
  const threadId = item.threadId?.trim() || "";
  if (
    inboxId &&
    threadId &&
    lookup.threadKeys.has(agentMailHideThreadKey(inboxId, threadId))
  ) {
    return true;
  }
  return false;
}
