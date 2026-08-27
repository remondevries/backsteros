import { TASK_LIST_SELECT } from "../../../lib/task-list-query";

export const PROJECTS_SQL = `SELECT id, name FROM projects
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

export const CONTACTS_SQL = `SELECT id, name, avatar_storage_key FROM contacts
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

/** Lightweight inbox snapshot for Approve neighbor selection. */
export const INBOX_NAV_SQL = `${TASK_LIST_SELECT}
 WHERE t.deleted_at IS NULL AND (
   t.inbox = 1
   OR (
     t.agent_created_at IS NOT NULL
     AND t.agent_inbox_approved_at IS NULL
   )
   OR (
     t.status IN ('on_hold', 'in_review')
     AND (
       t.due_date IS NULL
       OR date(t.due_date) <= date('now', 'localtime')
     )
   )
   OR (
     t.due_date IS NOT NULL
     AND date(t.due_date) < date('now', 'localtime')
     AND t.status NOT IN ('completed', 'canceled', 'duplicated')
   )
 )
 ORDER BY t.sort_order ASC, t.updated_at DESC`;
