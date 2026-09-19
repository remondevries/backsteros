import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { taskLabels, tasks } from "../db/schema.js";
import { newId } from "../lib/crypto.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

export type TaskLabelRecord = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  isGroup: boolean;
  parentId: string | null;
  lastUsedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function mapTaskLabel(
  row: typeof taskLabels.$inferSelect,
): TaskLabelRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    color: row.color ?? null,
    isGroup: row.isGroup,
    parentId: row.parentId ?? null,
    lastUsedAt: toIso(row.lastUsedAt),
    sortOrder: row.sortOrder,
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updatedAt) ?? new Date(0).toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

export function taskLabelSyncSnapshot(row: typeof taskLabels.$inferSelect) {
  const mapped = mapTaskLabel(row);
  return {
    id: mapped.id,
    name: mapped.name,
    description: mapped.description,
    color: mapped.color,
    is_group: mapped.isGroup,
    parent_id: mapped.parentId,
    last_used_at: mapped.lastUsedAt,
    sort_order: mapped.sortOrder,
    created_at: mapped.createdAt,
    updated_at: mapped.updatedAt,
    deleted_at: mapped.deletedAt,
  };
}

export function normalizeTaskLabelIds(
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

export function normalizeTaskLabelName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

const TASK_LABEL_COLOR_PRESETS = [
  "#9CA3AF",
  "#64748B",
  "#38BDF8",
  "#4ADE80",
  "#FACC15",
  "#FB923C",
  "#FDBA74",
  "#F87171",
] as const;

export function normalizeTaskLabelColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const color = value.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) return null;
  return color.toUpperCase();
}

function nextTaskLabelColor(existingCount: number): string {
  return (
    TASK_LABEL_COLOR_PRESETS[existingCount % TASK_LABEL_COLOR_PRESETS.length] ??
    "#4ADE80"
  );
}

async function assertUniqueName(
  workspaceId: string,
  name: string,
  excludeId: string | null,
  executor: DbExecutor,
) {
  const filters = [
    eq(taskLabels.workspaceId, workspaceId),
    isNull(taskLabels.deletedAt),
    sql`lower(${taskLabels.name}) = ${name.toLowerCase()}`,
  ];
  if (excludeId) filters.push(ne(taskLabels.id, excludeId));
  const [row] = await executor
    .select({ id: taskLabels.id })
    .from(taskLabels)
    .where(and(...filters))
    .limit(1);
  if (row) throw new Error("TASK_LABEL_NAME_TAKEN");
}

function normalizeTaskLabelDescription(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error("INVALID_TASK_LABEL");
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return null;
  if (text.length > 500) throw new Error("INVALID_TASK_LABEL");
  return text;
}

/** Parent must be a live top-level group, never the row itself. */
async function assertLabelParent(
  workspaceId: string,
  parentId: string,
  selfId: string | null,
  executor: DbExecutor,
) {
  if (selfId && parentId === selfId) throw new Error("INVALID_TASK_LABEL");
  const parent = await getTaskLabelById(workspaceId, parentId, executor);
  if (!parent || parent.deletedAt || !parent.isGroup || parent.parentId) {
    throw new Error("INVALID_TASK_LABEL");
  }
}

export async function assertTaskLabelIds(
  workspaceId: string,
  ids: readonly string[],
  executor: DbExecutor = db,
) {
  if (ids.length === 0) return;
  const rows = await executor
    .select({ id: taskLabels.id, isGroup: taskLabels.isGroup })
    .from(taskLabels)
    .where(
      and(
        eq(taskLabels.workspaceId, workspaceId),
        isNull(taskLabels.deletedAt),
        inArray(taskLabels.id, [...ids]),
      ),
    );
  if (rows.length !== ids.length || rows.some((row) => row.isGroup)) {
    throw new Error("TASK_LABEL_NOT_FOUND");
  }
}

export async function listTaskLabels(workspaceId: string) {
  const rows = await db
    .select()
    .from(taskLabels)
    .where(
      and(eq(taskLabels.workspaceId, workspaceId), isNull(taskLabels.deletedAt)),
    )
    .orderBy(asc(taskLabels.sortOrder), asc(taskLabels.name));
  return rows.map(mapTaskLabel);
}

export async function getTaskLabelById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(taskLabels)
    .where(and(eq(taskLabels.id, id), eq(taskLabels.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

export async function createTaskLabel(
  workspaceId: string,
  input: {
    id?: string;
    name: string;
    color?: string | null;
    description?: string | null;
    parentId?: string | null;
    isGroup?: boolean;
  },
  executor: DbExecutor = db,
) {
  const name = normalizeTaskLabelName(input.name);
  if (!name || name.length > 80) throw new Error("INVALID_TASK_LABEL");
  const id = input.id?.trim() || newId();
  const isGroup = input.isGroup === true;
  const description =
    input.description === undefined
      ? null
      : normalizeTaskLabelDescription(input.description);
  const parentId = input.parentId?.trim() || null;
  if (isGroup && parentId) throw new Error("INVALID_TASK_LABEL");
  if (parentId) await assertLabelParent(workspaceId, parentId, id, executor);
  const color = isGroup
    ? null
    : input.color === undefined
      ? undefined
      : normalizeTaskLabelColor(input.color);
  if (!isGroup && input.color != null && input.color !== "" && !color) {
    throw new Error("INVALID_TASK_LABEL");
  }
  const existing = await getTaskLabelById(workspaceId, id, executor);
  if (existing && !existing.deletedAt) {
    return updateTaskLabel(
      workspaceId,
      id,
      {
        name,
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      },
      executor,
    );
  }
  await assertUniqueName(workspaceId, name, null, executor);
  const existingRows = await executor
    .select({ id: taskLabels.id })
    .from(taskLabels)
    .where(
      and(eq(taskLabels.workspaceId, workspaceId), isNull(taskLabels.deletedAt)),
    );
  const [maxRow] = await executor
    .select({ sortOrder: taskLabels.sortOrder })
    .from(taskLabels)
    .where(eq(taskLabels.workspaceId, workspaceId))
    .orderBy(sql`${taskLabels.sortOrder} DESC`)
    .limit(1);
  const now = new Date();
  const [row] = await executor
    .insert(taskLabels)
    .values({
      id,
      workspaceId,
      name,
      description,
      color: isGroup ? null : (color ?? nextTaskLabelColor(existingRows.length)),
      isGroup,
      parentId,
      sortOrder: (maxRow?.sortOrder ?? 0) + 1,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) {
    const raced = await getTaskLabelById(workspaceId, id, executor);
    if (!raced) throw new Error("INVALID_TASK_LABEL");
    return mapTaskLabel(raced);
  }
  return mapTaskLabel(row);
}

export async function updateTaskLabel(
  workspaceId: string,
  id: string,
  input: {
    name?: string;
    color?: string | null;
    description?: string | null;
    parentId?: string | null;
  },
  executor: DbExecutor = db,
) {
  const existing = await getTaskLabelById(workspaceId, id, executor);
  if (!existing || existing.deletedAt) return null;
  const patch: {
    name?: string;
    color?: string | null;
    description?: string | null;
    parentId?: string | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (input.name !== undefined) {
    const name = normalizeTaskLabelName(input.name);
    if (!name || name.length > 80) throw new Error("INVALID_TASK_LABEL");
    if (name.toLowerCase() !== existing.name.toLowerCase()) {
      await assertUniqueName(workspaceId, name, id, executor);
    }
    patch.name = name;
  }
  if (input.color !== undefined) {
    const color = normalizeTaskLabelColor(input.color);
    if (input.color != null && input.color !== "" && !color) {
      throw new Error("INVALID_TASK_LABEL");
    }
    patch.color = color;
  }
  if (input.description !== undefined) {
    patch.description = normalizeTaskLabelDescription(input.description);
  }
  if (input.parentId !== undefined) {
    const parentId = input.parentId?.trim() || null;
    if (existing.isGroup && parentId) throw new Error("INVALID_TASK_LABEL");
    if (parentId) await assertLabelParent(workspaceId, parentId, id, executor);
    patch.parentId = parentId;
  }
  if (
    patch.name === undefined &&
    input.color === undefined &&
    input.description === undefined &&
    input.parentId === undefined
  ) {
    throw new Error("INVALID_TASK_LABEL");
  }
  const [row] = await executor
    .update(taskLabels)
    .set(patch)
    .where(and(eq(taskLabels.id, id), eq(taskLabels.workspaceId, workspaceId)))
    .returning();
  return row ? mapTaskLabel(row) : null;
}

async function stripLabelFromTasks(
  workspaceId: string,
  labelId: string,
  executor: DbExecutor,
) {
  const rows = await executor
    .select({ id: tasks.id, labelIds: tasks.labelIds })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        sql`jsonb_exists(${tasks.labelIds}, ${labelId})`,
      ),
    );
  const now = new Date();
  for (const row of rows) {
    const next = normalizeTaskLabelIds(row.labelIds).filter((id) => id !== labelId);
    await executor
      .update(tasks)
      .set({ labelIds: next, updatedAt: now })
      .where(eq(tasks.id, row.id));
  }
}

export async function deleteTaskLabel(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const existing = await getTaskLabelById(workspaceId, id, executor);
  if (!existing || existing.deletedAt) return null;
  const now = new Date();
  if (existing.isGroup) {
    await executor
      .update(taskLabels)
      .set({ parentId: null, updatedAt: now })
      .where(
        and(
          eq(taskLabels.workspaceId, workspaceId),
          eq(taskLabels.parentId, id),
          isNull(taskLabels.deletedAt),
        ),
      );
  }
  await stripLabelFromTasks(workspaceId, id, executor);
  const [row] = await executor
    .update(taskLabels)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(taskLabels.id, id), eq(taskLabels.workspaceId, workspaceId)))
    .returning();
  return row ? mapTaskLabel(row) : null;
}

/** Stamp labels that were just attached to a task. Removals do not clear this. */
export async function touchTaskLabelsUsed(
  workspaceId: string,
  ids: readonly string[],
  executor: DbExecutor = db,
) {
  if (ids.length === 0) return;
  const now = new Date();
  await executor
    .update(taskLabels)
    .set({ lastUsedAt: now, updatedAt: now })
    .where(
      and(
        eq(taskLabels.workspaceId, workspaceId),
        isNull(taskLabels.deletedAt),
        inArray(taskLabels.id, [...ids]),
      ),
    );
}
