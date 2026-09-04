import {
  hasInboxUpdatedFlag,
  inboxUpdatedAtRequiresInboxListing,
} from "@backsteros/contracts";

import { INBOX_TASK_KEY, formatTaskDisplayId } from "../tasks/task-display-id.js";
import { formatEmailDisplayId } from "../email/email-display-id.js";
import { formatMeetingDisplayId, getCalendarMeetingHref } from "../meetings/meetings.js";
import { formatLocalYmd } from "../tasks/task-due-date.js";
import {
  formatEmailListPartyLabel,
  withEmailInboxListContext,
  withEmailListContext,
} from "../email/email.js";
import {
  INACTIVE_TASK_STATUSES,
  getTaskDueDateYmd,
  taskDueDateMatchesFilter,
} from "../tasks/tasks-due-filters.js";
import {
  resolveTaskStatusColor,
  type TaskStatusColorScheme,
} from "../tasks/task-status-color.js";
import {
  getTaskStatusLabel,
  isTaskStatus,
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "../tasks/task-status.js";
import type { TaskItemRowTask } from "../components/tasks/task-item-row.js";

/**
 * Inbox section order: updated → agents → overdue → triage → …
 * `updated`, `agents`, and `overdue` are not real task statuses.
 */
export const INBOX_ATTENTION_STATUS_ORDER = [
  "updated",
  "agents",
  "overdue",
  "triage",
  "in_progress",
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
  "in_progress",
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
  /** External update flag — surfaces in the Updated inbox group. */
  inboxUpdatedAt?: number | Date | string | null;
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

/** AgentMail thread shown in the Inbox list (not a `tasks` row). */
export type InboxEmailListItem = {
  kind: "email";
  id: string;
  inboxId: string;
  messageId: string;
  /** Set when the list row is a draft (messageId may equal draft id). */
  draftId?: string | null;
  threadId: string | null;
  title: string;
  /** `Name (email@domain)` shown beside the subject. */
  partyLabel: string | null;
  status: string;
  priority: number;
  dueDate: number | null;
  updatedAt: number;
  assigneeId: string | null;
  projectId: string | null;
  projectKey: string | null;
  projectName: string | null;
  projectIcon: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  /** Workspace email thread row id. */
  emailThreadId?: string | null;
  number?: number | null;
  displayId?: string | null;
  /** Our mailbox label (ID-column / mono mark). */
  mailboxLabel?: string | null;
  mailboxAvatarSrc?: string | null;
  /** External update flag — surfaces in the Updated inbox group. */
  inboxUpdatedAt?: number | Date | string | null;
};

/** Meeting shown in the Inbox / calendar side-panel list. */
export type InboxMeetingListItem = {
  kind: "meeting";
  id: string;
  title: string;
  number: number;
  status: string;
  priority: number;
  startAt: number | Date | string;
  endAt: number | Date | string;
  projectId?: string | null;
  projectKey?: string | null;
  projectName?: string | null;
  projectIcon?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  organizationAvatarSrc?: string | null;
  scheduleLabel?: string | null;
  inboxUpdatedAt?: number | Date | string | null;
  updatedAt?: number;
};

export type InboxListItem =
  | InboxTaskListItem
  | InboxLetterListItem
  | InboxEmailListItem
  | InboxMeetingListItem;

/** Stable inbox list id for an email thread row. */
export function emailInboxItemId(
  inboxId: string,
  threadId: string | null | undefined,
  messageId: string,
): string {
  const threadKey = threadId?.trim() || messageId.trim();
  return `email:${inboxId}:${threadKey}`;
}

const MEETING_INBOX_ITEM_PREFIX = "meeting:";

/** Stable inbox / side-panel id for a meeting row. */
export function meetingInboxItemId(meetingId: string): string {
  return `${MEETING_INBOX_ITEM_PREFIX}${meetingId.trim()}`;
}

/** Extract the meeting UUID from a `meeting:…` inbox list id. */
export function parseMeetingInboxItemId(itemId: string): string | null {
  const trimmed = itemId.trim();
  if (!trimmed.startsWith(MEETING_INBOX_ITEM_PREFIX)) return null;
  const id = trimmed.slice(MEETING_INBOX_ITEM_PREFIX.length).trim();
  return id || null;
}

export function encodeTaskSlug(contextKey: string, taskNumber: number): string {
  return `${contextKey.toLowerCase()}-${taskNumber}`;
}

export function getInboxTaskRouteSlugForTask(input: {
  number: number | null | undefined;
  projectKey?: string | null;
  contactKey?: string | null;
  taskId?: string;
}): string {
  if (input.number == null || !Number.isFinite(input.number)) {
    return input.taskId ?? "";
  }
  const contextKey = input.projectKey || input.contactKey || INBOX_TASK_KEY;
  return encodeTaskSlug(contextKey, input.number);
}

export function getInboxTaskRouteHref(input: {
  number: number | null | undefined;
  projectKey?: string | null;
  contactKey?: string | null;
  taskId?: string;
}): string {
  if (input.number == null || !Number.isFinite(input.number)) {
    return input.taskId ? `/inbox/${input.taskId}` : "/inbox";
  }
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
  inboxUpdatedAt?: number | Date | string | null;
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
    inboxUpdatedAt: input.inboxUpdatedAt ?? null,
  };
}

export function buildInboxEmailListItem(input: {
  inboxId: string;
  messageId: string;
  draftId?: string | null;
  threadId?: string | null;
  title: string;
  from?: string | null;
  status?: string | null;
  priority?: number | null;
  dueDate?: number | string | Date | null;
  updatedAt?: number;
  assigneeId?: string | null;
  projectId?: string | null;
  projectKey?: string | null;
  projectName?: string | null;
  projectIcon?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  mailboxLabel?: string | null;
  mailboxAvatarSrc?: string | null;
  emailThreadId?: string | null;
  number?: number | null;
  displayId?: string | null;
  inboxUpdatedAt?: number | Date | string | null;
}): InboxEmailListItem {
  const dueDate =
    input.dueDate == null
      ? null
      : typeof input.dueDate === "number"
        ? input.dueDate
        : input.dueDate instanceof Date
          ? input.dueDate.getTime()
          : Date.parse(String(input.dueDate)) || null;
  const messageId = input.messageId.trim();
  const inboxId = input.inboxId.trim();
  const threadId = input.threadId?.trim() || null;
  const draftId = input.draftId?.trim() || null;
  return {
    kind: "email",
    id: emailInboxItemId(inboxId, threadId, messageId),
    inboxId,
    messageId,
    draftId,
    threadId,
    title: input.title.trim() || "(no subject)",
    partyLabel: formatEmailListPartyLabel(input.contactName, input.from),
    status: migrateLegacyTaskStatus(input.status?.trim() || "triage"),
    priority: input.priority ?? 0,
    dueDate: dueDate != null && Number.isFinite(dueDate) ? dueDate : null,
    updatedAt: input.updatedAt ?? Date.now(),
    assigneeId: input.assigneeId ?? null,
    projectId: input.projectId ?? null,
    projectKey: input.projectKey ?? null,
    projectName: input.projectName ?? null,
    projectIcon: input.projectIcon ?? null,
    organizationId: input.organizationId ?? null,
    organizationName: input.organizationName ?? null,
    contactId: input.contactId ?? null,
    contactName: input.contactName ?? null,
    mailboxLabel: input.mailboxLabel?.trim() || null,
    mailboxAvatarSrc: input.mailboxAvatarSrc ?? null,
    emailThreadId: input.emailThreadId ?? null,
    number: input.number ?? null,
    displayId: input.displayId?.trim() || (
      input.number != null ? formatEmailDisplayId(input.number) : null
    ),
    inboxUpdatedAt: input.inboxUpdatedAt ?? null,
  };
}

/** Map an email thread into a Tasks / project list row (not a Postgres task). */
export function buildTaskListEmailItem(input: {
  inboxId: string;
  messageId: string;
  threadId?: string | null;
  title: string;
  from?: string | null;
  status?: string | null;
  priority?: number | null;
  dueDate?: number | string | Date | null;
  updatedAt?: number;
  assigneeId?: string | null;
  projectId?: string | null;
  projectKey?: string | null;
  projectName?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  mailboxLabel?: string | null;
  mailboxAvatarSrc?: string | null;
  emailThreadId?: string | null;
  number?: number | null;
  displayId?: string | null;
}): TaskItemRowTask {
  const email = buildInboxEmailListItem(input);
  return {
    id: email.id,
    number: 0,
    title: email.title,
    status: email.status,
    priority: email.priority,
    dueDate: email.dueDate,
    projectId: email.projectId,
    projectKey: email.projectKey,
    projectName: email.projectName,
    assigneeId: email.assigneeId,
    contactId: email.contactId,
    updatedAt: email.updatedAt,
    listKind: "email",
    emailInboxId: email.inboxId,
    emailMessageId: email.messageId,
    emailThreadId: email.emailThreadId ?? email.threadId,
    emailPartyLabel: email.partyLabel,
    emailMailboxLabel: email.mailboxLabel,
    emailMailboxAvatarSrc: email.mailboxAvatarSrc,
    emailNumber: email.number,
    emailDisplayId: email.displayId,
  };
}

export function isEmailTaskListItem(
  task: Pick<TaskItemRowTask, "listKind">,
): boolean {
  return task.listKind === "email";
}

export function getEmailTaskListHref(
  task: Pick<
    TaskItemRowTask,
    "listKind" | "emailInboxId" | "emailMessageId"
  >,
  options?: { list?: "tasks" | "project" },
): string | null {
  if (
    task.listKind !== "email" ||
    !task.emailInboxId?.trim() ||
    !task.emailMessageId?.trim()
  ) {
    return null;
  }
  const href = `/email/${encodeURIComponent(task.emailInboxId.trim())}/${encodeURIComponent(task.emailMessageId.trim())}`;
  const list = options?.list ?? "tasks";
  return withEmailListContext(href, list);
}

export function getInboxItemRouteSlug(item: InboxListItem): string {
  if (item.kind === "letter") {
    if (item.number == null || !Number.isFinite(item.number)) {
      return item.id;
    }
    return `ltr-${item.number}`;
  }
  if (item.kind === "email") {
    return item.id;
  }
  if (item.kind === "meeting") {
    return item.id;
  }

  return getInboxTaskRouteSlugForTask({
    number: item.number,
    projectKey: item.projectKey,
    contactKey: item.contactKey,
    taskId: item.id,
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
  if (item.kind === "email") {
    return withEmailInboxListContext(
      `/email/${encodeURIComponent(item.inboxId)}/${encodeURIComponent(item.messageId)}`,
    );
  }
  if (item.kind === "meeting") {
    const meetingId = parseMeetingInboxItemId(item.id) ?? item.id;
    return getCalendarMeetingHref(meetingId);
  }

  const slug = getInboxItemRouteSlug(item);
  const hasSlugCollision =
    items.length > 0 &&
    items.some(
      (other) => other.id !== item.id && getInboxItemRouteSlug(other) === slug,
    );

  if (hasSlugCollision) {
    return `/inbox/${item.id}`;
  }

  return getInboxTaskRouteHref({
    number: item.number,
    projectKey: item.projectKey,
    contactKey: item.contactKey,
    taskId: item.id,
  });
}

/**
 * Precompute hrefs for an inbox list in one pass (avoids O(n²) slug scans).
 */
export function buildInboxItemHrefById(
  items: readonly InboxListItem[],
): Map<string, string> {
  const slugCounts = new Map<string, number>();
  for (const item of items) {
    if (item.kind !== "task") continue;
    const slug = getInboxItemRouteSlug(item);
    slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
  }

  const hrefById = new Map<string, string>();
  for (const item of items) {
    if (item.kind === "letter") {
      hrefById.set(item.id, `/letters/${item.id}`);
      continue;
    }
    if (item.kind === "email") {
      hrefById.set(
        item.id,
        withEmailInboxListContext(
          `/email/${encodeURIComponent(item.inboxId)}/${encodeURIComponent(item.messageId)}`,
        ),
      );
      continue;
    }
    if (item.kind === "meeting") {
      const meetingId = parseMeetingInboxItemId(item.id) ?? item.id;
      hrefById.set(item.id, getCalendarMeetingHref(meetingId));
      continue;
    }
    const slug = getInboxItemRouteSlug(item);
    if ((slugCounts.get(slug) ?? 0) > 1 || slug === item.id) {
      hrefById.set(item.id, `/inbox/${item.id}`);
    } else {
      hrefById.set(
        item.id,
        getInboxTaskRouteHref({
          number: item.number,
          projectKey: item.projectKey,
          contactKey: item.contactKey,
          taskId: item.id,
        }),
      );
    }
  }
  return hrefById;
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
  if (item.kind === "email") {
    return item.displayId?.trim() || (
      item.number != null ? formatEmailDisplayId(item.number) : "Email"
    );
  }
  if (item.kind === "meeting") {
    return formatMeetingDisplayId(item.number);
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
    inboxUpdatedAt?: number | Date | string | null;
  },
  referenceDate: Date = new Date(),
): boolean {
  if (inboxUpdatedAtRequiresInboxListing(input.inboxUpdatedAt)) return true;
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
 * Untriaged email — empty status or explicitly Triage.
 */
export function isEmailIncomingStatus(
  status: string | null | undefined,
): boolean {
  const trimmed = status?.trim();
  if (!trimmed) return true;
  return migrateLegacyTaskStatus(trimmed) === "triage";
}

/**
 * Whether an email thread belongs in the Inbox list:
 * - triage / empty → always
 * - any other status → same rules as tasks (overdue, in progress, on hold, in review)
 */
export function emailBelongsInInbox(
  input: {
    status?: string | null;
    dueDate?: number | Date | string | null;
    inboxUpdatedAt?: number | Date | string | null;
  },
  referenceDate: Date = new Date(),
): boolean {
  if (inboxUpdatedAtRequiresInboxListing(input.inboxUpdatedAt)) return true;
  if (isEmailIncomingStatus(input.status)) return true;
  return taskBelongsInInbox(
    {
      inbox: false,
      status: input.status,
      dueDate: input.dueDate,
    },
    referenceDate,
  );
}

/**
 * Whether a meeting belongs in the Inbox list (calendar side panel "inbox"
 * section). Incoming / triage bookings stay here until reviewed; scheduled
 * workflow states live under the calendar list instead.
 */
export function meetingBelongsInInbox(input: {
  status?: string | null;
}): boolean {
  const trimmed = input.status?.trim();
  if (!trimmed) return false;
  return migrateLegacyTaskStatus(trimmed) === "triage";
}

/** Inbox email icon color: triage orange when untriaged, else the status color. */
export function resolveInboxEmailIconColor(
  status: string | null | undefined,
  options?: { colorScheme?: TaskStatusColorScheme },
): string {
  const statusKey = isEmailIncomingStatus(status)
    ? "triage"
    : migrateLegacyTaskStatus(status ?? "backlog");
  return resolveTaskStatusColor(statusKey, undefined, options);
}

function getTaskInboxAttentionGroupKey(
  item: {
    status: string;
    dueDate?: number | Date | string | null;
    inbox?: boolean | null;
    agentCreatedAt?: number | Date | string | null;
    agentInboxApprovedAt?: number | Date | string | null;
    inboxUpdatedAt?: number | Date | string | null;
  },
  referenceDate: Date,
): InboxAttentionStatus | "other" {
  if (hasInboxUpdatedFlag(item.inboxUpdatedAt)) return "updated";
  if (isAgentInboxPending(item)) return "agents";
  if (isInboxOverdueTask(item, referenceDate)) return "overdue";
  const status = migrateLegacyTaskStatus(item.status);
  if (item.inbox === true || status === "triage" || status === "backlog") {
    return "triage";
  }
  if (status === "in_progress") return "in_progress";
  if (status === "on_hold") return "on_hold";
  if (status === "in_review") return "in_review";
  return "other";
}

function getEmailInboxAttentionGroupKey(
  item: {
    status: string;
    dueDate?: number | Date | string | null;
    inboxUpdatedAt?: number | Date | string | null;
  },
  referenceDate: Date,
): InboxAttentionStatus | "other" {
  return getTaskInboxAttentionGroupKey(
    {
      ...item,
      inbox: isEmailIncomingStatus(item.status) ? true : false,
    },
    referenceDate,
  );
}

function getMeetingInboxAttentionGroupKey(item: {
  status: string;
  inboxUpdatedAt?: number | Date | string | null;
}): InboxAttentionStatus | "other" {
  if (hasInboxUpdatedFlag(item.inboxUpdatedAt)) return "updated";
  if (meetingBelongsInInbox(item)) return "triage";
  return "other";
}

/**
 * Section key for an inbox task, email, or meeting.
 *
 * Updated is highest priority: any item with `inboxUpdatedAt` lands here.
 * Overdue is a special non-status group: any item with a due date in the past
 * that is not completed / canceled / duplicated lands here (including triage,
 * On Hold, and In Review). Remaining inbox items group by real status.
 */
export function getInboxAttentionGroupKey(
  item: {
    kind: InboxListItem["kind"];
    status?: string | null;
    dueDate?: number | Date | string | null;
    inbox?: boolean | null;
    agentCreatedAt?: number | Date | string | null;
    agentInboxApprovedAt?: number | Date | string | null;
    inboxUpdatedAt?: number | Date | string | null;
  },
  referenceDate: Date = new Date(),
): InboxAttentionStatus | "other" {
  if (item.kind === "letter") return "other";
  if (item.kind === "meeting") {
    return getMeetingInboxAttentionGroupKey({
      status: item.status ?? "triage",
      inboxUpdatedAt: item.inboxUpdatedAt,
    });
  }
  if (item.kind === "email") {
    return getEmailInboxAttentionGroupKey(
      {
        status: item.status ?? "triage",
        dueDate: item.dueDate ?? null,
        inboxUpdatedAt: item.inboxUpdatedAt,
      },
      referenceDate,
    );
  }
  return getTaskInboxAttentionGroupKey(
    {
      status: item.status ?? "triage",
      dueDate: item.dueDate ?? null,
      inbox: item.inbox,
      agentCreatedAt: item.agentCreatedAt,
      agentInboxApprovedAt: item.agentInboxApprovedAt,
      inboxUpdatedAt: item.inboxUpdatedAt,
    },
    referenceDate,
  );
}

function attentionStatusRank(groupKey: string): number {
  const index = INBOX_ATTENTION_STATUS_ORDER.indexOf(
    groupKey as InboxAttentionStatus,
  );
  return index === -1 ? INBOX_ATTENTION_STATUS_ORDER.length : index;
}

function isAttentionGroupedKind(
  item: InboxListItem,
): item is InboxTaskListItem | InboxEmailListItem {
  return item.kind === "task" || item.kind === "email";
}

/** Sort: Updated → Agents → Overdue → Triage → …, then by updatedAt desc. */
export function sortInboxItemsByAttentionStatus(
  items: readonly InboxListItem[],
  referenceDate: Date = new Date(),
): InboxListItem[] {
  return [...items].sort((a, b) => {
    if (!isAttentionGroupedKind(a) || !isAttentionGroupedKind(b)) {
      if (a.kind === b.kind) {
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      }
      if (isAttentionGroupedKind(a)) return -1;
      if (isAttentionGroupedKind(b)) return 1;
      return a.kind === "letter" ? 1 : -1;
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
  if (status === "updated") return "Updated";
  if (status === "agents") return "Agents";
  if (status === "overdue") return "Overdue";
  if (isTaskStatus(status)) return getTaskStatusLabel(status);
  return status;
}

/** Group sorted/unsorted inbox items into non-empty attention sections. */
export function groupInboxItemsByAttentionStatus(
  items: readonly InboxListItem[],
  referenceDate: Date = new Date(),
  options?: {
    alreadySorted?: boolean;
    /** Keep pinned rows in the section they occupied when opened. */
    attentionGroupOverrides?: ReadonlyMap<string, string>;
  },
): InboxAttentionStatusGroup[] {
  const buckets = new Map<string, InboxListItem[]>();
  for (const status of INBOX_ATTENTION_STATUS_ORDER) {
    buckets.set(status, []);
  }
  const other: InboxListItem[] = [];

  const ordered = options?.alreadySorted
    ? items
    : sortInboxItemsByAttentionStatus(items, referenceDate);

  for (const item of ordered) {
    if (!isAttentionGroupedKind(item) && item.kind !== "meeting") {
      other.push(item);
      continue;
    }
    const override = options?.attentionGroupOverrides?.get(item.id);
    const groupKey =
      override ?? getInboxAttentionGroupKey(item, referenceDate);
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
  attentionGroupOverrides?: ReadonlyMap<string, string>,
): string[] {
  const ids: string[] = [];
  for (const group of groupInboxItemsByAttentionStatus(items, referenceDate, {
    attentionGroupOverrides,
  })) {
    if (collapsedKeys.has(group.status)) continue;
    for (const item of group.items) {
      ids.push(item.id);
    }
  }
  return ids;
}
