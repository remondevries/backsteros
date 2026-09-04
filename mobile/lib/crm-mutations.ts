import type { BacksterosApiClient } from "@backsteros/api-client";
import { ApiClientError } from "@backsteros/api-client";
import type {
  ContactRelationship,
  ContactRelationshipListItem,
  CrmActivity,
  CrmGroup,
  CrmGroupSubjectType,
  CrmRelationshipLabel,
} from "@backsteros/contracts";
import { CRM_ACTIVITY_PREVIEW_MAX_CHARS } from "@backsteros/contracts";

import { shouldSkipRestEntityWrite } from "./powersync-write-path";

export type MobileCrmPowerSync = {
  ready: boolean;
  connected: boolean;
  database?: {
    getAll: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  } | null;
  createMetadata: (
    table:
      | "contact_relationships"
      | "crm_relationship_labels"
      | "crm_groups"
      | "crm_group_members"
      | "crm_activities",
    values: Record<string, unknown>,
    id?: string,
  ) => Promise<string>;
  patchMetadata: (
    table:
      | "contact_relationships"
      | "crm_relationship_labels"
      | "crm_groups"
      | "crm_group_members"
      | "crm_activities",
    id: string,
    values: Record<string, unknown>,
  ) => Promise<void>;
};

function slugifyRelationshipLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function previewFromBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= CRM_ACTIVITY_PREVIEW_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, CRM_ACTIVITY_PREVIEW_MAX_CHARS - 1)}…`;
}

function canWriteViaPowerSync(powerSync: MobileCrmPowerSync): boolean {
  return Boolean(powerSync.ready && shouldSkipRestEntityWrite(powerSync));
}

async function softDeleteLocally(
  powerSync: MobileCrmPowerSync,
  table:
    | "contact_relationships"
    | "crm_relationship_labels"
    | "crm_groups"
    | "crm_group_members"
    | "crm_activities",
  id: string,
): Promise<void> {
  const deletedAt = new Date().toISOString();
  await powerSync.patchMetadata!(table, id, { deleted_at: deletedAt });
}

async function findCrmGroupMemberIdLocally(
  powerSync: MobileCrmPowerSync,
  input: {
    groupId: string;
    subjectType: CrmGroupSubjectType;
    subjectId: string;
  },
): Promise<string | null> {
  const db = powerSync.database;
  if (!db) return null;
  const rows = await db.getAll<{ id: string }>(
    `SELECT id FROM crm_group_members
     WHERE group_id = ? AND subject_type = ? AND subject_id = ?
       AND deleted_at IS NULL
     LIMIT 1`,
    [input.groupId, input.subjectType, input.subjectId],
  );
  return rows[0]?.id ?? null;
}

export async function createContactRelationshipViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileCrmPowerSync,
  input: {
    fromContactId: string;
    toContactId: string;
    type: string;
    note?: string | null;
  },
): Promise<ContactRelationship> {
  if (canWriteViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata("contact_relationships", {
      from_contact_id: input.fromContactId,
      to_contact_id: input.toContactId,
      type: input.type,
      note: input.note ?? null,
    });
    const now = new Date().toISOString();
    return {
      id,
      workspaceId: "",
      fromContactId: input.fromContactId,
      toContactId: input.toContactId,
      type: input.type as ContactRelationship["type"],
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  }

  return client.requestJson<ContactRelationship>(
    `/api/v1/contacts/${encodeURIComponent(input.fromContactId)}/relationships`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        toContactId: input.toContactId,
        type: input.type,
        note: input.note,
      }),
    },
  );
}

export async function deleteContactRelationshipViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileCrmPowerSync,
  relationshipId: string,
): Promise<void> {
  if (canWriteViaPowerSync(powerSync)) {
    await softDeleteLocally(
      powerSync,
      "contact_relationships",
      relationshipId,
    );
    return;
  }

  await client.requestJson(
    `/api/v1/contact-relationships/${encodeURIComponent(relationshipId)}`,
    { method: "DELETE" },
  );
}

export async function createCrmRelationshipLabelViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileCrmPowerSync,
  input: {
    sideALabel: string;
    sideBLabel: string;
    color?: string | null;
  },
): Promise<CrmRelationshipLabel> {
  const sideALabel = input.sideALabel.trim();
  const sideBLabel = input.sideBLabel.trim();
  const sideASlug = slugifyRelationshipLabel(sideALabel);
  const sideBSlug = slugifyRelationshipLabel(sideBLabel);

  if (canWriteViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata("crm_relationship_labels", {
      side_a_label: sideALabel,
      side_a_slug: sideASlug,
      side_b_label: sideBLabel,
      side_b_slug: sideBSlug,
      color: input.color ?? null,
      sort_order: Date.now(),
    });
    const now = new Date().toISOString();
    return {
      id,
      workspaceId: "",
      sideALabel,
      sideASlug,
      sideBLabel,
      sideBSlug,
      color: input.color ?? null,
      sortOrder: Date.now(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  }

  return client.requestJson<CrmRelationshipLabel>(
    "/api/v1/crm-relationship-labels",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sideALabel,
        sideBLabel,
        color: input.color ?? null,
      }),
    },
  );
}

export async function updateCrmRelationshipLabelViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileCrmPowerSync,
  input: {
    id: string;
    existing: CrmRelationshipLabel;
    sideALabel: string;
    sideBLabel: string;
    color?: string | null;
  },
): Promise<CrmRelationshipLabel> {
  const sideALabel = input.sideALabel.trim();
  const sideBLabel = input.sideBLabel.trim();
  const sideASlug = slugifyRelationshipLabel(sideALabel);
  const sideBSlug = slugifyRelationshipLabel(sideBLabel);

  if (canWriteViaPowerSync(powerSync)) {
    await powerSync.patchMetadata!("crm_relationship_labels", input.id, {
      side_a_label: sideALabel,
      side_a_slug: sideASlug,
      side_b_label: sideBLabel,
      side_b_slug: sideBSlug,
      color: input.color ?? null,
    });
    const now = new Date().toISOString();
    return {
      ...input.existing,
      sideALabel,
      sideASlug,
      sideBLabel,
      sideBSlug,
      color: input.color ?? null,
      updatedAt: now,
    };
  }

  return client.requestJson<CrmRelationshipLabel>(
    `/api/v1/crm-relationship-labels/${encodeURIComponent(input.id)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sideALabel,
        sideBLabel,
        color: input.color ?? null,
      }),
    },
  );
}

export async function deleteCrmRelationshipLabelViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileCrmPowerSync,
  labelId: string,
): Promise<void> {
  if (canWriteViaPowerSync(powerSync)) {
    await softDeleteLocally(powerSync, "crm_relationship_labels", labelId);
    return;
  }

  await client.requestJson(
    `/api/v1/crm-relationship-labels/${encodeURIComponent(labelId)}`,
    { method: "DELETE" },
  );
}

export async function createCrmGroupViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileCrmPowerSync,
  input: { name: string; color?: string | null; description?: string | null },
): Promise<CrmGroup> {
  const name = input.name.trim();
  if (canWriteViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata("crm_groups", {
      name,
      description: input.description ?? null,
      color: input.color ?? null,
      icon: null,
      sort_order: Date.now(),
    });
    const now = new Date().toISOString();
    return {
      id,
      workspaceId: "",
      name,
      description: input.description ?? null,
      color: input.color ?? null,
      icon: null,
      sortOrder: Date.now(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  }

  return client.requestJson<CrmGroup>("/api/v1/crm-groups", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      color: input.color ?? null,
      description: input.description ?? null,
    }),
  });
}

export async function updateCrmGroupViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileCrmPowerSync,
  input: {
    groupId: string;
    existing: CrmGroup;
    name?: string;
    color?: string | null;
  },
): Promise<CrmGroup> {
  if (canWriteViaPowerSync(powerSync)) {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.color !== undefined) patch.color = input.color;
    if (Object.keys(patch).length > 0) {
      await powerSync.patchMetadata!("crm_groups", input.groupId, patch);
    }
    const now = new Date().toISOString();
    return {
      ...input.existing,
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      updatedAt: now,
    };
  }

  return client.requestJson<CrmGroup>(
    `/api/v1/crm-groups/${encodeURIComponent(input.groupId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
      }),
    },
  );
}

export async function deleteCrmGroupViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileCrmPowerSync,
  groupId: string,
): Promise<void> {
  if (canWriteViaPowerSync(powerSync)) {
    await softDeleteLocally(powerSync, "crm_groups", groupId);
    return;
  }

  await client.requestJson(
    `/api/v1/crm-groups/${encodeURIComponent(groupId)}`,
    { method: "DELETE" },
  );
}

export async function addCrmGroupMemberViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileCrmPowerSync,
  input: {
    groupId: string;
    subjectType: CrmGroupSubjectType;
    subjectId: string;
  },
): Promise<void> {
  if (canWriteViaPowerSync(powerSync)) {
    const existingId = await findCrmGroupMemberIdLocally(powerSync, input);
    if (existingId) return;
    await powerSync.createMetadata("crm_group_members", {
      group_id: input.groupId,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
    });
    return;
  }

  await client.requestJson(
    `/api/v1/crm-groups/${encodeURIComponent(input.groupId)}/members`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectType: input.subjectType,
        subjectId: input.subjectId,
      }),
    },
  );
}

export async function removeCrmGroupMemberViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileCrmPowerSync,
  input: {
    groupId: string;
    subjectType: CrmGroupSubjectType;
    subjectId: string;
    memberId?: string | null;
  },
): Promise<void> {
  if (canWriteViaPowerSync(powerSync)) {
    const memberId =
      input.memberId ??
      (await findCrmGroupMemberIdLocally(powerSync, input));
    if (!memberId) return;
    await softDeleteLocally(powerSync, "crm_group_members", memberId);
    return;
  }

  let memberId = input.memberId ?? null;
  if (!memberId) {
    const members = await client.requestJson<{
      members: { id: string; subjectId: string }[];
    }>(`/api/v1/crm-groups/${encodeURIComponent(input.groupId)}/members`);
    memberId =
      members.members.find((entry) => entry.subjectId === input.subjectId)
        ?.id ?? null;
  }
  if (!memberId) return;

  await client.requestJson(
    `/api/v1/crm-groups/${encodeURIComponent(input.groupId)}/members/${encodeURIComponent(memberId)}`,
    { method: "DELETE" },
  );
}

/** POST group membership, retrying while a just-created contact/org uploads (REST path). */
export async function addCrmGroupMemberWithRetry(
  client: BacksterosApiClient,
  powerSync: MobileCrmPowerSync,
  input: {
    groupId: string;
    subjectType: CrmGroupSubjectType;
    subjectId: string;
  },
) {
  if (canWriteViaPowerSync(powerSync)) {
    await addCrmGroupMemberViaPowerSyncOrApi(client, powerSync, input);
    return;
  }

  const SUBJECT_SYNC_RETRY_DELAYS_MS = [0, 150, 300, 600, 1200] as const;
  let lastError: unknown;
  for (const delay of SUBJECT_SYNC_RETRY_DELAYS_MS) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    try {
      await addCrmGroupMemberViaPowerSyncOrApi(client, powerSync, input);
      return;
    } catch (error) {
      lastError = error;
      if (!isSubjectMissingError(error)) throw error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to add group member");
}

function isSubjectMissingError(error: unknown): boolean {
  if (error instanceof ApiClientError && error.status === 404) {
    const message = error.message.toLowerCase();
    return (
      message.includes("contact not found") ||
      message.includes("organization not found") ||
      message.includes("member subject not found")
    );
  }
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("contact not found") ||
    message.includes("organization not found") ||
    message.includes("member subject not found")
  );
}

export async function createCrmActivityNoteViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileCrmPowerSync,
  input: {
    subjectType: CrmGroupSubjectType;
    subjectId: string;
    body: string;
    createdBy?: string | null;
    activityPath: string;
  },
): Promise<CrmActivity> {
  const body = input.body.trim();
  const occurredAt = new Date().toISOString();

  if (canWriteViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata("crm_activities", {
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      kind: "note",
      body,
      body_preview: previewFromBody(body),
      meeting_id: null,
      occurred_at: occurredAt,
      created_by: input.createdBy ?? null,
    });
    const now = new Date().toISOString();
    return {
      id,
      workspaceId: "",
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      kind: "note",
      body,
      bodyPreview: previewFromBody(body),
      meetingId: null,
      meetingTitle: null,
      meetingStartAt: null,
      occurredAt,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  }

  return client.requestJson<CrmActivity>(input.activityPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "note", body }),
  });
}

/** Placeholder list item when PowerSync creates a relationship before REST reload. */
export function optimisticRelationshipListItem(
  relationship: ContactRelationship,
  relatedContactName = "Contact",
): ContactRelationshipListItem {
  return {
    ...relationship,
    direction: "outgoing",
    typeLabel: relationship.type,
    relatedContactId: relationship.toContactId,
    relatedContactName,
  };
}
