import { and, desc, eq, isNull, max, sql } from "drizzle-orm";

import type {
  CreateApiKeyInput,
  CreateProjectInput,
  CreateTaskInput,
  UpdateProjectInput,
  UpdateTaskInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { projects, tasks } from "../db/schema.js";
import { newId } from "../lib/crypto.js";

export async function listProjects() {
  return db
    .select()
    .from(projects)
    .where(isNull(projects.deletedAt))
    .orderBy(projects.sortOrder, desc(projects.updatedAt));
}

export async function getProjectById(id: string) {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function getProjectByKey(key: string) {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.key, key), isNull(projects.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function createProject(input: CreateProjectInput) {
  const existing = await getProjectByKey(input.key);
  if (existing) {
    throw new Error("PROJECT_KEY_EXISTS");
  }

  const id = newId();
  const [row] = await db
    .insert(projects)
    .values({
      id,
      key: input.key,
      name: input.name,
      summary: input.summary ?? null,
      description: input.description ?? null,
      status: input.status ?? "backlog",
      priority: input.priority ?? 0,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();

  return row;
}

export async function updateProject(id: string, input: UpdateProjectInput) {
  const existing = await getProjectById(id);
  if (!existing) {
    return null;
  }

  if (input.key && input.key !== existing.key) {
    const conflict = await getProjectByKey(input.key);
    if (conflict) {
      throw new Error("PROJECT_KEY_EXISTS");
    }
  }

  const [row] = await db
    .update(projects)
    .set({
      key: input.key,
      name: input.name,
      summary: input.summary,
      description: input.description,
      status: input.status,
      priority: input.priority,
      sortOrder: input.sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning();

  return row ?? null;
}

export async function deleteProject(id: string) {
  const [row] = await db
    .update(projects)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .returning();
  return row ?? null;
}

export async function listTasks(projectId?: string) {
  const conditions = [isNull(tasks.deletedAt)];

  if (projectId) {
    conditions.push(eq(tasks.projectId, projectId));
  }

  return db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(tasks.sortOrder, desc(tasks.updatedAt));
}

export async function getTaskById(id: string) {
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
    .limit(1);
  return row ?? null;
}

async function nextTaskNumber(projectId: string | null | undefined) {
  const [result] = await db
    .select({ value: max(tasks.number) })
    .from(tasks)
    .where(
      projectId
        ? eq(tasks.projectId, projectId)
        : sql`${tasks.projectId} IS NULL`,
    );

  return (result?.value ?? 0) + 1;
}

export async function createTask(input: CreateTaskInput) {
  if (input.projectId) {
    const project = await getProjectById(input.projectId);
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }
  }

  const id = newId();
  const number = await nextTaskNumber(input.projectId ?? null);
  const status = input.status ?? "ready_to_start";

  const [row] = await db
    .insert(tasks)
    .values({
      id,
      projectId: input.projectId ?? null,
      number,
      title: input.title,
      description: input.description ?? null,
      status,
      priority: input.priority ?? 0,
      sortOrder: input.sortOrder ?? 0,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      completedAt: status === "completed" ? new Date() : null,
    })
    .returning();

  return row;
}

export async function updateTask(id: string, input: UpdateTaskInput) {
  const existing = await getTaskById(id);
  if (!existing) {
    return null;
  }

  if (input.projectId) {
    const project = await getProjectById(input.projectId);
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }
  }

  const nextStatus = input.status ?? existing.status;
  const completedAt =
    nextStatus === "completed"
      ? existing.completedAt ?? new Date()
      : input.status && input.status !== "completed"
        ? null
        : existing.completedAt;

  const [row] = await db
    .update(tasks)
    .set({
      projectId: input.projectId,
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
      completedAt,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id))
    .returning();

  return row ?? null;
}

export async function deleteTask(id: string) {
  const [row] = await db
    .update(tasks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
    .returning();
  return row ?? null;
}
