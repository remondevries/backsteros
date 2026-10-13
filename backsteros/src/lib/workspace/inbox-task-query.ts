/**
 * PowerSync WHERE clause shared by the inbox task watch.
 * Keep in sync with `listInboxTasks` in core/server and `taskBelongsInInbox`.
 * Habit day instances are excluded (shown on Journal / Habits instead).
 * Tasks due today or later wait until they are overdue (past due).
 *
 * Compare with `date(…, 'localtime')` so UTC-offset local midnights are not
 * treated as yesterday (see mobile inbox due-date gate).
 */
export const INBOX_TASKS_WHERE_SQL = `
  (habit_id IS NULL OR trim(habit_id) = '')
  AND (
    due_date IS NULL
    OR date(due_date, 'localtime') < date('now', 'localtime')
  )
  AND (
    inbox = 1
    OR inbox_updated_at IS NOT NULL
    OR (
      agent_created_at IS NOT NULL
      AND agent_inbox_approved_at IS NULL
    )
    OR status IN ('on_hold', 'in_review')
    OR (
      due_date IS NOT NULL
      AND date(due_date, 'localtime') < date('now', 'localtime')
      AND status NOT IN ('completed', 'canceled', 'duplicated')
    )
  )
`;
