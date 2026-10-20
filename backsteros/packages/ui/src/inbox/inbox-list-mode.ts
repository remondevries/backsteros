import {
  isAgentInboxPending,
  type InboxListItem,
} from "./inbox-items.js";

export const inboxListModes = ["notifications", "agents"] as const;

export type InboxListMode = (typeof inboxListModes)[number];

export const DEFAULT_INBOX_LIST_MODE: InboxListMode = "notifications";

export const INBOX_LIST_MODE_OPTIONS: ReadonlyArray<{
  value: InboxListMode;
  label: string;
  shortcut?: string;
}> = [
  { value: "notifications", label: "Notifications", shortcut: "1" },
  { value: "agents", label: "Agents", shortcut: "2" },
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

/** True when the row belongs in the Agents list (pending agent sign-off). */
export function inboxItemIsAgentMode(item: InboxListItem): boolean {
  if (item.kind !== "task") return false;
  return isAgentInboxPending(item);
}

/** Filter inbox rows for the Notifications / Agents side-panel mode. */
export function filterInboxItemsByListMode(
  items: readonly InboxListItem[],
  mode: InboxListMode,
): InboxListItem[] {
  if (mode === "agents") {
    return items.filter(inboxItemIsAgentMode);
  }
  return items.filter((item) => !inboxItemIsAgentMode(item));
}
