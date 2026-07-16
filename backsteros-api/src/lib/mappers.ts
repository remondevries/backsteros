import type { ApiKey, Document, Project, SearchResult, Task } from "@backsteros/contracts";

import type { DbApiKey, DbDocument, DbProject, DbTask } from "../db/schema.js";

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

export function toDocument(row: DbDocument): Document {
  return {
    id: row.id,
    type: row.type as Document["type"],
    projectId: row.projectId,
    path: row.path,
    title: row.title,
    storageKey: row.storageKey,
    contentType: row.contentType,
    byteSize: row.byteSize,
    checksum: row.checksum,
    snippet: row.snippet,
    contentVersion: row.contentVersion,
    contentEtag: row.contentEtag,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

export function toSearchResult(row: DbDocument): SearchResult {
  return {
    id: row.id,
    type: row.type as SearchResult["type"],
    projectId: row.projectId,
    path: row.path,
    title: row.title,
    snippet: row.snippet,
    updatedAt: row.updatedAt.toISOString(),
  };
}
