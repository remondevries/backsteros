import { and, asc, desc, eq, gt } from "drizzle-orm";

import type {
  CreateProjectInput,
  CreateTaskInput,
  DocumentType,
  Project,
  Task,
  UpdateProjectInput,
  UpdateTaskInput,
} from "@backsteros/contracts";
import {
  contactInputSchema,
  letterInputSchema,
  organizationInputSchema,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  documents,
  contacts,
  letters,
  mutationReceipts,
  organizations,
  projects,
  syncEvents,
  tasks,
  workspaceSettings,
} from "../db/schema.js";
import type { PowerSyncOp, SyncEntity, SyncOperation } from "../lib/sync-constants.js";
import { SYNC_SCHEMA_VERSION } from "../lib/sync-constants.js";
import { isSpacesConfigured } from "../lib/storage.js";
import * as documentService from "./documents.js";
import * as circleService from "./circle-domain.js";
import * as taskProjectService from "./tasks-projects.js";

const PULL_PAGE_SIZE = 100;
type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

export type SyncChange = {
  entity: SyncEntity;
  entity_id: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  updated_at: number;
};

export type SyncMutation = {
  id: string;
  changes: SyncChange[];
};

function projectSnapshot(row: typeof projects.$inferSelect) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    summary: row.summary,
    description: row.description,
    organization_id: row.organizationId,
    area_id: row.areaId,
    area: row.area,
    start_date: row.startDate?.toISOString() ?? null,
    due_date: row.dueDate?.toISOString() ?? null,
    icon: row.icon,
    color: row.color,
    status: row.status,
    priority: row.priority,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function taskSnapshot(row: typeof tasks.$inferSelect) {
  return {
    id: row.id,
    project_id: row.projectId,
    contact_id: row.contactId,
    assignee_id: row.assigneeId,
    number: row.number,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    sort_order: row.sortOrder,
    due_date: row.dueDate?.toISOString() ?? null,
    triaged_at: row.triagedAt?.toISOString() ?? null,
    inbox: row.inbox,
    completed_at: row.completedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function documentSnapshot(row: typeof documents.$inferSelect) {
  return {
    id: row.id,
    type: row.type,
    project_id: row.projectId,
    parent_id: row.parentId,
    kind: row.kind,
    icon: row.icon,
    sort_order: row.sortOrder,
    journal_date: row.journalDate,
    path: row.path,
    title: row.title,
    storage_key: row.storageKey,
    content_type: row.contentType,
    byte_size: row.byteSize,
    checksum: row.checksum,
    snippet: row.snippet,
    content_version: row.contentVersion,
    content_etag: row.contentEtag,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function organizationSnapshot(row: typeof organizations.$inferSelect) {
  return {
    id: row.id, number: row.number, key: row.key, name: row.name,
    summary: row.summary, phone: row.phone, email: row.email, website: row.website,
    address: row.address, city: row.city, postal_code: row.postalCode,
    country: row.country, avatar_storage_key: row.avatarStorageKey,
    avatar_content_type: row.avatarContentType, sort_order: row.sortOrder,
    notes: row.notes, created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(), deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function contactSnapshot(row: typeof contacts.$inferSelect) {
  return {
    id: row.id, number: row.number, key: row.key, organization_id: row.organizationId,
    name: row.name, email: row.email, title: row.title, summary: row.summary,
    avatar_storage_key: row.avatarStorageKey, avatar_content_type: row.avatarContentType,
    sort_order: row.sortOrder, phone: row.phone, role: row.role, notes: row.notes,
    address: row.address, city: row.city, postal_code: row.postalCode, country: row.country,
    social_accounts: JSON.stringify(row.socialAccounts ?? []),
    created_at: row.createdAt.toISOString(), updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

function letterSnapshot(row: typeof letters.$inferSelect) {
  return {
    id: row.id, number: row.number, project_id: row.projectId,
    organization_id: row.organizationId, contact_id: row.contactId, title: row.title,
    icon: row.icon, context: row.context, status: row.status,
    due_date: row.dueDate?.toISOString() ?? null,
    received_date: row.receivedDate?.toISOString() ?? null, direction: row.direction,
    storage_key: row.storageKey, original_filename: row.originalFilename,
    content_type: row.contentType, byte_size: row.byteSize, checksum: row.checksum,
    content_etag: row.contentEtag,
    sort_order: row.sortOrder, created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(), deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

async function maxCursor(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<number> {
  const [row] = await executor
    .select({ cursor: syncEvents.cursor })
    .from(syncEvents)
    .where(eq(syncEvents.workspaceId, workspaceId))
    .orderBy(desc(syncEvents.cursor))
    .limit(1);
  return row?.cursor ?? 0;
}

export async function bootstrapSync(workspaceId: string) {
  const [
    projectRows,
    taskRows,
    documentRows,
    organizationRows,
    contactRows,
    letterRows,
    settings,
  ] = await Promise.all([
    taskProjectService.listProjects(workspaceId),
    taskProjectService.listTasks(workspaceId),
    documentService.listDocuments(workspaceId),
    circleService.listOrganizations(workspaceId),
    circleService.listContacts(workspaceId),
    circleService.listLetters(workspaceId),
    circleService.getSettings(workspaceId),
  ]);

  return {
    schema_version: SYNC_SCHEMA_VERSION,
    cursor: await maxCursor(workspaceId),
    spaces_configured: isSpacesConfigured(),
    snapshot: {
      projects: projectRows.map(projectSnapshot),
      tasks: taskRows.map(taskSnapshot),
      documents: documentRows.map(documentSnapshot),
      organizations: organizationRows.map(organizationSnapshot),
      contacts: contactRows.map(contactSnapshot),
      letters: letterRows.map(letterSnapshot),
      workspace_settings: [{ id: workspaceId, settings }],
    },
  };
}

export async function pullSync(workspaceId: string, cursor: number) {
  const events = await db
    .select()
    .from(syncEvents)
    .where(
      and(
        eq(syncEvents.workspaceId, workspaceId),
        gt(syncEvents.cursor, cursor),
      ),
    )
    .orderBy(asc(syncEvents.cursor))
    .limit(PULL_PAGE_SIZE + 1);

  const hasMore = events.length > PULL_PAGE_SIZE;
  const page = hasMore ? events.slice(0, PULL_PAGE_SIZE) : events;
  const nextCursor = page.length > 0 ? page[page.length - 1]!.cursor : cursor;

  return {
    schema_version: SYNC_SCHEMA_VERSION,
    cursor: nextCursor,
    has_more: hasMore,
    events: page.map((row) => ({
      cursor: row.cursor,
      mutation_id: row.mutationId,
      device_id: row.deviceId,
      entity: row.entity,
      entity_id: row.entityId,
      operation: row.operation,
      payload: row.payload,
      created_at: row.createdAt.getTime(),
    })),
  };
}

async function recordSyncEvent(input: {
  workspaceId: string;
  mutationId: string;
  deviceId?: string;
  entity: SyncEntity;
  entityId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
}, executor: DbExecutor = db) {
  await executor.insert(syncEvents).values({
    workspaceId: input.workspaceId,
    mutationId: input.mutationId,
    deviceId: input.deviceId ?? null,
    entity: input.entity,
    entityId: input.entityId,
    operation: input.operation,
    payload: input.payload,
  });
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  // PowerSync SQLite stores booleans as 0/1 integers.
  if (value === 0) return false;
  if (value === 1) return true;
  return undefined;
}

function isSoftDeletePayload(payload: Record<string, unknown>): boolean {
  const deletedAt = payload.deleted_at ?? payload.deletedAt;
  return deletedAt != null && deletedAt !== "";
}

/** Permanent client/data errors — acknowledge with 2xx so the upload queue is not blocked. */
const POWERSYNC_SKIPPABLE_ERRORS = new Set([
  "TASK_TITLE_REQUIRED",
  "PROJECT_FIELDS_REQUIRED",
  "DOCUMENT_FIELDS_REQUIRED",
  "INVALID_ORGANIZATION",
  "INVALID_CONTACT",
  "INVALID_LETTER",
  "INVALID_WORKSPACE_SETTINGS",
]);

function camelizePayload(
  payload: Record<string, unknown>,
  keys: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [source, target] of Object.entries(keys)) {
    if (Object.prototype.hasOwnProperty.call(payload, source)) {
      result[target] = payload[source];
    } else if (Object.prototype.hasOwnProperty.call(payload, target)) {
      result[target] = payload[target];
    }
  }
  return result;
}

const organizationKeys = {
  number: "number", key: "key", name: "name", summary: "summary", phone: "phone",
  email: "email", website: "website", address: "address", city: "city",
  postal_code: "postalCode", country: "country", sort_order: "sortOrder", notes: "notes",
};
const contactKeys = {
  number: "number", key: "key", organization_id: "organizationId", name: "name",
  email: "email", title: "title", summary: "summary", sort_order: "sortOrder",
  phone: "phone", role: "role", notes: "notes",
  address: "address", city: "city", postal_code: "postalCode", country: "country",
  social_accounts: "socialAccounts",
};

function normalizeContactSyncPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...payload };
  if (typeof next.socialAccounts === "string") {
    try {
      next.socialAccounts = JSON.parse(next.socialAccounts);
    } catch {
      next.socialAccounts = [];
    }
  }
  return next;
}

const letterKeys = {
  number: "number", project_id: "projectId", organization_id: "organizationId",
  contact_id: "contactId", title: "title", icon: "icon", context: "context",
  status: "status", due_date: "dueDate", received_date: "receivedDate",
  direction: "direction", original_filename: "originalFilename",
  sort_order: "sortOrder",
};

function mapProjectUpsert(
  payload: Record<string, unknown>,
): CreateProjectInput | UpdateProjectInput {
  return {
    key: asString(payload.key),
    name: asString(payload.name),
    summary: asString(payload.summary),
    description: asString(payload.description),
    organizationId: asString(payload.organization_id ?? payload.organizationId),
    areaId: asString(payload.area_id ?? payload.areaId),
    area: asString(payload.area) as Project["area"] | undefined,
    startDate: asString(payload.start_date ?? payload.startDate),
    dueDate: asString(payload.due_date ?? payload.dueDate),
    icon: asString(payload.icon),
    color: asString(payload.color),
    status: asString(payload.status) as Project["status"] | undefined,
    priority: asNumber(payload.priority),
    sortOrder: asNumber(payload.sort_order ?? payload.sortOrder),
  };
}

function mapTaskUpsert(
  payload: Record<string, unknown>,
): CreateTaskInput | UpdateTaskInput {
  return {
    projectId: asString(payload.project_id ?? payload.projectId),
    contactId: asString(payload.contact_id ?? payload.contactId),
    assigneeId: asString(payload.assignee_id ?? payload.assigneeId),
    title: asString(payload.title),
    description: asString(payload.description),
    status: asString(payload.status) as Task["status"] | undefined,
    priority: asNumber(payload.priority),
    sortOrder: asNumber(payload.sort_order ?? payload.sortOrder),
    dueDate: asString(payload.due_date ?? payload.dueDate),
    triagedAt: asString(payload.triaged_at ?? payload.triagedAt),
    inbox: asBoolean(payload.inbox),
  };
}

export async function applySyncChange(
  workspaceId: string,
  change: SyncChange,
  executor: DbExecutor = db,
) {
  switch (change.entity) {
    case "project": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await taskProjectService.deleteProject(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? projectSnapshot(row) : null;
      }

      const existing = await taskProjectService.getProjectById(
        workspaceId,
        change.entity_id,
        executor,
      );
      const input = mapProjectUpsert(change.payload);

      if (existing) {
        const row = await taskProjectService.updateProject(
          workspaceId,
          change.entity_id,
          input,
          executor,
        );
        return row ? projectSnapshot(row) : null;
      }

      if (change.operation === "patch") {
        return null;
      }

      if (!input.key || !input.name) {
        throw new Error("PROJECT_FIELDS_REQUIRED");
      }

      const row = await taskProjectService.createProject(
        workspaceId,
        {
          key: input.key,
          name: input.name,
          summary: input.summary,
          description: input.description,
          organizationId: input.organizationId,
          areaId: input.areaId,
          area: input.area,
          startDate: input.startDate,
          dueDate: input.dueDate,
          icon: input.icon,
          color: input.color,
          status: input.status,
          priority: input.priority,
          sortOrder: input.sortOrder,
        },
        change.entity_id,
        executor,
      );
      return projectSnapshot(row);
    }

    case "task": {
      // Local soft-deletes upload as PATCH { deleted_at } after REST DELETE already
      // removed the row — treat as idempotent delete, never as create.
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await taskProjectService.deleteTask(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? taskSnapshot(row) : null;
      }

      const existing = await taskProjectService.getTaskById(
        workspaceId,
        change.entity_id,
        executor,
      );
      const input = mapTaskUpsert(change.payload);

      if (existing) {
        const row = await taskProjectService.updateTask(
          workspaceId,
          change.entity_id,
          input,
          executor,
        );
        return row ? taskSnapshot(row) : null;
      }

      // PATCH only carries changed columns — cannot invent a row.
      if (change.operation === "patch") {
        return null;
      }

      if (!input.title) {
        throw new Error("TASK_TITLE_REQUIRED");
      }

      const row = await taskProjectService.createTask(
        workspaceId,
        {
          projectId: input.projectId,
          contactId: input.contactId,
          assigneeId: input.assigneeId,
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          sortOrder: input.sortOrder,
          dueDate: input.dueDate,
          triagedAt: input.triagedAt,
          inbox: input.inbox,
        },
        change.entity_id,
        executor,
      );
      return taskSnapshot(row);
    }

    case "document": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await documentService.deleteDocument(
          workspaceId,
          change.entity_id,
          executor,
        );
        return row ? documentSnapshot(row) : null;
      }

      const type = asString(change.payload.type) as DocumentType | undefined;
      const path = asString(change.payload.path);
      const title = asString(change.payload.title);
      const projectId = asString(change.payload.project_id ?? change.payload.projectId);
      const parentId = asString(change.payload.parent_id ?? change.payload.parentId);
      const icon = asString(change.payload.icon);
      const sortOrder = asNumber(change.payload.sort_order ?? change.payload.sortOrder);
      const journalDate = asString(change.payload.journal_date ?? change.payload.journalDate);

      const existing = await documentService.getDocumentById(
        workspaceId,
        change.entity_id,
        executor,
      );
      if (existing) {
        const row = await documentService.updateDocument(
          workspaceId,
          change.entity_id,
          { title, path, parentId, icon, sortOrder, journalDate },
          executor,
        );
        return row ? documentSnapshot(row) : null;
      }

      if (change.operation === "patch") {
        return null;
      }

      if (!type || !path || !title) {
        throw new Error("DOCUMENT_FIELDS_REQUIRED");
      }

      const row = await documentService.createDocument(
        workspaceId,
        {
          type,
          path,
          title,
          projectId,
          parentId,
          kind: asString(change.payload.kind) as "document" | "folder" | undefined,
          icon,
          sortOrder,
          journalDate,
        },
        change.entity_id,
        executor,
      );
      return documentSnapshot(row);
    }

    case "organization": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await circleService.deleteOrganization(
          workspaceId, change.entity_id, executor,
        );
        return row ? organizationSnapshot(row) : null;
      }
      const existing = await circleService.getOrganizationById(
        workspaceId, change.entity_id, executor,
      );
      const payload = camelizePayload(change.payload, organizationKeys);
      if (existing) {
        const parsed = organizationInputSchema.partial().safeParse(payload);
        if (!parsed.success) throw new Error("INVALID_ORGANIZATION");
        const row = await circleService.updateOrganization(
          workspaceId, change.entity_id, parsed.data, executor,
        );
        return row ? organizationSnapshot(row) : null;
      }
      if (change.operation === "patch") return null;
      const parsed = organizationInputSchema.safeParse(payload);
      if (!parsed.success) throw new Error("INVALID_ORGANIZATION");
      const row = await circleService.createOrganization(
        workspaceId, parsed.data, change.entity_id, executor,
      );
      return organizationSnapshot(row);
    }

    case "contact": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await circleService.deleteContact(
          workspaceId, change.entity_id, executor,
        );
        return row ? contactSnapshot(row) : null;
      }
      const existing = await circleService.getContactById(
        workspaceId, change.entity_id, executor,
      );
      const payload = normalizeContactSyncPayload(
        camelizePayload(change.payload, contactKeys),
      );
      if (existing) {
        const parsed = contactInputSchema.partial().safeParse(payload);
        if (!parsed.success) throw new Error("INVALID_CONTACT");
        const row = await circleService.updateContact(
          workspaceId, change.entity_id, parsed.data, executor,
        );
        return row ? contactSnapshot(row) : null;
      }
      if (change.operation === "patch") return null;
      const parsed = contactInputSchema.safeParse(payload);
      if (!parsed.success) throw new Error("INVALID_CONTACT");
      const row = await circleService.createContact(
        workspaceId, parsed.data, change.entity_id, executor,
      );
      return contactSnapshot(row);
    }

    case "letter": {
      if (change.operation === "delete" || isSoftDeletePayload(change.payload)) {
        const row = await circleService.deleteLetter(
          workspaceId, change.entity_id, executor,
        );
        return row ? letterSnapshot(row) : null;
      }
      const existing = await circleService.getLetterById(
        workspaceId, change.entity_id, executor,
      );
      const payload = camelizePayload(change.payload, letterKeys);
      if (existing) {
        const parsed = letterInputSchema.partial().safeParse(payload);
        if (!parsed.success) throw new Error("INVALID_LETTER");
        const row = await circleService.updateLetter(
          workspaceId, change.entity_id, parsed.data, executor,
        );
        return row ? letterSnapshot(row) : null;
      }
      if (change.operation === "patch") return null;
      const parsed = letterInputSchema.safeParse(payload);
      if (!parsed.success) throw new Error("INVALID_LETTER");
      const row = await circleService.createLetter(
        workspaceId, parsed.data, change.entity_id, executor,
      );
      return letterSnapshot(row);
    }

    case "workspace_setting": {
      const patch = change.operation === "delete"
        ? {}
        : change.payload.settings;
      if (
        patch === null ||
        typeof patch !== "object" ||
        Array.isArray(patch)
      ) {
        throw new Error("INVALID_WORKSPACE_SETTINGS");
      }
      const settings = await circleService.updateSettings(
        workspaceId,
        patch as Record<string, unknown>,
        executor,
      );
      return { id: workspaceId, settings };
    }
  }
}

export async function pushSyncMutations(input: {
  workspaceId: string;
  deviceId: string;
  mutations: SyncMutation[];
}) {
  const acceptedMutationIds: string[] = [];

  for (const mutation of input.mutations) {
    await db.transaction(async (tx) => {
      const [receipt] = await tx
        .insert(mutationReceipts)
        .values({
          workspaceId: input.workspaceId,
          mutationId: mutation.id,
          deviceId: input.deviceId,
        })
        .onConflictDoNothing()
        .returning({ mutationId: mutationReceipts.mutationId });

      if (!receipt) {
        return;
      }

      for (const change of mutation.changes) {
        await applySyncChange(input.workspaceId, change, tx);
        await recordSyncEvent({
          workspaceId: input.workspaceId,
          mutationId: `${mutation.id}:${change.entity}:${change.entity_id}`,
          deviceId: input.deviceId,
          entity: change.entity,
          entityId: change.entity_id,
          operation: change.operation,
          payload: change.payload,
        }, tx);
      }

      await tx
        .update(mutationReceipts)
        .set({ result: { accepted: true } })
        .where(
          and(
            eq(mutationReceipts.workspaceId, input.workspaceId),
            eq(mutationReceipts.mutationId, mutation.id),
          ),
        );
      });
    acceptedMutationIds.push(mutation.id);
  }

  return {
    schema_version: SYNC_SCHEMA_VERSION,
    cursor: await maxCursor(input.workspaceId),
    accepted_mutation_ids: acceptedMutationIds,
  };
}

function mapPowerSyncTable(table: string): SyncEntity | null {
  switch (table) {
    case "projects":
      return "project";
    case "tasks":
      return "task";
    case "documents":
      return "document";
    case "organizations":
      return "organization";
    case "contacts":
      return "contact";
    case "letters":
      return "letter";
    case "workspace_settings":
      return "workspace_setting";
    default:
      return null;
  }
}

function mapPowerSyncOp(op: PowerSyncOp): SyncOperation {
  if (op === "DELETE") return "delete";
  if (op === "PUT") return "upsert";
  return "patch";
}

export async function applyPowerSyncBatch(input: {
  workspaceId: string;
  deviceId: string;
  mutationId: string;
  batch: Array<{
    table: string;
    op: PowerSyncOp;
    id: string;
    data?: Record<string, unknown>;
  }>;
}) {
  let duplicate = false;
  await db.transaction(async (tx) => {
    const [receipt] = await tx
      .insert(mutationReceipts)
      .values({
        workspaceId: input.workspaceId,
        mutationId: input.mutationId,
        deviceId: input.deviceId,
      })
      .onConflictDoNothing()
      .returning({ mutationId: mutationReceipts.mutationId });
    if (!receipt) {
      duplicate = true;
      return;
    }

    for (const [index, entry] of input.batch.entries()) {
      const entity = mapPowerSyncTable(entry.table);
      if (!entity) continue;
      const operation = mapPowerSyncOp(entry.op);
      const payload = entry.data ?? {};
      const change: SyncChange = {
        entity,
        entity_id: entry.id,
        operation,
        payload: operation === "delete" ? payload : { ...payload, id: entry.id },
        updated_at: Date.now(),
      };
      try {
        await applySyncChange(input.workspaceId, change, tx);
      } catch (error) {
        // PowerSync retries 4xx/5xx forever — skip permanent validation failures.
        if (
          error instanceof Error &&
          POWERSYNC_SKIPPABLE_ERRORS.has(error.message)
        ) {
          console.warn(
            `[powersync] skipping ${entry.op} ${entry.table}/${entry.id}: ${error.message}`,
          );
          continue;
        }
        throw error;
      }
      await recordSyncEvent({
        workspaceId: input.workspaceId,
        mutationId: `${input.mutationId}:${index}`,
        deviceId: input.deviceId,
        entity,
        entityId: entry.id,
        operation: operation === "patch" ? "upsert" : operation,
        payload: change.payload,
      }, tx);
    }
    await tx
      .update(mutationReceipts)
      .set({ result: { accepted: true } })
      .where(and(
        eq(mutationReceipts.workspaceId, input.workspaceId),
        eq(mutationReceipts.mutationId, input.mutationId),
      ));
  });

  return { ok: true as const, duplicate };
}
