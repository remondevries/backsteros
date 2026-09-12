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

import { findExistingCrmGroupByName } from "./crm-group-name";
import { shouldSkipRestEntityWrite } from "./powersync-write-path";
import type { WorkspacePowerSync } from "./workspace-data-types";

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

/**
 * Prefer local SQLite when PowerSync is ready — same gate as contact/org
 * creates. Requiring `connected` forced REST while a just-created contact was
 * still local-only, so relationship writes 404'd.
 *
 * CRM groups/members are intentionally excluded: they always write via REST so
 * desktop, portal, and cloud-core share one Postgres membership table.
 */
function canWriteViaPowerSync(powerSync: WorkspacePowerSync): boolean {
  return Boolean(powerSync.ready && powerSync.createMetadata);
}

/** CRM groups are API/Postgres-only (portal reads the same table). */
export function crmGroupsUseRestOnly(): boolean {
  return true;
}

async function flushCrmCrudUpload(
  powerSync: WorkspacePowerSync,
  label: string,
): Promise<void> {
  if (!powerSync.flushCrudUpload) return;
  try {
    await powerSync.flushCrudUpload();
  } catch (error) {
    console.warn(`[desktop] ${label} upload flush deferred`, error);
  }
}

async function softDeleteLocally(
  powerSync: WorkspacePowerSync,
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

export async function createContactRelationshipViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  input: {
    fromContactId: string;
    toContactId: string;
    type: string;
    note?: string | null;
  },
): Promise<ContactRelationship> {
  if (canWriteViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata!("contact_relationships", {
      from_contact_id: input.fromContactId,
      to_contact_id: input.toContactId,
      type: input.type,
      note: input.note ?? null,
    });
    // Push contact + relationship CRUD together so the server does not skip
    // the edge with CONTACT_NOT_FOUND while the contact create is still queued.
    if (powerSync.flushCrudUpload && shouldSkipRestEntityWrite(powerSync)) {
      try {
        await powerSync.flushCrudUpload();
      } catch (error) {
        console.warn("[desktop] relationship upload flush deferred", error);
      }
    }
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

  return createContactRelationshipViaApiWithRetry(client, input);
}

/** POST relationship, retrying while a just-created contact uploads (REST path). */
async function createContactRelationshipViaApiWithRetry(
  client: BacksterosApiClient,
  input: {
    fromContactId: string;
    toContactId: string;
    type: string;
    note?: string | null;
  },
): Promise<ContactRelationship> {
  const SUBJECT_SYNC_RETRY_DELAYS_MS = [0, 150, 300, 600, 1200] as const;
  let lastError: unknown;
  for (const delay of SUBJECT_SYNC_RETRY_DELAYS_MS) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    try {
      return await client.requestJson<ContactRelationship>(
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
    } catch (error) {
      lastError = error;
      if (!isSubjectMissingError(error)) throw error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to create contact relationship");
}

export async function deleteContactRelationshipViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
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
  powerSync: WorkspacePowerSync,
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
  powerSync: WorkspacePowerSync,
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
  powerSync: WorkspacePowerSync,
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
  powerSync: WorkspacePowerSync,
  input: { name: string; color?: string | null; description?: string | null },
): Promise<CrmGroup> {
  const name = input.name.trim();
  const existing = await findExistingCrmGroupByName(client, powerSync, name);
  if (existing) {
    return existing;
  }

  // Flush pending contact/org CRUD so a follow-up membership POST can resolve subjects.
  await flushCrmCrudUpload(powerSync, "crm group create preflight");

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
  _powerSync: WorkspacePowerSync,
  input: {
    groupId: string;
    existing: CrmGroup;
    name?: string;
    color?: string | null;
  },
): Promise<CrmGroup> {
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
  _powerSync: WorkspacePowerSync,
  groupId: string,
): Promise<void> {
  await client.requestJson(
    `/api/v1/crm-groups/${encodeURIComponent(groupId)}`,
    { method: "DELETE" },
  );
}

export async function addCrmGroupMemberViaPowerSyncOrApi(
  client: BacksterosApiClient,
  _powerSync: WorkspacePowerSync,
  input: {
    groupId: string;
    subjectType: CrmGroupSubjectType;
    subjectId: string;
  },
): Promise<void> {
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
  _powerSync: WorkspacePowerSync,
  input: {
    groupId: string;
    subjectType: CrmGroupSubjectType;
    subjectId: string;
    memberId?: string | null;
  },
): Promise<void> {
  let memberId = input.memberId ?? null;
  if (!memberId) {
    const members = await client.requestJson<{
      members: { id: string; subjectId: string; subjectType: string }[];
    }>(`/api/v1/crm-groups/${encodeURIComponent(input.groupId)}/members`);
    memberId =
      members.members.find(
        (entry) =>
          entry.subjectId === input.subjectId &&
          entry.subjectType === input.subjectType,
      )?.id ?? null;
  }
  if (!memberId) return;

  await client.requestJson(
    `/api/v1/crm-groups/${encodeURIComponent(input.groupId)}/members/${encodeURIComponent(memberId)}`,
    { method: "DELETE" },
  );
}

/** POST group membership, retrying while a just-created contact/org uploads. */
export async function addCrmGroupMemberWithRetry(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  input: {
    groupId: string;
    subjectType: CrmGroupSubjectType;
    subjectId: string;
  },
) {
  const SUBJECT_SYNC_RETRY_DELAYS_MS = [0, 150, 300, 600, 1200] as const;

  // Contact/org may still be uploading via PowerSync — land them before REST membership.
  await flushCrmCrudUpload(powerSync, "crm group member preflight");

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
      if (!isSubjectMissingError(error) && !isRetryableUploadError(error)) {
        throw error;
      }
      await flushCrmCrudUpload(powerSync, "crm group member retry");
    }
  }
  throw lastError instanceof Error
    ? lastError.message.toLowerCase().includes("subject") ||
      lastError.message.toLowerCase().includes("not found")
      ? new Error(
          "Contact or organization is not on the server yet. Wait for sync or re-save it, then try again.",
        )
      : lastError
    : new Error("Failed to add group member");
}

function isRetryableUploadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("powersync upload failed (503)") ||
    message.includes("powersync upload failed (502)") ||
    message.includes("powersync upload failed (500)") ||
    message.includes("powersync_mutation_claim_race") ||
    message.includes("group_not_found") ||
    message.includes("subject_not_found")
  );
}

function isSubjectMissingError(error: unknown): boolean {
  if (error instanceof ApiClientError && error.status === 404) {
    const message = error.message.toLowerCase();
    return (
      message.includes("contact not found") ||
      message.includes("related contact") ||
      message.includes("organization not found") ||
      message.includes("member subject not found")
    );
  }
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("contact not found") ||
    message.includes("related contact") ||
    message.includes("organization not found") ||
    message.includes("member subject not found") ||
    message.includes("subject_not_found") ||
    message.includes("group_not_found")
  );
}

export async function createCrmActivityNoteViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
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
