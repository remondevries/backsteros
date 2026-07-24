import { INBOX_TASK_KEY, formatTaskDisplayId } from "./task-display-id.js";
import {
  getTaskStatusLabel,
  isTaskStatus,
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "./task-status.js";

/** Attention inbox section order: hold → review → in progress (last). */
export const INBOX_ATTENTION_STATUS_ORDER = [
  "on_hold",
  "in_review",
  "in_progress",
] as const satisfies readonly TaskStatus[];

export type InboxAttentionStatus =
  (typeof INBOX_ATTENTION_STATUS_ORDER)[number];

export type InboxTaskListItem = {
  kind: "task";
  id: string;
  title: string;
  status: string;
  number: number;
  projectId: string | null;
  projectKey: string | null;
  projectName: string | null;
  projectIcon: string | null;
  contactKey: string | null;
  assigneeId: string | null;
  priority: number;
  dueDate: number | null;
  updatedAt: number;
  description?: string | null;
};

export type InboxLetterListItem = {
  kind: "letter";
  id: string;
  title: string;
  number: number;
  icon: string | null;
  projectId: string | null;
  projectKey: string | null;
  projectName: string | null;
  projectIcon: string | null;
  updatedAt: number;
};

export type InboxListItem = InboxTaskListItem | InboxLetterListItem;

export function encodeTaskSlug(contextKey: string, taskNumber: number): string {
  return `${contextKey.toLowerCase()}-${taskNumber}`;
}

export function getInboxTaskRouteSlugForTask(input: {
  number: number;
  projectKey?: string | null;
  contactKey?: string | null;
}): string {
  const contextKey = input.projectKey || input.contactKey || INBOX_TASK_KEY;
  return encodeTaskSlug(contextKey, input.number);
}

export function getInboxTaskRouteHref(input: {
  number: number;
  projectKey?: string | null;
  contactKey?: string | null;
}): string {
  return `/inbox/${getInboxTaskRouteSlugForTask(input)}`;
}

export function buildInboxTaskListItem(input: {
  id: string;
  title: string;
  number: number;
  status: string;
  priority?: number;
  dueDate?: number | null;
  updatedAt?: number;
  description?: string | null;
  projectId?: string | null;
  projectKey?: string | null;
  projectName?: string | null;
  projectIcon?: string | null;
  assigneeId?: string | null;
}): InboxTaskListItem {
  return {
    kind: "task",
    id: input.id,
    title: input.title,
    status: input.status,
    number: input.number,
    projectId: input.projectId ?? null,
    projectKey: input.projectKey ?? null,
    projectName: input.projectName ?? null,
    projectIcon: input.projectIcon ?? null,
    contactKey: null,
    assigneeId: input.assigneeId ?? null,
    priority: input.priority ?? 0,
    dueDate: input.dueDate ?? null,
    updatedAt: input.updatedAt ?? Date.now(),
    description: input.description ?? null,
  };
}

export function getInboxItemRouteSlug(item: InboxListItem): string {
  if (item.kind === "letter") {
    return `ltr-${item.number}`;
  }

  return getInboxTaskRouteSlugForTask({
    number: item.number,
    projectKey: item.projectKey,
    contactKey: item.contactKey,
  });
}

/**
 * Inbox list href. When two items share a display slug, use the task id.
 */
export function getInboxItemHref(
  item: InboxListItem,
  items: readonly InboxListItem[] = [],
): string {
  if (item.kind === "letter") {
    return `/letters/${item.id}`;
  }

  const slug = getInboxItemRouteSlug(item);
  const hasSlugCollision = items.some(
    (other) => other.id !== item.id && getInboxItemRouteSlug(other) === slug,
  );

  if (hasSlugCollision) {
    return `/inbox/${item.id}`;
  }

  return getInboxTaskRouteHref({
    number: item.number,
    projectKey: item.projectKey,
    contactKey: item.contactKey,
  });
}

export function getFirstInboxItemHref(
  items: readonly InboxListItem[],
): string | undefined {
  const first = items[0];
  return first ? getInboxItemHref(first, items) : undefined;
}

export function findInboxItemBySlugOrId(
  items: readonly InboxListItem[],
  slugOrId: string,
): InboxListItem | undefined {
  const byId = items.find((item) => item.id === slugOrId);
  if (byId) return byId;

  return items.find((item) => {
    const slug = getInboxItemRouteSlug(item);
    return (
      slugOrId === slug || slugOrId.toLowerCase() === slug.toLowerCase()
    );
  });
}

export function getInboxItemDisplayId(item: InboxListItem): string {
  if (item.kind === "letter") {
    return `LTR-${item.number}`;
  }
  const key = item.projectKey || item.contactKey || INBOX_TASK_KEY;
  return formatTaskDisplayId(key, item.number);
}

export function formatInboxDueDateLabel(dueDateMs: number): string {
  const due = new Date(dueDateMs);
  return due.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function attentionStatusRank(status: string): number {
  const migrated = migrateLegacyTaskStatus(status);
  const index = INBOX_ATTENTION_STATUS_ORDER.indexOf(
    migrated as InboxAttentionStatus,
  );
  return index === -1 ? INBOX_ATTENTION_STATUS_ORDER.length : index;
}

/** Sort tasks into On Hold → In Review → In Progress, then by updatedAt desc. */
export function sortInboxItemsByAttentionStatus(
  items: readonly InboxListItem[],
): InboxListItem[] {
  return [...items].sort((a, b) => {
    if (a.kind !== "task" || b.kind !== "task") {
      if (a.kind === b.kind) return b.updatedAt - a.updatedAt;
      return a.kind === "task" ? -1 : 1;
    }
    const rankDiff =
      attentionStatusRank(a.status) - attentionStatusRank(b.status);
    if (rankDiff !== 0) return rankDiff;
    return b.updatedAt - a.updatedAt;
  });
}

export type InboxAttentionStatusGroup = {
  status: string;
  label: string;
  items: InboxListItem[];
};

/** Group sorted/unsorted inbox tasks into non-empty attention sections. */
export function groupInboxItemsByAttentionStatus(
  items: readonly InboxListItem[],
): InboxAttentionStatusGroup[] {
  const buckets = new Map<string, InboxListItem[]>();
  for (const status of INBOX_ATTENTION_STATUS_ORDER) {
    buckets.set(status, []);
  }
  const other: InboxListItem[] = [];

  for (const item of sortInboxItemsByAttentionStatus(items)) {
    if (item.kind !== "task") {
      other.push(item);
      continue;
    }
    const status = migrateLegacyTaskStatus(item.status);
    const bucket = buckets.get(status);
    if (bucket) {
      bucket.push(item);
    } else {
      other.push(item);
    }
  }

  const groups: InboxAttentionStatusGroup[] = [];
  for (const status of INBOX_ATTENTION_STATUS_ORDER) {
    const groupItems = buckets.get(status) ?? [];
    if (groupItems.length === 0) continue;
    groups.push({
      status,
      label: isTaskStatus(status) ? getTaskStatusLabel(status) : status,
      items: groupItems,
    });
  }
  if (other.length > 0) {
    groups.push({ status: "other", label: "Other", items: other });
  }
  return groups;
}
