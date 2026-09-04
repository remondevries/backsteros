/** Shared PowerSync select for list rows with project name + display id fields. */
export const TASK_LIST_SELECT = `SELECT
  t.id,
  t.number,
  t.title,
  t.status,
  t.priority,
  t.due_date,
  t.due_end_date,
  t.inbox,
  t.habit_id,
  t.agent_created_at,
  t.agent_inbox_approved_at,
  t.tracked_minutes,
  t.tracked_duration_seconds,
  t.project_id,
  t.contact_id,
  COALESCE(t.assignee_id, t.contact_id) AS assignee_id,
  t.related_contact_ids,
  t.related_organization_ids,
  p.name AS project_name,
  p.key AS project_key,
  p.icon AS project_icon,
  p.type AS project_type,
  a.name AS assignee_name,
  a.avatar_storage_key AS assignee_avatar_storage_key
FROM tasks t
LEFT JOIN projects p ON p.id = t.project_id
LEFT JOIN contacts a ON a.id = COALESCE(t.assignee_id, t.contact_id)`;

/** Same as list select, plus description + agent binding for the detail screen. */
export const TASK_DETAIL_SELECT = `SELECT
  t.id,
  t.number,
  t.title,
  t.status,
  t.priority,
  t.due_date,
  t.due_end_date,
  t.project_id,
  t.contact_id,
  t.assignee_id,
  t.related_contact_ids,
  t.related_organization_ids,
  t.description,
  t.agent_chat_id,
  t.agent_created_at,
  t.agent_inbox_approved_at,
  t.tracked_minutes,
  t.tracked_duration_seconds,
  p.name AS project_name,
  p.key AS project_key,
  p.type AS project_type,
  p.local_working_directory AS project_local_working_directory,
  a.name AS assignee_name
FROM tasks t
LEFT JOIN projects p ON p.id = t.project_id
LEFT JOIN contacts a ON a.id = COALESCE(t.assignee_id, t.contact_id)`;
