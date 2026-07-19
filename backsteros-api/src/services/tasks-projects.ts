import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";

import type {
  CreateApiKeyInput,
  CreateProjectInput,
  CreateTaskInput,
  UpdateProjectInput,
  UpdateTaskInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  areas,
  contacts,
  entityCounters,
  organizations,
  projects,
  tasks,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

async function assertWorkspaceReference(
  workspaceId: string,
  id: string | null | undefined,
  table: typeof organizations | typeof areas | typeof contacts,
  code: string,
  executor: DbExecutor,
) {
  if (!id) return;
  const [row] = await executor
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.workspaceId, workspaceId), eq(table.id, id), isNull(table.deletedAt)))
    .limit(1);
  if (!row) throw new Error(code);
}

export async function listProjects(
  workspaceId: string,
  filters: { organizationId?: string; area?: string; status?: string } = {},
  executor: DbExecutor = db,
) {
  const conditions = [eq(projects.workspaceId, workspaceId), isNull(projects.deletedAt)];
  if (filters.organizationId) conditions.push(eq(projects.organizationId, filters.organizationId));
  if (filters.area) conditions.push(eq(projects.area, filters.area));
  if (filters.status) conditions.push(eq(projects.status, filters.status));
  return executor
    .select()
    .from(projects)
    .where(and(...conditions))
    .orderBy(projects.sortOrder, desc(projects.updatedAt));
}

export async function getProjectById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.id, id),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getProjectByKey(
  workspaceId: string,
  key: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.key, key),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createProject(
  workspaceId: string,
  input: CreateProjectInput,
  id = newId(),
  executor: DbExecutor = db,
) {
  const existing = await getProjectByKey(workspaceId, input.key, executor);
  if (existing) {
    throw new Error("PROJECT_KEY_EXISTS");
  }
  await assertWorkspaceReference(
    workspaceId,
    input.organizationId,
    organizations,
    "ORGANIZATION_NOT_FOUND",
    executor,
  );
  await assertWorkspaceReference(workspaceId, input.areaId, areas, "AREA_NOT_FOUND", executor);

  const [row] = await executor
    .insert(projects)
    .values({
      id,
      workspaceId,
      key: input.key,
      name: input.name,
      summary: input.summary ?? null,
      description: input.description ?? null,
      organizationId: input.organizationId ?? null,
      areaId: input.areaId ?? null,
      area: input.area ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      status: input.status ?? "backlog",
      priority: input.priority ?? 0,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();

  return row;
}

export async function updateProject(
  workspaceId: string,
  id: string,
  input: UpdateProjectInput,
  executor: DbExecutor = db,
) {
  const existing = await getProjectById(workspaceId, id, executor);
  if (!existing) {
    return null;
  }

  if (input.key && input.key !== existing.key) {
    const conflict = await getProjectByKey(workspaceId, input.key, executor);
    if (conflict) {
      throw new Error("PROJECT_KEY_EXISTS");
    }
  }
  await assertWorkspaceReference(
    workspaceId,
    input.organizationId,
    organizations,
    "ORGANIZATION_NOT_FOUND",
    executor,
  );
  await assertWorkspaceReference(workspaceId, input.areaId, areas, "AREA_NOT_FOUND", executor);

  const [row] = await executor
    .update(projects)
    .set({
      key: input.key,
      name: input.name,
      summary: input.summary,
      description: input.description,
      organizationId: input.organizationId,
      areaId: input.areaId,
      area: input.area,
      startDate:
        input.startDate === undefined
          ? undefined
          : input.startDate
            ? new Date(input.startDate)
            : null,
      dueDate:
        input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
      icon: input.icon,
      color: input.color,
      status: input.status,
      priority: input.priority,
      sortOrder: input.sortOrder,
      updatedAt: new Date(),
    })
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)))
    .returning();

  return row ?? null;
}

export async function deleteProject(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .update(projects)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.id, id),
        isNull(projects.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function listTasks(
  workspaceId: string,
  filters: {
    projectId?: string;
    contactId?: string;
    assigneeId?: string;
    status?: string;
    inbox?: boolean;
  } = {},
  executor: DbExecutor = db,
) {
  const conditions = [
    eq(tasks.workspaceId, workspaceId),
    isNull(tasks.deletedAt),
  ];

  if (filters.projectId) conditions.push(eq(tasks.projectId, filters.projectId));
  if (filters.contactId) conditions.push(eq(tasks.contactId, filters.contactId));
  if (filters.assigneeId) conditions.push(eq(tasks.assigneeId, filters.assigneeId));
  if (filters.status) conditions.push(eq(tasks.status, filters.status));
  if (filters.inbox !== undefined) conditions.push(eq(tasks.inbox, filters.inbox));

  return executor
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(tasks.sortOrder, desc(tasks.updatedAt));
}

export async function getTaskById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.id, id),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

function taskScope(projectId?: string | null, contactId?: string | null) {
  return projectId
    ? `project:${projectId}`
    : contactId
      ? `contact:${contactId}`
      : "__inbox__";
}

/**
 * Allocate the next task number for a scope.
 *
 * Counters can lag behind imported/legacy rows (Circle migration never seeded
 * them). Always floor allocation at max(existing number)+1 so display IDs like
 * CI-2 are never reused — including soft-deleted and legacy rows.
 */
async function nextTaskNumber(
  workspaceId: string,
  projectId: string | null | undefined,
  contactId: string | null | undefined,
  executor: DbExecutor,
) {
  const scopeId = taskScope(projectId, contactId);
  const scopeFilter = projectId
    ? eq(tasks.projectId, projectId)
    : contactId
      ? and(isNull(tasks.projectId), eq(tasks.contactId, contactId))
      : and(isNull(tasks.projectId), isNull(tasks.contactId));

  const [maxRow] = await executor
    .select({
      maxNumber: sql<number>`coalesce(max(${tasks.number}), 0)`,
    })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), scopeFilter));

  const minNext = Number(maxRow?.maxNumber ?? 0) + 1;

  const [counter] = await executor
    .insert(entityCounters)
    .values({
      workspaceId,
      entity: "task",
      scopeId,
      nextValue: minNext + 1,
    })
    .onConflictDoUpdate({
      target: [
        entityCounters.workspaceId,
        entityCounters.entity,
        entityCounters.scopeId,
      ],
      set: {
        nextValue: sql`greatest(${entityCounters.nextValue}, ${minNext}) + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ nextValue: entityCounters.nextValue });

  return counter!.nextValue - 1;
}

async function createTaskWithExecutor(
  workspaceId: string,
  input: CreateTaskInput,
  id: string,
  executor: DbExecutor,
) {
  if (input.projectId) {
    const project = await getProjectById(workspaceId, input.projectId, executor);
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }
  }
  await assertWorkspaceReference(
    workspaceId,
    input.contactId,
    contacts,
    "CONTACT_NOT_FOUND",
    executor,
  );
  await assertWorkspaceReference(
    workspaceId,
    input.assigneeId,
    contacts,
    "ASSIGNEE_NOT_FOUND",
    executor,
  );

  const number = await nextTaskNumber(
    workspaceId,
    input.projectId ?? null,
    input.contactId ?? null,
    executor,
  );
  const status = input.status ?? "ready_to_start";

  const [row] = await executor
    .insert(tasks)
    .values({
      id,
      workspaceId,
      projectId: input.projectId ?? null,
      contactId: input.contactId ?? null,
      assigneeId: input.assigneeId ?? null,
      number,
      title: input.title,
      description: input.description ?? null,
      status,
      priority: input.priority ?? 0,
      sortOrder: input.sortOrder ?? 0,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      triagedAt: input.triagedAt ? new Date(input.triagedAt) : null,
      inbox: input.inbox ?? (!input.projectId && !input.contactId),
      completedAt: status === "completed" ? new Date() : null,
    })
    .returning();

  return row;
}

export async function createTask(
  workspaceId: string,
  input: CreateTaskInput,
  id = newId(),
  executor?: DbExecutor,
) {
  if (executor) {
    return createTaskWithExecutor(workspaceId, input, id, executor);
  }
  return db.transaction((tx) =>
    createTaskWithExecutor(workspaceId, input, id, tx),
  );
}

export async function updateTask(
  workspaceId: string,
  id: string,
  input: UpdateTaskInput,
  executor: DbExecutor = db,
) {
  const existing = await getTaskById(workspaceId, id, executor);
  if (!existing) {
    return null;
  }

  if (input.projectId) {
    const project = await getProjectById(workspaceId, input.projectId, executor);
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }
  }
  await assertWorkspaceReference(
    workspaceId,
    input.contactId,
    contacts,
    "CONTACT_NOT_FOUND",
    executor,
  );
  await assertWorkspaceReference(
    workspaceId,
    input.assigneeId,
    contacts,
    "ASSIGNEE_NOT_FOUND",
    executor,
  );

  const nextStatus = input.status ?? existing.status;
  const nextProjectId =
    input.projectId === undefined ? existing.projectId : input.projectId;
  const nextContactId =
    input.contactId === undefined ? existing.contactId : input.contactId;
  const number =
    taskScope(nextProjectId, nextContactId) ===
    taskScope(existing.projectId, existing.contactId)
      ? existing.number
      : await nextTaskNumber(workspaceId, nextProjectId, nextContactId, executor);
  const completedAt =
    nextStatus === "completed"
      ? existing.completedAt ?? new Date()
      : input.status && input.status !== "completed"
        ? null
        : existing.completedAt;

  const [row] = await executor
    .update(tasks)
    .set({
      projectId: input.projectId,
      contactId: input.contactId,
      assigneeId: input.assigneeId,
      number,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      sortOrder: input.sortOrder,
      dueDate:
        input.dueDate === undefined
          ? undefined
          : input.dueDate
            ? new Date(input.dueDate)
            : null,
      triagedAt:
        input.triagedAt === undefined
          ? undefined
          : input.triagedAt
            ? new Date(input.triagedAt)
            : null,
      inbox:
        input.inbox ??
        (input.projectId !== undefined || input.contactId !== undefined
          ? !nextProjectId && !nextContactId
          : undefined),
      completedAt,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, id)))
    .returning();

  return row ?? null;
}

export async function deleteTask(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .update(tasks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.id, id),
        isNull(tasks.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function listDueTasks(
  workspaceId: string,
  before = new Date(),
  executor: DbExecutor = db,
) {
  return executor
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.deletedAt),
        isNull(tasks.completedAt),
        isNotNull(tasks.dueDate),
        lte(tasks.dueDate, before),
      ),
    )
    .orderBy(asc(tasks.dueDate), asc(tasks.sortOrder));
}

export async function listInboxTasks(workspaceId: string, executor: DbExecutor = db) {
  return executor
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.deletedAt),
        eq(tasks.inbox, true),
      ),
    )
    .orderBy(asc(tasks.sortOrder), desc(tasks.updatedAt));
}

export async function batchUpdateTasks(
  workspaceId: string,
  ids: string[],
  input: UpdateTaskInput,
) {
  if (ids.length === 0) return [];
  return db.transaction(async (tx) => {
    const rows = [];
    for (const id of ids) {
      const row = await updateTask(workspaceId, id, input, tx);
      if (row) rows.push(row);
    }
    return rows;
  });
}

export async function reorderTasks(
  workspaceId: string,
  orderedIds: string[],
) {
  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          inArray(tasks.id, orderedIds),
          isNull(tasks.deletedAt),
        ),
      );
    if (owned.length !== new Set(orderedIds).size) throw new Error("TASK_NOT_FOUND");
    const rows = [];
    for (const [sortOrder, id] of orderedIds.entries()) {
      const [row] = await tx
        .update(tasks)
        .set({ sortOrder, updatedAt: new Date() })
        .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, id)))
        .returning();
      if (row) rows.push(row);
    }
    return rows;
  });
}
