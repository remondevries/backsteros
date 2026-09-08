/**
 * Shared PowerSync WHERE for inbox task membership.
 * Keep aligned with desktop `INBOX_TASKS_WHERE_SQL` and `taskBelongsInInbox`.
 *
 * Note: `status = 'triage'` is included so triage capture rows show even when
 * the `inbox` flag was never stamped (parity with attention grouping).
 * Habit day instances are excluded (shown on Journal / Habits instead).
 * Tasks due today or later wait until they are overdue (past due).
 *
 * Always compare with `date(…, 'localtime')` — bare `date(due_date)` uses the
 * UTC calendar day, so local-midnight dues (`…T22:00:00.000Z` in CEST) were
 * treated as yesterday and leaked into Inbox.
 */
export const INBOX_TASKS_WHERE_SQL = `t.deleted_at IS NULL AND (
   (t.habit_id IS NULL OR trim(t.habit_id) = '')
   AND (
     t.due_date IS NULL
     OR date(t.due_date, 'localtime') < date('now', 'localtime')
   )
   AND (
     IFNULL(t.inbox, 0) != 0
     OR t.status = 'triage'
     OR t.inbox_updated_at IS NOT NULL
     OR (
       t.agent_created_at IS NOT NULL
       AND t.agent_inbox_approved_at IS NULL
     )
     OR t.status IN ('on_hold', 'in_review')
     OR (
       t.due_date IS NOT NULL
       AND date(t.due_date, 'localtime') < date('now', 'localtime')
       AND t.status NOT IN ('completed', 'canceled', 'duplicated')
     )
   )
 )`;
