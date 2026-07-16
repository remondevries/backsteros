import { asc, gt } from "drizzle-orm";

import type {
  CreateProjectInput,
  CreateTaskInput,
  DocumentType,
  Project,
  Task,
  UpdateProjectInput,
  UpdateTaskInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { documents, projects, syncEvents, tasks } from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import type { PowerSyncOp, SyncEntity, SyncOperation } from "../lib/sync-constants.js";
import { SYNC_SCHEMA_VERSION } from "../lib/sync-constants.js";
import * as documentService from "./documents.js";
import * as taskProjectService from "./tasks-projects.js";

const PULL_PAGE_SIZE = 100;

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
    number: row.number,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    sort_order: row.sortOrder,
    due_date: row.dueDate?.toISOString() ?? null,
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

async function maxCursor(): Promise<number> {
  const rows = await db
    .select({ cursor: syncEvents.cursor })
    .from(syncEvents)
    .orderBy(asc(syncEvents.cursor));

  if (rows.length === 0) {
    return 0;
  }

  return rows[rows.length - 1]!.cursor;
}

export async function bootstrapSync() {
  const [projectRows, taskRows, documentRows] = await Promise.all([
    taskProjectService.listProjects(),
    taskProjectService.listTasks(),
    documentService.listDocuments(),
  ]);

  return {
    schema_version: SYNC_SCHEMA_VERSION,
    cursor: await maxCursor(),
    spaces_configured: Boolean(process.env.SPACES_BUCKET),
    snapshot: {
      projects: projectRows.map(projectSnapshot),
      tasks: taskRows.map(taskSnapshot),
      documents: documentRows.map(documentSnapshot),
    },
  };
}

export async function pullSync(cursor: number) {
  const events = await db
    .select()
    .from(syncEvents)
    .where(gt(syncEvents.cursor, cursor))
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
  mutationId: string;
  deviceId?: string;
  entity: SyncEntity;
  entityId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
}) {
  await db.insert(syncEvents).values({
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

function mapProjectUpsert(
  payload: Record<string, unknown>,
): CreateProjectInput | UpdateProjectInput {
  return {
    key: asString(payload.key),
    name: asString(payload.name),
    summary: asString(payload.summary),
    description: asString(payload.description),
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
    title: asString(payload.title),
    description: asString(payload.description),
    status: asString(payload.status) as Task["status"] | undefined,
    priority: asNumber(payload.priority),
    sortOrder: asNumber(payload.sort_order ?? payload.sortOrder),
    dueDate: asString(payload.due_date ?? payload.dueDate),
  };
}

export async function applySyncChange(change: SyncChange) {
  switch (change.entity) {
    case "project": {
      if (change.operation === "delete") {
        const row = await taskProjectService.deleteProject(change.entity_id);
        return row ? projectSnapshot(row) : null;
      }

      const existing = await taskProjectService.getProjectById(change.entity_id);
      const input = mapProjectUpsert(change.payload);

      if (existing) {
        const row = await taskProjectService.updateProject(change.entity_id, input);
        return row ? projectSnapshot(row) : null;
      }

      if (!input.key || !input.name) {
        throw new Error("PROJECT_FIELDS_REQUIRED");
      }

      const row = await taskProjectService.createProject(
        {
          key: input.key,
          name: input.name,
          summary: input.summary,
          description: input.description,
          status: input.status,
          priority: input.priority,
          sortOrder: input.sortOrder,
        },
        change.entity_id,
      );
      return projectSnapshot(row);
    }

    case "task": {
      if (change.operation === "delete") {
        const row = await taskProjectService.deleteTask(change.entity_id);
        return row ? taskSnapshot(row) : null;
      }

      const existing = await taskProjectService.getTaskById(change.entity_id);
      const input = mapTaskUpsert(change.payload);

      if (existing) {
        const row = await taskProjectService.updateTask(change.entity_id, input);
        return row ? taskSnapshot(row) : null;
      }

      if (!input.title) {
        throw new Error("TASK_TITLE_REQUIRED");
      }

      const row = await taskProjectService.createTask(
        {
          projectId: input.projectId,
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          sortOrder: input.sortOrder,
          dueDate: input.dueDate,
        },
        change.entity_id,
      );
      return taskSnapshot(row);
    }

    case "document": {
      if (change.operation === "delete") {
        const row = await documentService.deleteDocument(change.entity_id);
        return row ? documentSnapshot(row) : null;
      }

      const type = asString(change.payload.type) as DocumentType | undefined;
      const path = asString(change.payload.path);
      const title = asString(change.payload.title);
      const projectId = asString(change.payload.project_id ?? change.payload.projectId);

      if (!type || !path || !title) {
        throw new Error("DOCUMENT_FIELDS_REQUIRED");
      }

      const existing = await documentService.getDocumentById(change.entity_id);
      if (existing) {
        const row = await documentService.updateDocument(change.entity_id, {
          title,
          path,
        });
        return row ? documentSnapshot(row) : null;
      }

      const row = await documentService.createDocument(
        {
          type,
          path,
          title,
          projectId,
        },
        change.entity_id,
      );
      return documentSnapshot(row);
    }
  }
}

export async function pushSyncMutations(input: {
  deviceId: string;
  mutations: SyncMutation[];
}) {
  const acceptedMutationIds: string[] = [];

  for (const mutation of input.mutations) {
    for (const change of mutation.changes) {
      await applySyncChange(change);
      await recordSyncEvent({
        mutationId: `${mutation.id}:${change.entity}:${change.entity_id}`,
        deviceId: input.deviceId,
        entity: change.entity,
        entityId: change.entity_id,
        operation: change.operation,
        payload: change.payload,
      });
    }
    acceptedMutationIds.push(mutation.id);
  }

  return {
    schema_version: SYNC_SCHEMA_VERSION,
    cursor: await maxCursor(),
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
    default:
      return null;
  }
}

function mapPowerSyncOp(op: PowerSyncOp): SyncOperation | "patch" {
  if (op === "DELETE") {
    return "delete";
  }
  if (op === "PUT") {
    return "upsert";
  }
  return "patch";
}

export async function applyPowerSyncBatch(input: {
  deviceId?: string;
  batch: Array<{
    table: string;
    op: PowerSyncOp;
    id: string;
    data?: Record<string, unknown>;
  }>;
}) {
  const mutationId = newId();

  for (const entry of input.batch) {
    const entity = mapPowerSyncTable(entry.table);
    if (!entity) {
      continue;
    }

    const mappedOp = mapPowerSyncOp(entry.op);
    const payload = entry.data ?? {};
    const updatedAt = Date.now();

    if (mappedOp === "delete") {
      await applySyncChange({
        entity,
        entity_id: entry.id,
        operation: "delete",
        payload,
        updated_at: updatedAt,
      });
      await recordSyncEvent({
        mutationId: `${mutationId}:${entity}:${entry.id}`,
        deviceId: input.deviceId,
        entity,
        entityId: entry.id,
        operation: "delete",
        payload,
      });
      continue;
    }

    const change: SyncChange = {
      entity,
      entity_id: entry.id,
      operation: "upsert",
      payload: { ...payload, id: entry.id },
      updated_at: updatedAt,
    };

    await applySyncChange(change);
    await recordSyncEvent({
      mutationId: `${mutationId}:${entity}:${entry.id}`,
      deviceId: input.deviceId,
      entity,
      entityId: entry.id,
      operation: "upsert",
      payload: change.payload,
    });
  }

  return { ok: true as const };
}
