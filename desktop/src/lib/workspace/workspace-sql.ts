/**
 * Column lists for PowerSync list watches. Prefer explicit columns over
 * `SELECT *` so list snapshots stay lean as tables grow.
 *
 * Long text (`description` / `summary` / `context` / `notes` / `transcription`)
 * is omitted from list watches. Task descriptions load via one-row PowerSync
 * (`useDesktopTaskDescription`); other entities may still use REST hydrate +
 * fill-missing helpers for detail / preview surfaces.
 */

export const TASK_LIST_COLUMNS = [
  "id",
  "number",
  "title",
  "status",
  "priority",
  "due_date",
  "due_end_date",
  "project_id",
  "contact_id",
  "assignee_id",
  "related_contact_ids",
  "related_organization_ids",
  "sort_order",
  "updated_at",
  "created_at",
  "deleted_at",
  "inbox",
  "links",
  "agent_chat_id",
  "habit_id",
  "agent_created_at",
  "agent_inbox_approved_at",
  "tracked_minutes",
  "tracked_duration_seconds",
  "triaged_at",
  "completed_at",
].join(", ");

export const PROJECT_LIST_COLUMNS = [
  "id",
  "key",
  "name",
  "organization_id",
  "area_id",
  "area",
  "start_date",
  "due_date",
  "icon",
  "color",
  "type",
  "github_repository",
  "local_working_directory",
  "status",
  "priority",
  "sort_order",
  "updated_at",
  "created_at",
  "deleted_at",
].join(", ");

export const LETTER_LIST_COLUMNS = [
  "id",
  "number",
  "project_id",
  "organization_id",
  "contact_id",
  "title",
  "icon",
  "status",
  "due_date",
  "received_date",
  "direction",
  "storage_key",
  "original_filename",
  "content_type",
  "byte_size",
  "checksum",
  "content_etag",
  "sort_order",
  "updated_at",
  "created_at",
  "deleted_at",
].join(", ");

export const CONTACT_LIST_COLUMNS = [
  "id",
  "number",
  "key",
  "organization_id",
  "name",
  "first_name",
  "last_name",
  "email",
  "emails",
  "title",
  "avatar_storage_key",
  "avatar_content_type",
  "sort_order",
  "phone",
  "phones",
  "role",
  "address",
  "city",
  "postal_code",
  "country",
  "region",
  "latitude",
  "longitude",
  "social_accounts",
  "birthday",
  "languages",
  "updated_at",
  "created_at",
  "deleted_at",
].join(", ");

export const ORGANIZATION_LIST_COLUMNS = [
  "id",
  "number",
  "key",
  "name",
  "summary",
  "phone",
  "email",
  "emails",
  "phones",
  "website",
  "address",
  "city",
  "postal_code",
  "country",
  "region",
  "latitude",
  "longitude",
  "size",
  "social_accounts",
  "chamber_of_commerce",
  "tax_number",
  "avatar_storage_key",
  "avatar_content_type",
  "sort_order",
  "moneybird_contact_id",
  "updated_at",
  "created_at",
  "deleted_at",
].join(", ");

export const AREA_LIST_COLUMNS = [
  "id",
  "name",
  "parent",
  "icon",
  "color",
  "sort_order",
  "updated_at",
  "created_at",
  "deleted_at",
].join(", ");

export const DOCUMENT_LIST_COLUMNS = [
  "id",
  "type",
  "project_id",
  "parent_id",
  "kind",
  "icon",
  "sort_order",
  "journal_date",
  "path",
  "title",
  "storage_key",
  "content_type",
  "byte_size",
  "checksum",
  "snippet",
  "content_version",
  "content_etag",
  "updated_at",
  "created_at",
  "deleted_at",
].join(", ");

export const HABIT_LIST_COLUMNS = [
  "id",
  "title",
  "icon",
  "project_id",
  "cadence",
  "cadence_anchor_ymd",
  "sort_order",
  "updated_at",
  "created_at",
  "deleted_at",
].join(", ");

export const MEETING_LIST_COLUMNS = [
  "id",
  "number",
  "title",
  "summary",
  "notes",
  "transcription",
  "status",
  "format",
  "location",
  "location_organization_id",
  "project_id",
  "organization_id",
  "attendee_contact_ids",
  "start_at",
  "end_at",
  "tracked_minutes",
  "tracked_duration_seconds",
  "sort_order",
  "updated_at",
  "created_at",
  "deleted_at",
].join(", ");

export const ALL_TASKS_LIST_SQL = `SELECT ${TASK_LIST_COLUMNS} FROM tasks WHERE deleted_at IS NULL ORDER BY sort_order, updated_at DESC`;

export const TASKS_LIST_SQL = `SELECT ${TASK_LIST_COLUMNS} FROM tasks WHERE deleted_at IS NULL AND (inbox = 0 OR inbox IS NULL) ORDER BY sort_order, updated_at DESC`;

export const INBOX_TASKS_LIST_SQL = `SELECT ${TASK_LIST_COLUMNS} FROM tasks WHERE deleted_at IS NULL AND (
           inbox = 1
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
         ) ORDER BY sort_order, updated_at DESC`;

export const PROJECTS_LIST_SQL = `SELECT ${PROJECT_LIST_COLUMNS} FROM projects WHERE deleted_at IS NULL ORDER BY sort_order, updated_at DESC`;

export const LETTERS_LIST_SQL = `SELECT ${LETTER_LIST_COLUMNS} FROM letters WHERE deleted_at IS NULL ORDER BY sort_order, updated_at DESC`;

export const CONTACTS_LIST_SQL = `SELECT ${CONTACT_LIST_COLUMNS} FROM contacts WHERE deleted_at IS NULL ORDER BY sort_order, updated_at DESC`;

/** Contact → CRM group chips for the contacts overview list. */
export const CRM_CONTACT_GROUP_MEMBERSHIPS_SQL = `
  SELECT
    m.subject_id AS contact_id,
    g.id AS group_id,
    g.name AS name,
    g.color AS color,
    g.sort_order AS sort_order
  FROM crm_group_members m
  INNER JOIN crm_groups g ON g.id = m.group_id
  WHERE m.deleted_at IS NULL
    AND g.deleted_at IS NULL
    AND m.subject_type = 'contact'
  ORDER BY g.sort_order ASC, g.name COLLATE NOCASE ASC
`.trim();

export const CRM_GROUPS_LIST_SQL = `
  SELECT
    id,
    name,
    description,
    color,
    icon,
    sort_order,
    created_at,
    updated_at,
    deleted_at
  FROM crm_groups
  WHERE deleted_at IS NULL
  ORDER BY sort_order ASC, name COLLATE NOCASE ASC
`.trim();

export const CRM_RELATIONSHIP_LABELS_SQL = `
  SELECT
    id,
    side_a_label,
    side_a_slug,
    side_b_label,
    side_b_slug,
    color,
    sort_order,
    created_at,
    updated_at,
    deleted_at
  FROM crm_relationship_labels
  WHERE deleted_at IS NULL
  ORDER BY sort_order ASC, side_a_label COLLATE NOCASE ASC
`.trim();

export const CONTACT_RELATIONSHIPS_FOR_CONTACT_SQL = `
  SELECT
    r.id,
    r.from_contact_id,
    r.to_contact_id,
    r.type,
    r.note,
    r.created_at,
    r.updated_at,
    r.deleted_at,
    CASE WHEN r.from_contact_id = ? THEN 'outgoing' ELSE 'incoming' END AS direction,
    CASE WHEN r.from_contact_id = ? THEN r.to_contact_id ELSE r.from_contact_id END AS related_contact_id,
    COALESCE(c.name, 'Unknown') AS related_contact_name
  FROM contact_relationships r
  LEFT JOIN contacts c
    ON c.id = CASE WHEN r.from_contact_id = ? THEN r.to_contact_id ELSE r.from_contact_id END
    AND c.deleted_at IS NULL
  WHERE r.deleted_at IS NULL
    AND (r.from_contact_id = ? OR r.to_contact_id = ?)
  ORDER BY r.created_at ASC
`.trim();

export const CRM_ACTIVITIES_FOR_SUBJECT_SQL = `
  SELECT
    a.id,
    a.subject_type,
    a.subject_id,
    a.kind,
    a.body,
    a.body_preview,
    a.meeting_id,
    a.occurred_at,
    a.created_by,
    a.created_at,
    a.updated_at,
    a.deleted_at,
    m.title AS meeting_title,
    m.start_at AS meeting_start_at
  FROM crm_activities a
  LEFT JOIN meetings m ON m.id = a.meeting_id AND m.deleted_at IS NULL
  WHERE a.deleted_at IS NULL
    AND a.subject_type = ?
    AND a.subject_id = ?
  ORDER BY a.occurred_at DESC, a.id DESC
`.trim();

export const CRM_GROUP_MEMBERS_SQL = `
  SELECT subject_type, subject_id
  FROM crm_group_members
  WHERE deleted_at IS NULL AND group_id = ?
`.trim();

export const CRM_SUBJECT_GROUPS_SQL = `
  SELECT
    g.id,
    g.name,
    g.description,
    g.color,
    g.icon,
    g.sort_order,
    g.created_at,
    g.updated_at,
    g.deleted_at
  FROM crm_groups g
  INNER JOIN crm_group_members m ON m.group_id = g.id AND m.deleted_at IS NULL
  WHERE g.deleted_at IS NULL
    AND m.subject_type = ?
    AND m.subject_id = ?
  ORDER BY g.sort_order ASC, g.name COLLATE NOCASE ASC
`.trim();

export const ORGANIZATIONS_LIST_SQL = `SELECT ${ORGANIZATION_LIST_COLUMNS} FROM organizations WHERE deleted_at IS NULL ORDER BY sort_order, updated_at DESC`;

export const AREAS_LIST_SQL = `SELECT ${AREA_LIST_COLUMNS} FROM areas WHERE deleted_at IS NULL ORDER BY sort_order, name`;

export const DOCUMENTS_LIST_SQL = `SELECT ${DOCUMENT_LIST_COLUMNS} FROM documents WHERE deleted_at IS NULL ORDER BY sort_order, path, updated_at DESC`;

export const HABITS_LIST_SQL = `SELECT ${HABIT_LIST_COLUMNS} FROM habits WHERE deleted_at IS NULL ORDER BY sort_order, created_at`;

export const MEETINGS_LIST_SQL = `SELECT ${MEETING_LIST_COLUMNS} FROM meetings WHERE deleted_at IS NULL ORDER BY start_at, number`;
