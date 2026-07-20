/** Shared PowerSync select for list rows with project name + display id fields. */
export const TASK_LIST_SELECT = `SELECT
  t.id,
  t.number,
  t.title,
  t.status,
  t.priority,
  t.due_date,
  t.project_id,
  t.contact_id,
  p.name AS project_name,
  p.key AS project_key
FROM tasks t
LEFT JOIN projects p ON p.id = t.project_id`;

/** Same as list select, plus description for the detail screen. */
export const TASK_DETAIL_SELECT = `SELECT
  t.id,
  t.number,
  t.title,
  t.status,
  t.priority,
  t.due_date,
  t.project_id,
  t.contact_id,
  t.assignee_id,
  t.description,
  p.name AS project_name,
  p.key AS project_key,
  a.name AS assignee_name
FROM tasks t
LEFT JOIN projects p ON p.id = t.project_id
LEFT JOIN contacts a ON a.id = COALESCE(t.assignee_id, t.contact_id)`;
