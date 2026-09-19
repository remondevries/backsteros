import type {
  ProjectUpdate,
  ProjectUpdateKind,
  ProjectUpdateSeverity,
  ProjectUpdateStatus,
  CreateProjectUpdateInput,
  UpdateProjectUpdateInput,
} from "@backsteros/contracts";
import {
  PROJECT_UPDATE_DEFAULT_SEVERITY,
  PROJECT_UPDATE_DEFAULT_STATUS,
  PROJECT_UPDATE_SEVERITIES,
  PROJECT_UPDATE_STATUSES,
  coerceProjectUpdateStatusForKind,
} from "@backsteros/contracts";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { projectUpdates, projects, tasks } from "../db/schema.js";
import { newId } from "../lib/crypto.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

function toIso(value: Date): string {
  return value.toISOString();
}

function isUpdateStatus(value: string): value is ProjectUpdateStatus {
  return (PROJECT_UPDATE_STATUSES as readonly string[]).includes(value);
}

function isUpdateSeverity(value: string): value is ProjectUpdateSeverity {
  return (PROJECT_UPDATE_SEVERITIES as readonly string[]).includes(value);
}

function resolveSeverity(
  kind: ProjectUpdateKind,
  severity: string | null | undefined,
): ProjectUpdateSeverity | null {
  if (kind !== "incident") return null;
  if (severity != null && isUpdateSeverity(severity)) return severity;
  return PROJECT_UPDATE_DEFAULT_SEVERITY;
}

function resolveStatus(
  kind: ProjectUpdateKind,
  status: string | null | undefined,
): ProjectUpdateStatus {
  return coerceProjectUpdateStatusForKind(kind, status);
}

function normalizeRelatedTaskIds(
  value: readonly string[] | null | undefined,
): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function mapRow(row: typeof projectUpdates.$inferSelect): ProjectUpdate {
  const kind = (row.kind as ProjectUpdateKind) || "update";
  const rawStatus = isUpdateStatus(row.status)
    ? row.status
    : PROJECT_UPDATE_DEFAULT_STATUS;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    title: row.title,
    body: row.body,
    kind,
    status: resolveStatus(kind, rawStatus),
    severity: resolveSeverity(kind, row.severity),
    relatedTaskIds: normalizeRelatedTaskIds(row.relatedTaskIds),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    deletedAt: row.deletedAt ? toIso(row.deletedAt) : null,
  };
}

async function assertProjectInWorkspace(
  workspaceId: string,
  projectId: string,
  executor: DbExecutor = db,
): Promise<boolean> {
  const [row] = await executor
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.id, projectId),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function assertRelatedTaskIds(
  workspaceId: string,
  projectId: string,
  ids: readonly string[],
  executor: DbExecutor = db,
): Promise<boolean> {
  if (ids.length === 0) return true;
  const rows = await executor
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.projectId, projectId),
        inArray(tasks.id, [...ids]),
        isNull(tasks.deletedAt),
      ),
    );
  return rows.length === ids.length;
}

export async function listProjectUpdates(
  workspaceId: string,
  projectId: string,
  executor: DbExecutor = db,
): Promise<ProjectUpdate[]> {
  const rows = await executor
    .select()
    .from(projectUpdates)
    .where(
      and(
        eq(projectUpdates.workspaceId, workspaceId),
        eq(projectUpdates.projectId, projectId),
        isNull(projectUpdates.deletedAt),
      ),
    )
    .orderBy(desc(projectUpdates.createdAt));
  return rows.map(mapRow);
}

/** Updates that list this task in `relatedTaskIds` (reverse link for task properties). */
export async function listProjectUpdatesForRelatedTask(
  workspaceId: string,
  taskId: string,
  executor: DbExecutor = db,
): Promise<ProjectUpdate[]> {
  const id = taskId.trim();
  if (!id) return [];
  const rows = await executor
    .select()
    .from(projectUpdates)
    .where(
      and(
        eq(projectUpdates.workspaceId, workspaceId),
        isNull(projectUpdates.deletedAt),
        sql`${projectUpdates.relatedTaskIds} @> ${JSON.stringify([id])}::jsonb`,
      ),
    )
    .orderBy(desc(projectUpdates.createdAt));
  return rows.map(mapRow);
}

export async function getProjectUpdateById(
  workspaceId: string,
  updateId: string,
  executor: DbExecutor = db,
): Promise<ProjectUpdate | null> {
  const [row] = await executor
    .select()
    .from(projectUpdates)
    .where(
      and(
        eq(projectUpdates.workspaceId, workspaceId),
        eq(projectUpdates.id, updateId),
        isNull(projectUpdates.deletedAt),
      ),
    )
    .limit(1);
  return row ? mapRow(row) : null;
}

export async function createProjectUpdate(
  workspaceId: string,
  projectId: string,
  input: CreateProjectUpdateInput,
  executor: DbExecutor = db,
): Promise<ProjectUpdate | null> {
  if (!(await assertProjectInWorkspace(workspaceId, projectId, executor))) {
    return null;
  }

  const relatedTaskIds = normalizeRelatedTaskIds(input.relatedTaskIds);
  if (
    !(await assertRelatedTaskIds(
      workspaceId,
      projectId,
      relatedTaskIds,
      executor,
    ))
  ) {
    throw new Error("RELATED_TASK_NOT_FOUND");
  }

  const status = resolveStatus(input.kind, input.status);
  const severity = resolveSeverity(input.kind, input.severity);

  const [row] = await executor
    .insert(projectUpdates)
    .values({
      id: newId(),
      workspaceId,
      projectId,
      title: input.title.trim(),
      body: input.body.trim(),
      kind: input.kind,
      status,
      severity,
      relatedTaskIds,
    })
    .returning();

  return mapRow(row);
}

export async function updateProjectUpdate(
  workspaceId: string,
  updateId: string,
  input: UpdateProjectUpdateInput,
  executor: DbExecutor = db,
): Promise<ProjectUpdate | null> {
  const existing = await getProjectUpdateById(workspaceId, updateId, executor);
  if (!existing) return null;

  const nextKind = input.kind ?? existing.kind;
  const nextSeverity =
    input.severity !== undefined
      ? resolveSeverity(nextKind, input.severity)
      : resolveSeverity(nextKind, existing.severity);
  const nextStatus = resolveStatus(
    nextKind,
    input.status !== undefined ? input.status : existing.status,
  );

  const nextRelatedTaskIds =
    input.relatedTaskIds !== undefined
      ? normalizeRelatedTaskIds(input.relatedTaskIds)
      : existing.relatedTaskIds;

  if (input.relatedTaskIds !== undefined) {
    if (
      !(await assertRelatedTaskIds(
        workspaceId,
        existing.projectId,
        nextRelatedTaskIds,
        executor,
      ))
    ) {
      throw new Error("RELATED_TASK_NOT_FOUND");
    }
  }

  const [row] = await executor
    .update(projectUpdates)
    .set({
      title: input.title?.trim() ?? existing.title,
      body: input.body?.trim() ?? existing.body,
      kind: nextKind,
      status: nextStatus,
      severity: nextSeverity,
      relatedTaskIds: nextRelatedTaskIds,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projectUpdates.workspaceId, workspaceId),
        eq(projectUpdates.id, updateId),
        isNull(projectUpdates.deletedAt),
      ),
    )
    .returning();

  return row ? mapRow(row) : null;
}

export async function softDeleteProjectUpdate(
  workspaceId: string,
  updateId: string,
  executor: DbExecutor = db,
): Promise<boolean> {
  const [row] = await executor
    .update(projectUpdates)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(projectUpdates.workspaceId, workspaceId),
        eq(projectUpdates.id, updateId),
        isNull(projectUpdates.deletedAt),
      ),
    )
    .returning({ id: projectUpdates.id });
  return Boolean(row);
}
