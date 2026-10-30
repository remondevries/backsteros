/**
 * Chat display layout for task mentions: compact chips stay in the bubble;
 * full task cards render once below, outside the bubble, in mention order.
 */
import type {
  ChatUiCardPart,
  ChatUiMessage,
  ChatUiMessagePart,
  ChatUiTaskCardData,
} from "@backsteros/contracts";

import type { MentionCatalog } from "../mentions/mention-menu-types.js";
import { resolveMentionCatalogTask } from "../mentions/resolve-catalog-entry.js";
import { resolveMentionHref } from "../mentions/tokens.js";
import {
  parseMentionToken,
  segmentMarkdownWithMentions,
  type ParsedMentionToken,
} from "../mentions/mention-tokens.js";

export type ChatTaskBelowCard = {
  /** Stable React key / dedupe id (displayId preferred). */
  key: string;
  part: ChatUiCardPart;
};

type TaskMentionSlot = {
  key: string;
  token: Extract<ParsedMentionToken, { kind: "task" }> | null;
  cardPart: ChatUiCardPart | null;
};

function taskDedupeKey(input: {
  displayId?: string | null;
  taskId?: string | null;
}): string | null {
  const displayId = input.displayId?.trim();
  if (displayId) return displayId.toLowerCase();
  const taskId = input.taskId?.trim();
  if (taskId) return taskId.toLowerCase();
  return null;
}

function asTaskCardPart(part: ChatUiMessagePart): ChatUiCardPart | null {
  if (part.type !== "card" || part.cardType !== "task") return null;
  return part;
}

function taskDataFromCardPart(
  part: ChatUiCardPart,
): ChatUiTaskCardData | null {
  const data = part.data;
  if (!data || typeof data !== "object") return null;
  const taskId = data.taskId;
  if (typeof taskId !== "string" || !taskId.trim()) return null;
  return data as ChatUiTaskCardData;
}

function cardPartFromCatalogToken(
  token: Extract<ParsedMentionToken, { kind: "task" }>,
  catalog: MentionCatalog,
): ChatUiCardPart | null {
  const task = resolveMentionCatalogTask(token, catalog);
  if (!task) return null;
  const href = resolveMentionHref(token, catalog) ?? undefined;
  const data: ChatUiTaskCardData = {
    taskId: task.id,
    displayId: task.displayId,
    title: task.title,
    href,
    status: task.status,
    description: task.description,
    priority: task.priority,
    dueDate: task.dueDate,
    projectName: task.projectName,
    projectIcon: task.projectIcon,
  };
  return {
    type: "card",
    cardType: "task",
    id: `task-mention-${task.displayId}`,
    data,
  };
}

/** Task mention tokens in a markdown/plain body, left-to-right. */
export function taskMentionTokensInText(
  text: string,
): Array<Extract<ParsedMentionToken, { kind: "task" }>> {
  const out: Array<Extract<ParsedMentionToken, { kind: "task" }>> = [];
  for (const segment of segmentMarkdownWithMentions(text)) {
    if (segment.type !== "mention" || segment.token.kind !== "task") continue;
    out.push(segment.token);
  }
  return out;
}

/**
 * Parts that stay inside the message bubble — task cards are lifted out.
 * Other card types (contact, project, …) stay inline for now.
 */
export function chatMessageBubbleParts(
  parts: readonly ChatUiMessagePart[],
): ChatUiMessagePart[] {
  return parts.filter((part) => asTaskCardPart(part) == null);
}

/**
 * Unique task cards to render below the bubble, in first-seen mention order.
 * Prefers an explicit `card` part's data; otherwise builds from the mention
 * catalog. Mentions with neither catalog data nor a card part are skipped
 * below (the inline chip in the bubble still renders).
 */
export function collectChatTaskCardsBelow(
  message: ChatUiMessage,
  catalog: MentionCatalog | null = null,
): ChatTaskBelowCard[] {
  const slots: TaskMentionSlot[] = [];
  const indexByKey = new Map<string, number>();

  const ensureSlot = (key: string): TaskMentionSlot => {
    const existing = indexByKey.get(key);
    if (existing != null) return slots[existing]!;
    const slot: TaskMentionSlot = { key, token: null, cardPart: null };
    indexByKey.set(key, slots.length);
    slots.push(slot);
    return slot;
  };

  for (const part of message.parts) {
    if (part.type === "text") {
      for (const token of taskMentionTokensInText(part.text)) {
        const key = taskDedupeKey({ displayId: token.displayId });
        if (!key) continue;
        const slot = ensureSlot(key);
        if (!slot.token) slot.token = token;
      }
      continue;
    }

    const taskPart = asTaskCardPart(part);
    if (!taskPart) continue;
    const data = taskDataFromCardPart(taskPart);
    const key = taskDedupeKey({
      displayId: data?.displayId,
      taskId: data?.taskId,
    });
    if (!key) continue;
    const slot = ensureSlot(key);
    // First explicit card part wins for payload richness.
    if (!slot.cardPart) slot.cardPart = taskPart;
  }

  const out: ChatTaskBelowCard[] = [];
  for (const slot of slots) {
    if (slot.cardPart) {
      out.push({ key: slot.key, part: slot.cardPart });
      continue;
    }
    if (slot.token && catalog) {
      const fromCatalog = cardPartFromCatalogToken(slot.token, catalog);
      if (fromCatalog) out.push({ key: slot.key, part: fromCatalog });
    }
  }
  return out;
}

/** Clipboard text for a task card part — raw mention token when possible. */
export function taskCardPlainText(part: ChatUiCardPart): string {
  if (part.cardType !== "task") return part.cardType;
  const data = taskDataFromCardPart(part);
  const displayId = data?.displayId?.trim() || data?.taskId?.trim();
  return displayId ? `[@task:${displayId}]` : "";
}

/** Parse a raw `[@task:…]` string; null if not a task mention. */
export function parseTaskMentionToken(
  raw: string,
): Extract<ParsedMentionToken, { kind: "task" }> | null {
  const parsed = parseMentionToken(raw);
  return parsed?.kind === "task" ? parsed : null;
}
