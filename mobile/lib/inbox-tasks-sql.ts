/**
 * Shared PowerSync WHERE for inbox task membership.
 * Keep aligned with desktop `INBOX_TASKS_WHERE_SQL` and `taskBelongsInInbox`.
 *
 * Note: `status = 'triage'` is included so triage capture rows show even when
 * the `inbox` flag was never stamped (parity with attention grouping).
 */
export const INBOX_TASKS_WHERE_SQL = `t.deleted_at IS NULL AND (
   IFNULL(t.inbox, 0) != 0
   OR t.status = 'triage'
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
 )`;
