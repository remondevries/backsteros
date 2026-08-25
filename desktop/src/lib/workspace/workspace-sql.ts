/**
 * Column lists for PowerSync list watches. Prefer explicit columns over
 * `SELECT *` so list snapshots stay lean as tables grow.
 *
 * Long text (`description` / `summary` / `context` / `notes` / `transcription`)
 * is omitted from list watches — REST hydrate + fill-missing helpers supply
 * those fields for detail / preview surfaces.
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
  "email",
  "title",
  "avatar_storage_key",
  "avatar_content_type",
  "sort_order",
  "phone",
  "role",
  "address",
  "city",
  "postal_code",
  "country",
  "social_accounts",
  "updated_at",
  "created_at",
  "deleted_at",
].join(", ");

export const ORGANIZATION_LIST_COLUMNS = [
  "id",
  "number",
  "key",
  "name",
  "phone",
  "email",
  "website",
  "address",
  "city",
  "postal_code",
  "country",
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
  "status",
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

export const ORGANIZATIONS_LIST_SQL = `SELECT ${ORGANIZATION_LIST_COLUMNS} FROM organizations WHERE deleted_at IS NULL ORDER BY sort_order, updated_at DESC`;

export const AREAS_LIST_SQL = `SELECT ${AREA_LIST_COLUMNS} FROM areas WHERE deleted_at IS NULL ORDER BY sort_order, name`;

export const DOCUMENTS_LIST_SQL = `SELECT ${DOCUMENT_LIST_COLUMNS} FROM documents WHERE deleted_at IS NULL ORDER BY sort_order, path, updated_at DESC`;

export const HABITS_LIST_SQL = `SELECT ${HABIT_LIST_COLUMNS} FROM habits WHERE deleted_at IS NULL ORDER BY sort_order, created_at`;

export const MEETINGS_LIST_SQL = `SELECT ${MEETING_LIST_COLUMNS} FROM meetings WHERE deleted_at IS NULL ORDER BY start_at, number`;
