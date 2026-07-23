import type {
  ApiKey,
  Document,
  Project,
  SearchResult,
  Task,
  TaskActivity,
  TaskComment,
} from "@backsteros/contracts";

import type {
  DbApiKey,
  DbDocument,
  DbProject,
  DbTask,
  DbTaskActivity,
  DbTaskComment,
} from "../db/schema.js";
import {
  activityActorName,
  authorDisplayName,
} from "../services/task-comments.js";
import type { TaskActivityListRow } from "../services/task-activities.js";

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
    organizationId: row.organizationId,
    areaId: row.areaId,
    area: row.area as Project["area"],
    startDate: toIso(row.startDate),
    dueDate: toIso(row.dueDate),
    icon: row.icon,
    color: row.color,
    type: row.type as Project["type"],
    githubRepository: row.githubRepository ?? null,
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
    contactId: row.contactId,
    assigneeId: row.assigneeId,
    number: row.number,
    title: row.title,
    description: row.description,
    status: row.status as Task["status"],
    priority: row.priority,
    sortOrder: row.sortOrder,
    dueDate: toIso(row.dueDate),
    triagedAt: toIso(row.triagedAt),
    inbox: row.inbox,
    completedAt: toIso(row.completedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

export function toTaskComment(row: DbTaskComment): TaskComment {
  return {
    id: row.id,
    taskId: row.taskId,
    authorUserId: row.authorUserId,
    authorEmail: row.authorEmail,
    authorName: authorDisplayName(row.authorEmail),
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

export function toTaskActivity(
  row: DbTaskActivity | TaskActivityListRow,
): TaskActivity {
  const data =
    row.data && typeof row.data === "object" && !Array.isArray(row.data)
      ? (row.data as Record<string, unknown>)
      : {};
  const listRow = row as TaskActivityListRow;
  return {
    id: row.id,
    taskId: row.taskId,
    type: row.type as TaskActivity["type"],
    actorUserId: row.actorUserId,
    actorEmail: row.actorEmail,
    actorName: activityActorName({
      actorUserId: row.actorUserId,
      actorEmail: row.actorEmail ?? listRow.userEmail ?? null,
      actorName: row.actorName,
      userDisplayName: listRow.userDisplayName ?? null,
    }),
    data,
    createdAt: row.createdAt.toISOString(),
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
    parentId: row.parentId,
    kind: row.kind as Document["kind"],
    icon: row.icon,
    sortOrder: row.sortOrder,
    journalDate: row.journalDate,
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
