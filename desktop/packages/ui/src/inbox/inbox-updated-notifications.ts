import type { InboxUpdatedNotificationPayload } from "@backsteros/contracts";
import {
  buildInboxUpdatedEmailNotification,
  buildInboxUpdatedMeetingNotification,
  buildInboxUpdatedTaskNotification,
} from "@backsteros/contracts";

import { formatTaskDisplayId, INBOX_TASK_KEY } from "../tasks/task-display-id.js";
import {
  getInboxAttentionGroupKey,
  getInboxItemDisplayId,
  getInboxItemHref,
  parseMeetingInboxItemId,
  type InboxEmailListItem,
  type InboxListItem,
  type InboxMeetingListItem,
  type InboxTaskListItem,
} from "./inbox-items.js";

type InboxUpdatedNotifiableItem =
  | InboxTaskListItem
  | InboxEmailListItem
  | InboxMeetingListItem;

function isInboxUpdatedNotifiableItem(
  item: InboxListItem,
): item is InboxUpdatedNotifiableItem {
  return item.kind !== "letter";
}

export function inboxUpdatedItemStableId(item: InboxListItem): string {
  if (item.kind === "email") {
    return `${item.inboxId}:${item.messageId}`;
  }
  if (item.kind === "meeting") {
    return parseMeetingInboxItemId(item.id) ?? item.id;
  }
  return item.id;
}

export function buildInboxUpdatedNotification(
  item: InboxUpdatedNotifiableItem,
  items: readonly InboxListItem[] = [],
): InboxUpdatedNotificationPayload | null {
  if (getInboxAttentionGroupKey(item) !== "updated") return null;

  if (item.kind === "email") {
    return buildInboxUpdatedEmailNotification({
      inboxId: item.inboxId,
      messageId: item.messageId,
      subject: item.title,
      partyLabel: item.partyLabel,
      href: getInboxItemHref(item, items),
    });
  }

  if (item.kind === "meeting") {
    const meetingId = parseMeetingInboxItemId(item.id) ?? item.id;
    return buildInboxUpdatedMeetingNotification({
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
  return buildInboxUpdatedTaskNotification({
    id: item.id,
    title: item.title,
    displayId,
    href: getInboxItemHref(item, items),
  });
}

export function collectInboxUpdatedArrivals(input: {
  previousKeys: ReadonlySet<string>;
  items: readonly InboxListItem[];
  referenceDate?: Date;
}): InboxUpdatedNotificationPayload[] {
  const out: InboxUpdatedNotificationPayload[] = [];
  const seen = new Set<string>();

  for (const item of input.items) {
    if (!isInboxUpdatedNotifiableItem(item)) continue;
    if (getInboxAttentionGroupKey(item, input.referenceDate) !== "updated") continue;
    const stableId = inboxUpdatedItemStableId(item);
    if (input.previousKeys.has(stableId) || seen.has(stableId)) continue;
    const notification = buildInboxUpdatedNotification(item, input.items);
    if (!notification) continue;
    seen.add(stableId);
    out.push(notification);
  }

  return out;
}

export function snapshotInboxUpdatedKeys(
  items: readonly InboxListItem[],
  referenceDate: Date = new Date(),
): Set<string> {
  const keys = new Set<string>();
  for (const item of items) {
    if (!isInboxUpdatedNotifiableItem(item)) continue;
    if (getInboxAttentionGroupKey(item, referenceDate) !== "updated") continue;
    keys.add(inboxUpdatedItemStableId(item));
  }
  return keys;
}
