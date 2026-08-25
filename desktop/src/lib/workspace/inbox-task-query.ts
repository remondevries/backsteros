/**
 * PowerSync WHERE clause shared by the inbox task watch.
 * Keep in sync with `listInboxTasks` in core/server and `taskBelongsInInbox`.
 */
export const INBOX_TASKS_WHERE_SQL = `
  inbox = 1
  OR inbox_updated_at IS NOT NULL
  OR (
    agent_created_at IS NOT NULL
    AND agent_inbox_approved_at IS NULL
  )
  OR (
    status IN ('on_hold', 'in_review')
    AND (
      due_date IS NULL
      OR date(due_date) <= date('now', 'localtime')
    )
  )
  OR (
    due_date IS NOT NULL
    AND date(due_date) < date('now', 'localtime')
    AND status NOT IN ('completed', 'canceled', 'duplicated')
  )
`;
