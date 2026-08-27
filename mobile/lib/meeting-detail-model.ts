export const MEETING_DETAIL_EMPTY_SQL =
  "SELECT id FROM meetings WHERE 0";

export const MEETING_DETAIL_SQL = `
SELECT
  m.id,
  m.number,
  m.title,
  m.summary,
  m.notes,
  m.transcription,
  m.status,
  m.project_id,
  m.organization_id,
  m.attendee_contact_ids,
  m.start_at,
  m.end_at,
  m.tracked_minutes,
  m.tracked_duration_seconds,
  m.sort_order,
  m.created_at,
  m.updated_at,
  m.deleted_at,
  p.name AS project_name,
  p.key AS project_key,
  p.icon AS project_icon,
  p.type AS project_type,
  o.name AS organization_name
FROM meetings m
LEFT JOIN projects p ON p.id = m.project_id AND p.deleted_at IS NULL
LEFT JOIN organizations o ON o.id = m.organization_id AND o.deleted_at IS NULL
WHERE m.deleted_at IS NULL AND m.id = ?
`;

export const MEETING_PROJECTS_SQL = `
SELECT id, name, key, icon, type
FROM projects
WHERE deleted_at IS NULL
ORDER BY name COLLATE NOCASE ASC`;

export const MEETING_ORGANIZATIONS_SQL = `
SELECT id, name, key
FROM organizations
WHERE deleted_at IS NULL
ORDER BY name COLLATE NOCASE ASC`;

export const MEETING_CONTACTS_SQL = `
SELECT id, name, email, organization_id
FROM contacts
WHERE deleted_at IS NULL
ORDER BY name COLLATE NOCASE ASC`;

export type MeetingDetailRow = {
  id: string;
  number: number | null;
  title: string | null;
  summary: string | null;
  notes: string | null;
  transcription: string | null;
  status: string | null;
  project_id: string | null;
  organization_id: string | null;
  attendee_contact_ids: string | null;
  start_at: string | null;
  end_at: string | null;
  tracked_minutes: number | null;
  tracked_duration_seconds: number | null;
  sort_order: number | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  project_name?: string | null;
  project_key?: string | null;
  project_icon?: string | null;
  project_type?: string | null;
  organization_name?: string | null;
};

export type MeetingNamedOptionRow = {
  id: string;
  name: string | null;
  key?: string | null;
  icon?: string | null;
  type?: string | null;
};

export type MeetingContactOptionRow = {
  id: string;
  name: string | null;
  email: string | null;
  organization_id: string | null;
};

export function parseAttendeeContactIds(
  raw: string | null | undefined,
): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0,
    );
  } catch {
    return [];
  }
}

export function serializeAttendeeContactIds(ids: string[]): string {
  return JSON.stringify(
    ids.filter((id) => typeof id === "string" && id.trim().length > 0),
  );
}
