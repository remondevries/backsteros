import { INBOX_TASKS_WHERE_SQL } from "../lib/inbox-tasks-sql";
import { TASK_LIST_SELECT } from "../lib/task-list-query";
import { formatTaskDueMetaLabel } from "../lib/task-due-date";
import {
  HOME_GLANCE_INBOX_LIMIT,
  inboxPriorityIconColorForPriority,
  inboxPriorityIconForPriority,
  inboxStatusColorForStatus,
  inboxStatusIconForStatus,
  resolveInboxSidebarIndicatorTone,
  type HomeGlanceInboxItem,
  type InboxSidebarIndicatorTone,
} from "./home-glance-model";

/** Same membership as the in-app inbox list — capped (WidgetKit cannot scroll). */
export const HOME_GLANCE_INBOX_SQL = `${TASK_LIST_SELECT}
 WHERE ${INBOX_TASKS_WHERE_SQL}
 ORDER BY t.sort_order ASC, t.updated_at DESC
 LIMIT ${HOME_GLANCE_INBOX_LIMIT}`;

/** Total inbox membership (same filter as the list, uncapped). */
export const HOME_GLANCE_INBOX_COUNT_SQL = `SELECT COUNT(*) AS count
 FROM tasks t
 WHERE ${INBOX_TASKS_WHERE_SQL}`;

/**
 * Aggregate flags for the Inbox tab attention dot (orange / green / muted).
 * Same membership window as {@link HOME_GLANCE_INBOX_COUNT_SQL}.
 *
 * `inbox_updated_at` is only read here (not in membership) so a missing column
 * cannot wipe the inbox list the way a WHERE reference would.
 */
export const HOME_GLANCE_INBOX_INDICATOR_SQL = `SELECT
  COUNT(*) AS total_count,
  SUM(
    CASE
      WHEN t.agent_created_at IS NOT NULL
        AND t.agent_inbox_approved_at IS NULL THEN 1
      WHEN t.due_date IS NOT NULL
        AND date(t.due_date) < date('now', 'localtime')
        AND t.status NOT IN ('completed', 'canceled', 'duplicated') THEN 1
      WHEN t.status = 'triage' OR t.inbox = 1 THEN 1
      ELSE 0
    END
  ) AS attention_count,
  SUM(
    CASE
      WHEN t.inbox_updated_at IS NOT NULL AND t.inbox_updated_at != '' THEN 1
      ELSE 0
    END
  ) AS updated_count
 FROM tasks t
 WHERE ${INBOX_TASKS_WHERE_SQL}`;

export type HomeGlanceInboxCountRow = {
  count: number | string;
};

export type HomeGlanceInboxIndicatorRow = {
  total_count: number | string;
  attention_count: number | string;
  updated_count: number | string;
};

function readCount(value: number | string | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export function mapHomeGlanceInboxTotal(
  rows: HomeGlanceInboxCountRow[] | null | undefined,
): number {
  return readCount(rows?.[0]?.count);
}

export function mapHomeGlanceInboxIndicatorTone(
  rows: HomeGlanceInboxIndicatorRow[] | null | undefined,
): InboxSidebarIndicatorTone {
  const row = rows?.[0];
  return resolveInboxSidebarIndicatorTone({
    totalCount: readCount(row?.total_count),
    attentionCount: readCount(row?.attention_count),
    updatedCount: readCount(row?.updated_count),
  });
}

export type HomeGlanceInboxSqlRow = {
  id: string;
  title: string | null;
  status?: string | null;
  priority?: number | null;
  due_date?: string | null;
  project_name?: string | null;
  project_key?: string | null;
};

export function mapHomeGlanceInboxRows(
  rows: HomeGlanceInboxSqlRow[],
): HomeGlanceInboxItem[] {
  return rows.slice(0, HOME_GLANCE_INBOX_LIMIT).map((row) => {
    const title = row.title?.trim() || "Untitled";
    const parts: string[] = [];
    const due = formatTaskDueMetaLabel(row.due_date);
    if (due) parts.push(due);
    const project = row.project_name?.trim() || row.project_key?.trim();
    if (project) parts.push(project);
    return {
      id: row.id,
      title,
      meta: parts.join(" · "),
      icon: inboxStatusIconForStatus(row.status),
      iconColor: inboxStatusColorForStatus(row.status),
      priorityIcon: inboxPriorityIconForPriority(row.priority),
      priorityIconColor: inboxPriorityIconColorForPriority(row.priority),
    };
  });
}

/** Tasks due today — same window as the Tasks “Today” filter, capped. */
export const HOME_GLANCE_TODAY_SQL = `${TASK_LIST_SELECT}
 WHERE t.deleted_at IS NULL
   AND t.due_date IS NOT NULL
   AND date(t.due_date) = date('now', 'localtime')
 ORDER BY t.sort_order ASC, t.updated_at DESC
 LIMIT ${HOME_GLANCE_INBOX_LIMIT}`;

export const HOME_GLANCE_TODAY_COUNT_SQL = `SELECT COUNT(*) AS count
 FROM tasks t
 WHERE t.deleted_at IS NULL
   AND t.due_date IS NOT NULL
   AND date(t.due_date) = date('now', 'localtime')`;

export function mapHomeGlanceTodayRows(
  rows: HomeGlanceInboxSqlRow[],
): HomeGlanceInboxItem[] {
  return rows.slice(0, HOME_GLANCE_INBOX_LIMIT).map((row) => {
    const title = row.title?.trim() || "Untitled";
    const parts: string[] = [];
    // Due is always today on this list — prefer project in the meta line.
    const project = row.project_name?.trim() || row.project_key?.trim();
    if (project) parts.push(project);
    const due = formatTaskDueMetaLabel(row.due_date);
    if (due && due !== "Today") parts.push(due);
    return {
      id: row.id,
      title,
      meta: parts.join(" · "),
      icon: inboxStatusIconForStatus(row.status),
      iconColor: inboxStatusColorForStatus(row.status),
      priorityIcon: inboxPriorityIconForPriority(row.priority),
      priorityIconColor: inboxPriorityIconColorForPriority(row.priority),
    };
  });
}

export function mapHomeGlanceTodayTotal(
  rows: HomeGlanceInboxCountRow[] | null | undefined,
): number {
  return mapHomeGlanceInboxTotal(rows);
}
