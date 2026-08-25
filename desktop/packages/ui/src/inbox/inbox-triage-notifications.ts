import type { InboxTriageNotificationPayload } from "@backsteros/contracts";
import {
  buildInboxTriageEmailNotification,
  buildInboxTriageMeetingNotification,
  buildInboxTriageTaskNotification,
} from "@backsteros/contracts";

import { formatMeetingDisplayId, getCalendarMeetingHref } from "../meetings/meetings.js";
import { formatTaskDisplayId, INBOX_TASK_KEY } from "../tasks/task-display-id.js";
import { withEmailInboxListContext } from "../email/email.js";
import {
  getInboxAttentionGroupKey,
  getInboxItemDisplayId,
  getInboxItemHref,
  getInboxTaskRouteHref,
  parseMeetingInboxItemId,
  type InboxEmailListItem,
  type InboxListItem,
  type InboxMeetingListItem,
  type InboxTaskListItem,
} from "./inbox-items.js";

type InboxTriageNotifiableItem =
  | InboxTaskListItem
  | InboxEmailListItem
  | InboxMeetingListItem;

function isInboxTriageNotifiableItem(
  item: InboxListItem,
): item is InboxTriageNotifiableItem {
  return item.kind !== "letter";
}

export function inboxTriageItemStableId(item: InboxListItem): string {
  if (item.kind === "email") {
    return `${item.inboxId}:${item.messageId}`;
  }
  if (item.kind === "meeting") {
    return parseMeetingInboxItemId(item.id) ?? item.id;
  }
  return item.id;
}

export function buildInboxTriageNotification(
  item: InboxTriageNotifiableItem,
  items: readonly InboxListItem[] = [],
): InboxTriageNotificationPayload | null {
  if (getInboxAttentionGroupKey(item) !== "triage") return null;

  if (item.kind === "email") {
    return buildInboxTriageEmailNotification({
      inboxId: item.inboxId,
      messageId: item.messageId,
      subject: item.title,
      partyLabel: item.partyLabel,
      href: getInboxItemHref(item, items),
    });
  }

  if (item.kind === "meeting") {
    const meetingId = parseMeetingInboxItemId(item.id) ?? item.id;
    return buildInboxTriageMeetingNotification({
      id: meetingId,
      title: item.title,
      displayId: getInboxItemDisplayId(item),
      scheduleLabel: item.scheduleLabel,
      href: getInboxItemHref(item, items),
    });
  }

  const displayId =
    item.number > 0
      ? formatTaskDisplayId(item.projectKey?.trim() || INBOX_TASK_KEY, item.number)
      : null;
  return buildInboxTriageTaskNotification({
    id: item.id,
    title: item.title,
    displayId,
    href: getInboxItemHref(item, items),
  });
}

/**
 * Detect items that newly entered the Triage attention group.
 * Pass `previousKeys` from the last snapshot; empty set skips notifications (initial seed).
 */
export function collectInboxTriageArrivals(input: {
  previousKeys: ReadonlySet<string>;
  items: readonly InboxListItem[];
  referenceDate?: Date;
}): InboxTriageNotificationPayload[] {
  if (input.previousKeys.size === 0) return [];

  const out: InboxTriageNotificationPayload[] = [];
  const seen = new Set<string>();

  for (const item of input.items) {
    if (!isInboxTriageNotifiableItem(item)) continue;
    if (getInboxAttentionGroupKey(item, input.referenceDate) !== "triage") continue;
    const stableId = inboxTriageItemStableId(item);
    if (input.previousKeys.has(stableId) || seen.has(stableId)) continue;
    const notification = buildInboxTriageNotification(item, input.items);
    if (!notification) continue;
    seen.add(stableId);
    out.push(notification);
  }

  return out;
}

/** Snapshot stable ids currently in the Triage group. */
export function snapshotInboxTriageKeys(
  items: readonly InboxListItem[],
  referenceDate: Date = new Date(),
): Set<string> {
  const keys = new Set<string>();
  for (const item of items) {
    if (!isInboxTriageNotifiableItem(item)) continue;
    if (getInboxAttentionGroupKey(item, referenceDate) !== "triage") continue;
    keys.add(inboxTriageItemStableId(item));
  }
  return keys;
}

export function buildInboxTriageEmailNotificationFromListItem(
  item: Extract<InboxListItem, { kind: "email" }>,
): InboxTriageNotificationPayload {
  return buildInboxTriageEmailNotification({
    inboxId: item.inboxId,
    messageId: item.messageId,
    subject: item.title,
    partyLabel: item.partyLabel,
    href: withEmailInboxListContext(
      `/email/${encodeURIComponent(item.inboxId)}/${encodeURIComponent(item.messageId)}`,
    ),
  });
}

export function buildInboxTriageTaskNotificationHref(input: {
  id: string;
  number: number;
  projectKey?: string | null;
  contactKey?: string | null;
}): string {
  if (input.number > 0) {
    return getInboxTaskRouteHref({
      number: input.number,
      projectKey: input.projectKey,
      contactKey: input.contactKey,
    });
  }
  return `/inbox/${input.id}`;
}

export function buildInboxTriageMeetingNotificationHref(meetingId: string): string {
  return getCalendarMeetingHref(meetingId);
}

export function formatMeetingDisplayIdForNotification(number: number): string {
  return formatMeetingDisplayId(number);
}
