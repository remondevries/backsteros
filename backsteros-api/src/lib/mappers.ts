import type { ApiKey, Project, Task } from "@backsteros/contracts";

import type { DbApiKey, DbProject, DbTask } from "../db/schema.js";

export function toIso(date: Date | null | undefined): string | null {
  if (!date) {
    return null;
  }
  return date.toISOString();
}

export function toProject(row: DbProject): Project {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    summary: row.summary,
    description: row.description,
    status: row.status as Project["status"],
    priority: row.priority,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

export function toTask(row: DbTask): Task {
  return {
    id: row.id,
    projectId: row.projectId,
    number: row.number,
    title: row.title,
    description: row.description,
    status: row.status as Task["status"],
    priority: row.priority,
    sortOrder: row.sortOrder,
    dueDate: toIso(row.dueDate),
    completedAt: toIso(row.completedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

export function toApiKey(row: DbApiKey): ApiKey {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes as ApiKey["scopes"],
    createdAt: row.createdAt.toISOString(),
    revokedAt: toIso(row.revokedAt),
  };
}
