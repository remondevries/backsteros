import type { BacksterosApiClient } from "@backsteros/api-client";
import {
  taskPatchRequiresRestWrite,
  type Contact,
  type Letter,
  type Organization,
  type Project,
  type Task,
} from "@backsteros/contracts";

import {
  shouldSkipRestEntityWrite,
  shouldWriteEntityViaPowerSync,
} from "./powersync-write-path";
import {
  pendingTaskDetailFromCreateBody,
  rememberPendingTaskDetail,
  getPendingTaskDetail,
} from "./pending-task-detail";
import { randomUuidCompact } from "./random-uuid";
import { resolveEntityNumberAfterLocalCreate } from "./resolve-entity-number-after-local-create";
import { applyTaskRowOverride } from "./task-row-overrides";

export type SyncedEntityTable =
  | "tasks"
  | "projects"
  | "letters"
  | "contacts"
  | "organizations"
  | "areas";

/** Tier A/B metadata patches — includes documents (not in createMetadata union). */
export type MetadataPatchTable = SyncedEntityTable | "documents";

export type MobileEntityPowerSync = {
  ready: boolean;
  connected: boolean;
  preferRestWrites?: boolean;
  patchTask: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchProject: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchLetter: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchContact: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchOrganization: (
    id: string,
    values: Record<string, unknown>,
  ) => Promise<void>;
  patchArea: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchDocument: (id: string, values: Record<string, unknown>) => Promise<void>;
  createMetadata?: (
    table: SyncedEntityTable,
    values: Record<string, unknown>,
    id?: string,
  ) => Promise<string>;
  flushCrudUpload?: () => Promise<void>;
};

export function toSnakeFields(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const snake: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const snakeKey = key.replace(
      /[A-Z]/g,
      (letter) => `_${letter.toLowerCase()}`,
    );
    if (value === true) {
      snake[snakeKey] = 1;
    } else if (value === false) {
      snake[snakeKey] = 0;
    } else if (value !== null && typeof value === "object") {
      snake[snakeKey] = JSON.stringify(value);
    } else {
      snake[snakeKey] = value;
    }
  }
  return snake;
}

export function entityKeyFromName(name: string, fallback: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 6);
  const suffix = randomUuidCompact().slice(0, 8);
  return `${base || fallback}${suffix}`;
}

export function entityPatchPath(
  table: MetadataPatchTable | "meetings",
  id: string,
): string {
  if (table === "documents") {
    return `/api/v1/documents/${encodeURIComponent(id)}`;
  }
  if (table === "tasks") return `/api/v1/tasks/${encodeURIComponent(id)}`;
  if (table === "projects") {
    return `/api/v1/projects/${encodeURIComponent(id)}`;
  }
  if (table === "letters") return `/api/v1/letters/${encodeURIComponent(id)}`;
  if (table === "meetings") {
    return `/api/v1/meetings/${encodeURIComponent(id)}`;
  }
  if (table === "contacts") {
    return `/api/v1/contacts/${encodeURIComponent(id)}`;
  }
  if (table === "areas") {
    return `/api/v1/areas/${encodeURIComponent(id)}`;
  }
  return `/api/v1/organizations/${encodeURIComponent(id)}`;
}

export function taskApiPatchToSqlite(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const sqliteValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "dueDate") sqliteValues.due_date = value;
    else if (key === "dueEndDate") sqliteValues.due_end_date = value;
    else if (key === "trackedMinutes") sqliteValues.tracked_minutes = value;
    else if (key === "trackedDurationSeconds") {
      sqliteValues.tracked_duration_seconds = value;
    } else if (key === "assigneeId") sqliteValues.assignee_id = value;
    else if (key === "relatedContactIds") {
      sqliteValues.related_contact_ids = Array.isArray(value)
        ? JSON.stringify(value)
        : value;
    } else if (key === "relatedOrganizationIds") {
      sqliteValues.related_organization_ids = Array.isArray(value)
        ? JSON.stringify(value)
        : value;
    } else if (key === "projectId") sqliteValues.project_id = value;
    else if (key === "contactId") sqliteValues.contact_id = value;
    else if (key === "agentChatId") sqliteValues.agent_chat_id = value;
    else if (key === "linkedCommitSha") sqliteValues.linked_commit_sha = value;
    else if (key === "agentInboxApproved") {
      if (value === true) {
        sqliteValues.agent_inbox_approved_at = new Date().toISOString();
      }
    } else if (key === "inbox") sqliteValues.inbox = value ? 1 : 0;
    else if (key === "activityActor") continue;
    else if (key === "acknowledgeInboxUpdate") continue;
    else sqliteValues[key] = value;
  }
  return sqliteValues;
}

export function letterApiPatchToSqlite(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const sqliteValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "dueDate") sqliteValues.due_date = value;
    else if (key === "receivedDate") sqliteValues.received_date = value;
    else if (key === "organizationId") sqliteValues.organization_id = value;
    else if (key === "contactId") sqliteValues.contact_id = value;
    else if (key === "projectId") sqliteValues.project_id = value;
    else if (key === "originalFilename") sqliteValues.original_filename = value;
    else sqliteValues[key] = value;
  }
  return sqliteValues;
}

export function projectApiPatchToSqlite(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const sqliteValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "startDate") sqliteValues.start_date = value;
    else if (key === "dueDate") sqliteValues.due_date = value;
    else if (key === "organizationId") sqliteValues.organization_id = value;
    else if (key === "areaId") sqliteValues.area_id = value;
    else if (key === "githubRepository") sqliteValues.github_repository = value;
    else if (key === "localWorkingDirectory") {
      sqliteValues.local_working_directory = value;
    }
    else sqliteValues[key] = value;
  }
  return sqliteValues;
}

export function documentApiPatchToSqlite(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const sqliteValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "parentId") sqliteValues.parent_id = value;
    else if (key === "sortOrder") sqliteValues.sort_order = value;
    else if (key === "projectId") sqliteValues.project_id = value;
    else if (key === "journalDate") sqliteValues.journal_date = value;
    else if (key === "contentVersion") sqliteValues.content_version = value;
    else if (key === "contentEtag") sqliteValues.content_etag = value;
    else if (key === "storageKey") sqliteValues.storage_key = value;
    else if (key === "contentType") sqliteValues.content_type = value;
    else if (key === "byteSize") sqliteValues.byte_size = value;
    else sqliteValues[key] = value;
  }
  return sqliteValues;
}

function defaultSqliteValues(
  table: MetadataPatchTable,
  apiValues: Record<string, unknown>,
): Record<string, unknown> {
  if (table === "tasks") return taskApiPatchToSqlite(apiValues);
  if (table === "letters") return letterApiPatchToSqlite(apiValues);
  if (table === "projects") return projectApiPatchToSqlite(apiValues);
  if (table === "documents") return documentApiPatchToSqlite(apiValues);
  return toSnakeFields(apiValues);
}

async function patchLocalEntity(
  powerSync: MobileEntityPowerSync,
  table: MetadataPatchTable,
  id: string,
  sqliteValues: Record<string, unknown>,
): Promise<void> {
  switch (table) {
    case "tasks":
      await powerSync.patchTask(id, sqliteValues);
      return;
    case "projects":
      await powerSync.patchProject(id, sqliteValues);
      return;
    case "letters":
      await powerSync.patchLetter(id, sqliteValues);
      return;
    case "contacts":
      await powerSync.patchContact(id, sqliteValues);
      return;
    case "organizations":
      await powerSync.patchOrganization(id, sqliteValues);
      return;
    case "areas":
      await powerSync.patchArea(id, sqliteValues);
      return;
    case "documents":
      await powerSync.patchDocument(id, sqliteValues);
      return;
  }
}

/** Optimistic local SQLite first; REST only when PowerSync is not connected
 *  (plus the sole dual-write exception in {@link taskPatchRequiresRestWrite}). */
export async function patchEntityViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileEntityPowerSync,
  table: MetadataPatchTable,
  id: string,
  apiValues: Record<string, unknown>,
  sqliteValues?: Record<string, unknown>,
): Promise<void> {
  if (Object.keys(apiValues).length === 0) return;

  const localValues =
    sqliteValues ?? defaultSqliteValues(table, apiValues);

  if (
    shouldWriteEntityViaPowerSync(powerSync) &&
    Object.keys(localValues).length > 0
  ) {
    try {
      await patchLocalEntity(powerSync, table, id, localValues);
    } catch {
      if (shouldSkipRestEntityWrite(powerSync)) {
        throw new Error(`Could not update ${table} locally.`);
      }
    }
  }

  // Skip REST while PowerSync uploads — except agentInboxApproved (sole exception).
  if (
    shouldSkipRestEntityWrite(powerSync) &&
    !taskPatchRequiresRestWrite(apiValues)
  ) {
    return;
  }

  await client.requestJson(entityPatchPath(table, id), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(apiValues),
  });
}

function shouldCreateViaPowerSync(powerSync: MobileEntityPowerSync): boolean {
  return Boolean(
    shouldWriteEntityViaPowerSync(powerSync) && powerSync.createMetadata,
  );
}

export async function createTaskViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileEntityPowerSync,
  body: Record<string, unknown>,
): Promise<{ id: string; number: number | null }> {
  if (shouldCreateViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata!(
      "tasks",
      toSnakeFields({ ...body, number: null, links: body.links ?? [] }),
    );
    rememberPendingTaskDetail(pendingTaskDetailFromCreateBody(id, body));
    applyTaskRowOverride(id, {
      title: typeof body.title === "string" ? body.title : null,
      status: typeof body.status === "string" ? body.status : null,
      priority: typeof body.priority === "number" ? body.priority : 0,
      due_date: typeof body.dueDate === "string" ? body.dueDate : null,
      project_id: typeof body.projectId === "string" ? body.projectId : null,
      assignee_id:
        typeof body.assigneeId === "string" ? body.assigneeId : null,
      description:
        typeof body.description === "string" ? body.description : null,
    });
    const number = await resolveEntityNumberAfterLocalCreate(
      client,
      powerSync,
      entityPatchPath("tasks", id),
      async (assigned) => {
        await powerSync.patchTask(id, { number: assigned });
        const pending = getPendingTaskDetail(id);
        if (pending) {
          rememberPendingTaskDetail({ ...pending, number: assigned });
        }
      },
    );
    return { id, number };
  }

  const task = await client.requestJson<Task>("/api/v1/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  rememberPendingTaskDetail(
    pendingTaskDetailFromCreateBody(task.id, {
      ...body,
      number: task.number,
      title: task.title,
    }),
  );
  return { id: task.id, number: task.number ?? null };
}

export async function createContactViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileEntityPowerSync,
  input: { name: string; organizationId?: string | null; sortOrder?: number },
): Promise<{ id: string; number?: number | null }> {
  const name = input.name.trim();
  const sortOrder = input.sortOrder ?? -Date.now();
  const organizationId = input.organizationId ?? null;

  if (shouldCreateViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata!(
      "contacts",
      toSnakeFields({
        key: entityKeyFromName(name, "person"),
        name,
        firstName: name,
        lastName: "",
        organizationId,
        sortOrder,
        number: null,
      }),
    );
    const number = await resolveEntityNumberAfterLocalCreate(
      client,
      powerSync,
      entityPatchPath("contacts", id),
      async (assigned) => {
        await powerSync.patchContact(id, { number: assigned });
      },
    );
    return { id, number };
  }

  const contact = await client.requestJson<Contact>("/api/v1/contacts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      firstName: name,
      lastName: "",
      organizationId,
      sortOrder,
    }),
  });
  return { id: contact.id };
}

export async function createOrganizationViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileEntityPowerSync,
  input: { name: string; sortOrder?: number },
): Promise<{ id: string; number?: number | null }> {
  const name = input.name.trim();
  const sortOrder = input.sortOrder ?? -Date.now();

  if (shouldCreateViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata!(
      "organizations",
      toSnakeFields({
        key: entityKeyFromName(name, "org"),
        name,
        sortOrder,
        number: null,
      }),
    );
    const number = await resolveEntityNumberAfterLocalCreate(
      client,
      powerSync,
      entityPatchPath("organizations", id),
      async (assigned) => {
        await powerSync.patchOrganization(id, { number: assigned });
      },
    );
    return { id, number };
  }

  const organization = await client.requestJson<Organization>(
    "/api/v1/organizations",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, sortOrder }),
    },
  );
  return { id: organization.id };
}

export async function createProjectViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileEntityPowerSync,
  body: Record<string, unknown>,
): Promise<{ id: string; key: string }> {
  if (shouldCreateViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata!(
      "projects",
      toSnakeFields(body),
    );
    const key =
      typeof body.key === "string" && body.key.trim()
        ? body.key.trim()
        : "PRJ";
    return { id, key };
  }

  const project = await client.requestJson<Project>("/api/v1/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { id: project.id, key: project.key };
}

export async function createLetterViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileEntityPowerSync,
  body: Record<string, unknown>,
): Promise<{ id: string; number: number | null }> {
  if (shouldCreateViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata!(
      "letters",
      toSnakeFields({ ...body, number: null }),
    );
    const number = await resolveEntityNumberAfterLocalCreate(
      client,
      powerSync,
      entityPatchPath("letters", id),
      async (assigned) => {
        await powerSync.patchLetter(id, { number: assigned });
      },
    );
    return { id, number };
  }

  const letter = await client.requestJson<Letter>("/api/v1/letters", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { id: letter.id, number: letter.number ?? null };
}

export type SoftDeletableEntityTable = MetadataPatchTable;

export type MobileSoftDeletePowerSync = MobileEntityPowerSync;

export function entityDeletePath(
  table: SoftDeletableEntityTable,
  id: string,
): string {
  if (table === "documents") {
    return `/api/v1/documents/${encodeURIComponent(id)}`;
  }
  return entityPatchPath(table, id);
}

async function softDeleteLocalEntity(
  powerSync: MobileSoftDeletePowerSync,
  table: SoftDeletableEntityTable,
  id: string,
  deletedAt: string,
): Promise<void> {
  const values = { deleted_at: deletedAt };
  switch (table) {
    case "tasks":
      await powerSync.patchTask(id, values);
      return;
    case "projects":
      await powerSync.patchProject(id, values);
      return;
    case "letters":
      await powerSync.patchLetter(id, values);
      return;
    case "contacts":
      await powerSync.patchContact(id, values);
      return;
    case "organizations":
      await powerSync.patchOrganization(id, values);
      return;
    case "areas":
      await powerSync.patchArea(id, values);
      return;
    case "documents":
      await powerSync.patchDocument(id, values);
      return;
  }
}

/** Soft-delete locally first; REST DELETE only when PowerSync is not connected. */
export async function softDeleteEntityViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileSoftDeletePowerSync,
  table: SoftDeletableEntityTable,
  id: string,
): Promise<void> {
  const deletedAt = new Date().toISOString();
  if (shouldWriteEntityViaPowerSync(powerSync)) {
    await softDeleteLocalEntity(powerSync, table, id, deletedAt);
    if (shouldSkipRestEntityWrite(powerSync)) {
      return;
    }
    try {
      await client.requestJson(entityDeletePath(table, id), { method: "DELETE" });
    } catch {
      // Local soft-delete remains queued for PowerSync upload.
    }
    return;
  }
  await client.requestJson(entityDeletePath(table, id), { method: "DELETE" });
}
