import type { BacksterosApiClient } from "@backsteros/api-client";
import {
  taskPatchRequiresRestWrite,
  type Contact,
  type Letter,
  type Organization,
  type Project,
  type Task,
} from "@backsteros/contracts";

import { shouldSkipRestEntityWrite } from "./powersync-write-path";

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
};

export function toSnakeFields(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const snake: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
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
  return (base || fallback) + Math.floor(Math.random() * 90 + 10);
}

export function entityPatchPath(table: MetadataPatchTable, id: string): string {
  if (table === "documents") {
    return `/api/v1/documents/${encodeURIComponent(id)}`;
  }
  if (table === "tasks") return `/api/v1/tasks/${encodeURIComponent(id)}`;
  if (table === "projects") {
    return `/api/v1/projects/${encodeURIComponent(id)}`;
  }
  if (table === "letters") return `/api/v1/letters/${encodeURIComponent(id)}`;
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
    else if (key === "projectId") sqliteValues.project_id = value;
    else if (key === "contactId") sqliteValues.contact_id = value;
    else if (key === "agentChatId") sqliteValues.agent_chat_id = value;
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

/** Optimistic local SQLite first; REST only when PowerSync is not connected. */
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

  if (powerSync.ready && Object.keys(localValues).length > 0) {
    try {
      await patchLocalEntity(powerSync, table, id, localValues);
    } catch {
      if (shouldSkipRestEntityWrite(powerSync)) {
        throw new Error(`Could not update ${table} locally.`);
      }
    }
  }

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
  return Boolean(powerSync.ready && powerSync.createMetadata);
}

export async function createTaskViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileEntityPowerSync,
  body: Record<string, unknown>,
): Promise<{ id: string; number: number | null }> {
  if (shouldCreateViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata!(
      "tasks",
      toSnakeFields({ ...body, number: null }),
    );
    return { id, number: null };
  }

  const task = await client.requestJson<Task>("/api/v1/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { id: task.id, number: task.number ?? null };
}

export async function createContactViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileEntityPowerSync,
  input: { name: string; organizationId?: string | null; sortOrder?: number },
): Promise<{ id: string }> {
  const name = input.name.trim();
  const sortOrder = input.sortOrder ?? -Date.now();
  const organizationId = input.organizationId ?? null;

  if (shouldCreateViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata!(
      "contacts",
      toSnakeFields({
        key: entityKeyFromName(name, "person"),
        name,
        organizationId,
        sortOrder,
      }),
    );
    return { id };
  }

  const contact = await client.requestJson<Contact>("/api/v1/contacts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, organizationId, sortOrder }),
  });
  return { id: contact.id };
}

export async function createOrganizationViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileEntityPowerSync,
  input: { name: string; sortOrder?: number },
): Promise<{ id: string }> {
  const name = input.name.trim();
  const sortOrder = input.sortOrder ?? -Date.now();

  if (shouldCreateViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata!(
      "organizations",
      toSnakeFields({
        key: entityKeyFromName(name, "org"),
        name,
        sortOrder,
      }),
    );
    return { id };
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
): Promise<{ id: string }> {
  if (shouldCreateViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata!(
      "letters",
      toSnakeFields(body),
    );
    return { id };
  }

  const letter = await client.requestJson<Letter>("/api/v1/letters", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { id: letter.id };
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
  if (powerSync.ready) {
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
