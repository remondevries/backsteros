import { TASK_LIST_SELECT } from "../../../lib/task-list-query";
import { INBOX_TASKS_WHERE_SQL } from "../../../lib/inbox-tasks-sql";

export const PROJECTS_SQL = `SELECT id, name FROM projects
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

export const CONTACTS_SQL = `SELECT id, name, avatar_storage_key FROM contacts
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

export const ORGANIZATIONS_SQL = `SELECT id, name FROM organizations
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

/** Lightweight inbox snapshot for Approve neighbor selection. */
export const INBOX_NAV_SQL = `${TASK_LIST_SELECT}
 WHERE ${INBOX_TASKS_WHERE_SQL}
 ORDER BY t.sort_order ASC, t.updated_at DESC`;
