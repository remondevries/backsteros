import {
  isAgentInboxPending,
  type InboxListItem,
  type InboxTaskListItem,
} from "./inbox-items.js";

export const inboxListModes = ["notifications", "messages", "agents"] as const;

export type InboxListMode = (typeof inboxListModes)[number];

export const DEFAULT_INBOX_LIST_MODE: InboxListMode = "notifications";

export const INBOX_LIST_MODE_OPTIONS: ReadonlyArray<{
  value: InboxListMode;
  label: string;
  shortcut?: string;
}> = [
  { value: "notifications", label: "Notifications", shortcut: "1" },
  { value: "messages", label: "Messages", shortcut: "2" },
  { value: "agents", label: "Agents", shortcut: "3" },
];

export function isInboxListMode(value: string): value is InboxListMode {
  return (inboxListModes as readonly string[]).includes(value);
}

export function parseInboxListMode(
  value: string | null | undefined,
): InboxListMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized && isInboxListMode(normalized)) {
    return normalized;
  }
  return DEFAULT_INBOX_LIST_MODE;
}

export function inboxListModeLabel(mode: InboxListMode): string {
  return (
    INBOX_LIST_MODE_OPTIONS.find((option) => option.value === mode)?.label ??
    "Notifications"
  );
}

/**
 * `1` → notifications, `2` → messages, `3` → agents.
 */
export function resolveInboxListModeFromShortcutKey(
  key: string,
  modifiers: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
  } = {},
): InboxListMode | null {
  if (
    modifiers.metaKey ||
    modifiers.ctrlKey ||
    modifiers.altKey ||
    modifiers.shiftKey
  ) {
    return null;
  }
  const index = Number.parseInt(key, 10);
  if (!Number.isInteger(index) || index < 1) return null;
  return inboxListModes[index - 1] ?? null;
}

/** True when the row belongs in the Agents list (pending agent sign-off). */
export function inboxItemIsAgentMode(item: InboxListItem): boolean {
  if (item.kind !== "task") return false;
  return isAgentInboxPending(item);
}

/** Any AgentMail email row (excluded from Notifications entirely). */
export function inboxItemIsEmail(item: InboxListItem): boolean {
  return item.kind === "email";
}

/** Support tickets — Communication → Messages beside email / chat. */
export function inboxItemIsSupportMessage(
  item: InboxListItem,
): item is InboxTaskListItem & { support: true } {
  return item.kind === "task" && item.support === true && item.chat !== true;
}

/** Chatwoot conversation rows. */
export function inboxItemIsChatMessage(item: InboxListItem): boolean {
  return item.kind === "task" && item.chat === true;
}

/**
 * Inbox → Messages membership — same product types as Communication →
 * Messages: emails, support tickets, and chats. Never plain inbox/project
 * tasks (IN-… / RL-…).
 */
export function inboxItemIsMessageMode(item: InboxListItem): boolean {
  if (inboxItemIsEmail(item)) return true;
  if (inboxItemIsChatMessage(item)) return true;
  if (inboxItemIsAgentMode(item)) return false;
  return inboxItemIsSupportMessage(item);
}

/**
 * Filter inbox rows for the Notifications / Messages / Agents side-panel mode.
 * Notifications is non-message workspace intake; Messages is the communication
 * universe; Agents is pending agent sign-off.
 */
export function filterInboxItemsByListMode(
  items: readonly InboxListItem[],
  mode: InboxListMode,
): InboxListItem[] {
  if (mode === "agents") {
    return items.filter(inboxItemIsAgentMode);
  }
  if (mode === "messages") {
    return items.filter(inboxItemIsMessageMode);
  }
  return items.filter(
    (item) =>
      !inboxItemIsAgentMode(item) &&
      !inboxItemIsEmail(item) &&
      !inboxItemIsSupportMessage(item) &&
      !inboxItemIsChatMessage(item),
  );
}
