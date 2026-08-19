import { INBOX_TASK_KEY, formatTaskDisplayId } from "./task-display-id.js";
import { formatLocalYmd } from "./task-due-date.js";
import {
  INACTIVE_TASK_STATUSES,
  getTaskDueDateYmd,
  taskDueDateMatchesFilter,
} from "./tasks-due-filters.js";
import {
  getTaskStatusLabel,
  isTaskStatus,
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "./task-status.js";

/**
 * Inbox section order: agents (agent-created sign-off) → overdue → triage → …
 * `agents` and `overdue` are not real task statuses.
 */
export const INBOX_ATTENTION_STATUS_ORDER = [
  "agents",
  "overdue",
  "triage",
  "on_hold",
  "in_review",
] as const;

export type InboxAttentionStatus =
  (typeof INBOX_ATTENTION_STATUS_ORDER)[number];

/**
 * Real statuses that belong in the inbox (from any project), unless their due
 * date is still in the future.
 */
export const INBOX_ATTENTION_REAL_STATUSES = [
  "on_hold",
  "in_review",
] as const satisfies readonly TaskStatus[];

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
  /** Present when known — triage capture uses `inbox === true`. */
  inbox?: boolean | null;
  agentCreatedAt?: number | null;
  agentInboxApprovedAt?: number | null;
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

/** Project tasks tab with the given task focused. */
export function getProjectTaskHref(
  projectKey: string,
  taskNumber: number,
): string {
  return `/projects/${encodeURIComponent(projectKey)}/tasks/${encodeTaskSlug(projectKey, taskNumber)}`;
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
  inbox?: boolean | null;
  agentCreatedAt?: number | Date | string | null;
  agentInboxApprovedAt?: number | Date | string | null;
}): InboxTaskListItem {
  const toEpoch = (value: number | Date | string | null | undefined) => {
    if (value == null || value === "") return null;
    if (typeof value === "number") return value;
    if (value instanceof Date) return value.getTime();
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  };
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
    inbox: input.inbox ?? null,
    agentCreatedAt: toEpoch(input.agentCreatedAt),
    agentInboxApprovedAt: toEpoch(input.agentInboxApprovedAt),
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

/**
 * After dismissing an inbox row (e.g. agent Approve), pick the neighbor to open:
 * prefer the item above, else the next item, else none (empty inbox).
 */
export function pickIdAfterRemoving(
  orderedIds: readonly string[],
  removedId: string,
): string | null {
  const index = orderedIds.indexOf(removedId);
  if (index === -1) {
    return orderedIds.find((id) => id !== removedId) ?? null;
  }
  if (index > 0) {
    return orderedIds[index - 1] ?? null;
  }
  if (index + 1 < orderedIds.length) {
    return orderedIds[index + 1] ?? null;
  }
  return null;
}

/**
 * Href for the inbox selection after removing `removedId` from the current list.
 * `undefined` means the inbox is empty — navigate to the inbox root.
 */
export function getInboxHrefAfterRemovingItem(
  items: readonly InboxListItem[],
  removedId: string,
): string | undefined {
  const nextId = pickIdAfterRemoving(
    items.map((item) => item.id),
    removedId,
  );
  if (!nextId) return undefined;
  const remaining = items.filter((item) => item.id !== removedId);
  const nextItem = remaining.find((item) => item.id === nextId);
  return nextItem ? getInboxItemHref(nextItem, remaining) : undefined;
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

function isInactiveTaskStatus(status: string | undefined): boolean {
  if (!status) return false;
  return (INACTIVE_TASK_STATUSES as readonly string[]).includes(
    migrateLegacyTaskStatus(status),
  );
}

/** Agent-created task awaiting user sign-off in the Agents inbox subgroup. */
export function isAgentInboxPending(input: {
  agentCreatedAt?: number | Date | string | null;
  agentInboxApprovedAt?: number | Date | string | null;
}): boolean {
  const created =
    input.agentCreatedAt != null && input.agentCreatedAt !== "";
  if (!created) return false;
  return (
    input.agentInboxApprovedAt == null || input.agentInboxApprovedAt === ""
  );
}

/** Past-due and still open (not completed / canceled / duplicated). */
export function isInboxOverdueTask(
  input: {
    dueDate?: number | Date | string | null;
    status?: string | null;
  },
  referenceDate: Date = new Date(),
): boolean {
  if (isInactiveTaskStatus(input.status ?? undefined)) return false;
  return taskDueDateMatchesFilter(input.dueDate, "overdue", referenceDate);
}

/**
 * Whether a task belongs in the expanded inbox:
 * - classic triage capture (`inbox === true`)
 * - On Hold / In Review from any project (hidden when due date is in the future)
 * - overdue open tasks (fake group)
 * - agent-created tasks pending sign-off (Agents group)
 */
export function taskBelongsInInbox(
  input: {
    inbox?: boolean | null;
    status?: string | null;
    dueDate?: number | Date | string | null;
    agentCreatedAt?: number | Date | string | null;
    agentInboxApprovedAt?: number | Date | string | null;
  },
  referenceDate: Date = new Date(),
): boolean {
  if (isAgentInboxPending(input)) return true;
  if (input.inbox === true) return true;
  const status = migrateLegacyTaskStatus(input.status ?? "backlog");
  if (
    (INBOX_ATTENTION_REAL_STATUSES as readonly string[]).includes(status)
  ) {
    const dueYmd = getTaskDueDateYmd(input.dueDate);
    if (dueYmd && dueYmd > formatLocalYmd(referenceDate)) {
      return false;
    }
    return true;
  }
  return isInboxOverdueTask(input, referenceDate);
}

/**
 * Section key for an inbox task.
 *
 * Overdue is a special non-status group: any task with a due date in the past
 * that is not completed / canceled / duplicated lands here (including triage,
 * On Hold, and In Review). Remaining inbox tasks group by real status.
 */
export function getInboxAttentionGroupKey(
  item: Pick<
    InboxTaskListItem,
    "status" | "dueDate" | "inbox" | "agentCreatedAt" | "agentInboxApprovedAt"
  >,
  referenceDate: Date = new Date(),
): InboxAttentionStatus | "other" {
  if (isAgentInboxPending(item)) return "agents";
  if (isInboxOverdueTask(item, referenceDate)) return "overdue";
  const status = migrateLegacyTaskStatus(item.status);
  if (item.inbox === true || status === "triage") return "triage";
  if (status === "on_hold") return "on_hold";
  if (status === "in_review") return "in_review";
  return "other";
}

function attentionStatusRank(groupKey: string): number {
  const index = INBOX_ATTENTION_STATUS_ORDER.indexOf(
    groupKey as InboxAttentionStatus,
  );
  return index === -1 ? INBOX_ATTENTION_STATUS_ORDER.length : index;
}

/** Sort: Agents → Overdue → Triage → On Hold → In Review, then by updatedAt desc. */
export function sortInboxItemsByAttentionStatus(
  items: readonly InboxListItem[],
  referenceDate: Date = new Date(),
): InboxListItem[] {
  return [...items].sort((a, b) => {
    if (a.kind !== "task" || b.kind !== "task") {
      if (a.kind === b.kind) return b.updatedAt - a.updatedAt;
      return a.kind === "task" ? -1 : 1;
    }
    const rankDiff =
      attentionStatusRank(getInboxAttentionGroupKey(a, referenceDate)) -
      attentionStatusRank(getInboxAttentionGroupKey(b, referenceDate));
    if (rankDiff !== 0) return rankDiff;
    return b.updatedAt - a.updatedAt;
  });
}

export type InboxAttentionStatusGroup = {
  status: string;
  label: string;
  items: InboxListItem[];
};

export function getInboxAttentionGroupLabel(status: string): string {
  if (status === "agents") return "Agents";
  if (status === "overdue") return "Overdue";
  if (isTaskStatus(status)) return getTaskStatusLabel(status);
  return status;
}

/** Group sorted/unsorted inbox tasks into non-empty attention sections. */
export function groupInboxItemsByAttentionStatus(
  items: readonly InboxListItem[],
  referenceDate: Date = new Date(),
): InboxAttentionStatusGroup[] {
  const buckets = new Map<string, InboxListItem[]>();
  for (const status of INBOX_ATTENTION_STATUS_ORDER) {
    buckets.set(status, []);
  }
  const other: InboxListItem[] = [];

  for (const item of sortInboxItemsByAttentionStatus(items, referenceDate)) {
    if (item.kind !== "task") {
      other.push(item);
      continue;
    }
    const groupKey = getInboxAttentionGroupKey(item, referenceDate);
    const bucket = buckets.get(groupKey);
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
      label: getInboxAttentionGroupLabel(status),
      items: groupItems,
    });
  }
  if (other.length > 0) {
    groups.push({ status: "other", label: "Other", items: other });
  }
  return groups;
}

/**
 * Flat j/k / arrow order matching the attention-grouped inbox list.
 * Skips collapsed sections so keyboard nav cannot land on hidden rows.
 */
export function getInboxAttentionKeyboardItemIds(
  items: readonly InboxListItem[],
  collapsedKeys: ReadonlySet<string> = new Set(),
  referenceDate: Date = new Date(),
): string[] {
  const ids: string[] = [];
  for (const group of groupInboxItemsByAttentionStatus(items, referenceDate)) {
    if (collapsedKeys.has(group.status)) continue;
    for (const item of group.items) {
      ids.push(item.id);
    }
  }
  return ids;
}
