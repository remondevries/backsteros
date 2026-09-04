import type {
  ContactRelationshipListItem,
  ContactRelationshipType,
  CrmActivity,
  CrmActivityKind,
  CrmGroup,
  CrmGroupSubjectType,
  CrmRelationshipLabel,
} from "@backsteros/contracts";

import { relationshipTypeLabel } from "./crm-relationship-label-utils";

export type CrmGroupRow = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CrmRelationshipLabelRow = {
  id: string;
  side_a_label: string;
  side_a_slug: string;
  side_b_label: string;
  side_b_slug: string;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ContactRelationshipRow = {
  id: string;
  from_contact_id: string;
  to_contact_id: string;
  type: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  direction: "outgoing" | "incoming";
  related_contact_id: string;
  related_contact_name: string;
};

export type CrmActivityRow = {
  id: string;
  subject_type: string;
  subject_id: string;
  kind: string;
  body: string | null;
  body_preview: string | null;
  meeting_id: string | null;
  occurred_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  meeting_title: string | null;
  meeting_start_at: string | null;
};

export type CrmGroupMemberRow = {
  subject_type: string;
  subject_id: string;
};

export function mapCrmGroupRow(row: CrmGroupRow): CrmGroup {
  return {
    id: row.id,
    workspaceId: "",
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function mapCrmRelationshipLabelRow(
  row: CrmRelationshipLabelRow,
): CrmRelationshipLabel {
  return {
    id: row.id,
    workspaceId: "",
    sideALabel: row.side_a_label,
    sideASlug: row.side_a_slug as ContactRelationshipType,
    sideBLabel: row.side_b_label,
    sideBSlug: row.side_b_slug as ContactRelationshipType,
    color: row.color,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function mapContactRelationshipListItem(
  row: ContactRelationshipRow,
  labels: readonly CrmRelationshipLabel[],
): ContactRelationshipListItem {
  const direction = row.direction;
  const type = row.type as ContactRelationshipType;
  return {
    id: row.id,
    workspaceId: "",
    fromContactId: row.from_contact_id,
    toContactId: row.to_contact_id,
    type,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    direction,
    typeLabel: relationshipTypeLabel(type, direction, labels),
    relatedContactId: row.related_contact_id,
    relatedContactName: row.related_contact_name,
  };
}

function asActivityKind(value: string): CrmActivityKind | null {
  return value === "note" || value === "meeting" ? value : null;
}

function asActivitySubjectType(
  value: string,
): CrmGroupSubjectType | null {
  return value === "contact" || value === "organization" ? value : null;
}

export function mapCrmActivityRow(row: CrmActivityRow): CrmActivity | null {
  const kind = asActivityKind(row.kind);
  const subjectType = asActivitySubjectType(row.subject_type);
  if (!kind || !subjectType || !row.id || !row.occurred_at) return null;
  return {
    id: row.id,
    workspaceId: "",
    subjectType,
    subjectId: row.subject_id,
    kind,
    body: row.body,
    bodyPreview: row.body_preview,
    meetingId: row.meeting_id,
    meetingTitle:
      kind === "meeting" ? row.meeting_title ?? null : undefined,
    meetingStartAt:
      kind === "meeting" && row.meeting_start_at
        ? row.meeting_start_at
        : undefined,
    occurredAt: row.occurred_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function mapCrmGroupMemberSubjectIds(
  rows: CrmGroupMemberRow[],
  subjectType: CrmGroupSubjectType,
): Set<string> {
  return new Set(
    rows
      .filter((row) => row.subject_type === subjectType)
      .map((row) => row.subject_id),
  );
}
