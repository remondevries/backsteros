/**
 * Map applied sync_events → workspace SSE for open shells (local-core).
 * Every {@link SyncEntity} wakes open shells; special cases keep task_comment /
 * document contentVersion semantics.
 */
import {
  isWorkspaceUpdatedKind,
  publishEntityWorkspaceUpdated,
  publishDocumentWorkspaceUpdated,
  publishMeetingWorkspaceUpdated,
  publishProjectWorkspaceUpdated,
  publishTaskWorkspaceUpdated,
} from "../../lib/workspace-events.js";
import type { SyncEntity, SyncOperation } from "../../lib/sync-constants.js";
import type { SyncEventRow } from "../sync-log.js";

function asContentVersion(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asProjectId(payload: Record<string, unknown>): string | null {
  const raw = payload.project_id ?? payload.projectId;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

/**
 * After a peer sync_event is applied on local-core (or leader-first apply),
 * notify open shells so UI refreshes before PowerSync download catches up.
 */
export function publishWorkspaceUpdatedFromSyncEvent(
  workspaceId: string,
  event: Pick<
    SyncEventRow,
    "entity" | "entityId" | "operation" | "payload"
  >,
): void {
  const entity = event.entity as SyncEntity | string;
  const operation = event.operation as SyncOperation | string;
  const payload = event.payload ?? {};
  const projectId = asProjectId(payload);
  const contentVersion = asContentVersion(
    payload.content_version ?? payload.contentVersion,
  );
  const op = operation === "delete" ? "delete" : "upsert";

  switch (entity) {
    case "document":
      publishDocumentWorkspaceUpdated(workspaceId, event.entityId, {
        projectId,
        contentVersion,
        operation: op,
      });
      return;
    case "task":
      publishTaskWorkspaceUpdated(workspaceId, event.entityId, {
        projectId,
        reason: "patch",
        operation: op,
      });
      return;
    case "task_comment": {
      const taskId =
        typeof payload.task_id === "string" && payload.task_id.trim()
          ? payload.task_id.trim()
          : typeof payload.taskId === "string" && payload.taskId.trim()
            ? payload.taskId.trim()
            : null;
      if (!taskId) return;
      publishTaskWorkspaceUpdated(workspaceId, taskId, {
        projectId,
        reason: "comment",
      });
      return;
    }
    case "task_activity": {
      const taskId =
        typeof payload.task_id === "string" && payload.task_id.trim()
          ? payload.task_id.trim()
          : typeof payload.taskId === "string" && payload.taskId.trim()
            ? payload.taskId.trim()
            : null;
      if (!taskId) return;
      // Activity rows are task-scoped; wake the task activity feed like comments.
      publishTaskWorkspaceUpdated(workspaceId, taskId, {
        projectId,
        reason: "comment",
      });
      return;
    }
    case "meeting":
      publishMeetingWorkspaceUpdated(workspaceId, event.entityId, {
        projectId,
        operation: op,
      });
      return;
    case "project":
      publishProjectWorkspaceUpdated(workspaceId, event.entityId, {
        operation: op,
      });
      return;
    default:
      if (!isWorkspaceUpdatedKind(entity)) return;
      // task_comment handled above; never emit raw task_comment kind to shells.
      if (entity === "task_comment") return;
      publishEntityWorkspaceUpdated(workspaceId, entity, event.entityId, {
        projectId,
        operation: op,
        contentVersion: entity === "document" ? contentVersion : null,
      });
  }
}
