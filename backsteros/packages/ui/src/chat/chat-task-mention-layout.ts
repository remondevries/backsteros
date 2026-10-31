/**
 * Chat display layout for task mentions: each task renders once as a full
 * card below the bubble. Matching `[@task:…]` tokens are stripped from the
 * bubble text so they never also appear as inline chips.
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
import { parseTaskSlug } from "../navigation/resolve-history-entry-display.js";
import { getScopedProjectTaskHref } from "../projects/project-route-scope.js";
import { getInboxTaskRouteHref } from "../inbox/inbox-items.js";
import { INBOX_TASK_KEY } from "../tasks/task-display-id.js";

export type ChatTaskBelowCard = {
  /** Stable React key / dedupe id (displayId preferred). */
  key: string;
  part: ChatUiCardPart;
  /**
   * True when we only have a stub (mention token) and have not resolved
   * workspace/catalog data yet — UI may show a looking-up state.
   */
  unresolved: boolean;
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

export function cardPartFromCatalogToken(
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

/** Href guess from `OS-144` / `IN-12` when catalog lookup missed. */
export function hrefFromTaskDisplayId(displayId: string): string | undefined {
  const slug = parseTaskSlug(displayId);
  if (!slug) return undefined;
  if (slug.contextKey.toUpperCase() === INBOX_TASK_KEY) {
    return getInboxTaskRouteHref({ number: slug.number });
  }
  return getScopedProjectTaskHref(slug.contextKey, slug.number);
}

/** Stub card so the below-slot always renders for a mention. */
export function fallbackTaskCardPart(
  token: Extract<ParsedMentionToken, { kind: "task" }>,
  options?: { lookingUp?: boolean },
): ChatUiCardPart {
  const displayId = token.displayId;
  return {
    type: "card",
    cardType: "task",
    id: `task-mention-${displayId}`,
    data: {
      taskId: displayId,
      displayId,
      title: displayId,
      href: hrefFromTaskDisplayId(displayId),
      description: options?.lookingUp === false ? "Task not found" : "Looking up…",
      status: "triage",
      priority: 0,
    },
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

/** All unique task mention tokens on a message, in first-seen order. */
export function taskMentionTokensInMessage(
  message: ChatUiMessage,
): Array<Extract<ParsedMentionToken, { kind: "task" }>> {
  const seen = new Set<string>();
  const out: Array<Extract<ParsedMentionToken, { kind: "task" }>> = [];
  for (const part of message.parts) {
    if (part.type !== "text") continue;
    for (const token of taskMentionTokensInText(part.text)) {
      const key = token.displayId.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(token);
    }
  }
  return out;
}

/**
 * Remove `[@task:…]` tokens whose display ids are in `displayIds` (lowercased),
 * then tidy leftover whitespace / a dangling trailing colon / empty paragraphs.
 */
export function stripTaskMentionsFromText(
  text: string,
  displayIds: ReadonlySet<string>,
): string {
  if (!text || displayIds.size === 0) return text;

  const pieces: string[] = [];
  for (const segment of segmentMarkdownWithMentions(text)) {
    if (
      segment.type === "mention" &&
      segment.token.kind === "task" &&
      displayIds.has(segment.token.displayId.trim().toLowerCase())
    ) {
      continue;
    }
    if (segment.type === "markdown") {
      pieces.push(segment.content);
      continue;
    }
    pieces.push(segment.raw);
  }

  let out = pieces.join("");
  // Collapse horizontal whitespace; keep newlines for paragraph structure.
  out = out.replace(/[^\S\n]+/g, " ");
  // Drop spaces left hanging before sentence punctuation.
  out = out.replace(/ +([.,;:!?])/g, "$1");
  // Trim spaces around newlines, then drop empty paragraphs.
  out = out.replace(/ *\n */g, "\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.trim();
  // "Here it is, Remon:" after a trailing mention → "Here it is, Remon"
  out = out.replace(/:\s*$/u, "").trim();
  return out;
}

export type ChatMessageBubblePartsOptions = {
  /**
   * Lowercased task display ids that already have a card below the bubble —
   * strip matching tokens from bubble text so the task is not shown twice.
   */
  stripTaskDisplayIds?: ReadonlySet<string> | null;
};

/**
 * Parts that stay inside the message bubble — task cards are lifted out, and
 * text mentions for below-cards are stripped. Empty text parts are dropped.
 */
export function chatMessageBubbleParts(
  parts: readonly ChatUiMessagePart[],
  options?: ChatMessageBubblePartsOptions | null,
): ChatUiMessagePart[] {
  const stripIds = options?.stripTaskDisplayIds ?? null;
  const out: ChatUiMessagePart[] = [];
  for (const part of parts) {
    if (asTaskCardPart(part) != null) continue;
    if (part.type === "text" && stripIds && stripIds.size > 0) {
      const text = stripTaskMentionsFromText(part.text, stripIds);
      if (!text.trim()) continue;
      out.push(text === part.text ? part : { ...part, text });
      continue;
    }
    out.push(part);
  }
  return out;
}

export type CollectChatTaskCardsBelowOptions = {
  catalog?: MentionCatalog | null;
  /**
   * Extra resolutions keyed by lowercased display id (e.g. workspace
   * allTasks lookup). Wins over catalog stubs; loses to explicit card parts.
   */
  resolvedByDisplayId?: ReadonlyMap<string, ChatUiCardPart> | null;
  /**
   * When true, unresolved stubs say "Looking up…"; when false, "Task not found".
   * Default true.
   */
  lookingUp?: boolean;
};

/**
 * Unique task cards to render below the bubble, in first-seen mention order.
 * Prefers an explicit `card` part, then workspace/API resolution, then the
 * mention catalog, then a stub so the slot is never empty for a mention.
 */
export function collectChatTaskCardsBelow(
  message: ChatUiMessage,
  catalogOrOptions: MentionCatalog | null | CollectChatTaskCardsBelowOptions = null,
): ChatTaskBelowCard[] {
  const options: CollectChatTaskCardsBelowOptions =
    catalogOrOptions != null &&
    typeof catalogOrOptions === "object" &&
    ("catalog" in catalogOrOptions ||
      "resolvedByDisplayId" in catalogOrOptions ||
      "lookingUp" in catalogOrOptions)
      ? catalogOrOptions
      : { catalog: catalogOrOptions as MentionCatalog | null };

  const catalog = options.catalog ?? null;
  const resolvedByDisplayId = options.resolvedByDisplayId ?? null;
  const lookingUp = options.lookingUp !== false;

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
    if (!slot.cardPart) slot.cardPart = taskPart;
  }

  const out: ChatTaskBelowCard[] = [];
  for (const slot of slots) {
    if (slot.cardPart) {
      out.push({ key: slot.key, part: slot.cardPart, unresolved: false });
      continue;
    }
    const fromResolved = resolvedByDisplayId?.get(slot.key) ?? null;
    if (fromResolved) {
      out.push({ key: slot.key, part: fromResolved, unresolved: false });
      continue;
    }
    if (slot.token && catalog) {
      const fromCatalog = cardPartFromCatalogToken(slot.token, catalog);
      if (fromCatalog) {
        out.push({ key: slot.key, part: fromCatalog, unresolved: false });
        continue;
      }
    }
    if (slot.token) {
      out.push({
        key: slot.key,
        part: fallbackTaskCardPart(slot.token, { lookingUp }),
        unresolved: true,
      });
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
