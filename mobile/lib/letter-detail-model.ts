import type { TaskStatus } from "./task-status";
import { TASK_STATUS_ORDER } from "./task-status";
import { endOfLocalDayIso } from "./task-due-date";

export type LetterDetailRow = {
  id: string;
  title: string | null;
  number: number | null;
  context: string | null;
  status: string | null;
  due_date: string | null;
  received_date: string | null;
  organization_id: string | null;
  contact_id: string | null;
  project_id: string | null;
  storage_key: string | null;
  original_filename: string | null;
  byte_size: number | null;
  organization_name: string | null;
  contact_name: string | null;
  project_name: string | null;
  project_key: string | null;
};

export type LetterNamedOptionRow = { id: string; name: string | null };
export type LetterContactOptionRow = LetterNamedOptionRow & {
  organization_id: string | null;
};

export type LetterPickerKind =
  | "organization"
  | "contact"
  | "received"
  | "status"
  | "due"
  | "project"
  | null;

export const LETTER_PROJECTS_SQL = `SELECT id, name FROM projects
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

export const LETTER_ORGANIZATIONS_SQL = `SELECT id, name FROM organizations
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

export const LETTER_CONTACTS_SQL = `SELECT id, name, organization_id FROM contacts
  WHERE deleted_at IS NULL
  ORDER BY name COLLATE NOCASE ASC`;

export const LETTER_DETAIL_SQL = `SELECT
   l.id,
   l.title,
   l.number,
   l.context,
   l.status,
   l.due_date,
   l.received_date,
   l.organization_id,
   l.contact_id,
   l.project_id,
   l.storage_key,
   l.original_filename,
   l.byte_size,
   o.name AS organization_name,
   c.name AS contact_name,
   p.name AS project_name,
   p.key AS project_key
 FROM letters l
 LEFT JOIN organizations o ON o.id = l.organization_id
 LEFT JOIN contacts c ON c.id = l.contact_id
 LEFT JOIN projects p ON p.id = l.project_id
 WHERE l.deleted_at IS NULL AND l.id = ?
 LIMIT 1`;

export const LETTER_DETAIL_EMPTY_SQL = `SELECT
   id, title, number, context, status, due_date, received_date,
   organization_id, contact_id, project_id, storage_key,
   original_filename, byte_size,
   NULL AS organization_name, NULL AS contact_name,
   NULL AS project_name, NULL AS project_key
 FROM letters WHERE 0`;

export function dueIsoForOffset(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return endOfLocalDayIso(date);
}

export function asLetterTaskStatus(
  value: string | null | undefined,
): TaskStatus {
  if (value && (TASK_STATUS_ORDER as readonly string[]).includes(value)) {
    return value as TaskStatus;
  }
  return "triage";
}
