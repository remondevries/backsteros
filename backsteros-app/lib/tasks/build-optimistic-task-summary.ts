import type { TaskPriority } from "@/lib/db/schema";
import type { TaskWithContextSummary } from "@/lib/db/queries/tasks";
import type { LocalCreatedTaskSnapshot } from "@/lib/sync/local-created-task-snapshot";

export function buildOptimisticTaskWithContextSummary(
  snapshot: LocalCreatedTaskSnapshot,
  context?: {
    project?: TaskWithContextSummary["project"];
    contact?: TaskWithContextSummary["contact"];
  },
): TaskWithContextSummary {
  const updatedAt = new Date(snapshot.updatedAt);

  return {
    id: snapshot.taskId,
    projectId: snapshot.projectId,
    contactId: snapshot.contactId,
    assigneeId: null,
    number: snapshot.taskNumber,
    title: snapshot.title,
    description: null,
    status: snapshot.status,
    priority: snapshot.priority as TaskPriority,
    sortOrder: snapshot.sortOrder,
    dueDate: snapshot.dueDate != null ? new Date(snapshot.dueDate) : null,
    triagedAt: null,
    inbox: snapshot.projectId == null && snapshot.contactId == null,
    completedAt: null,
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null,
    project: context?.project ?? null,
    contact: context?.contact ?? null,
  };
}
