/**
 * Map applied sync_events → workspace SSE for open shells (local-core).
 */
import {
  publishDocumentWorkspaceUpdated,
  publishLetterWorkspaceUpdated,
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
 * After a peer sync_event is applied on local-core, notify open shells.
 * No-op kinds (finance, contacts, …) are ignored — PowerSync covers those.
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

  switch (entity) {
    case "document":
      publishDocumentWorkspaceUpdated(workspaceId, event.entityId, {
        projectId,
        contentVersion,
        operation: operation === "delete" ? "delete" : "upsert",
      });
      break;
    case "task":
      publishTaskWorkspaceUpdated(workspaceId, event.entityId, {
        projectId,
        reason: "patch",
      });
      break;
    case "task_comment": {
      // entityId on the sync_event is the comment id; shells watch by task id.
      const taskId =
        typeof payload.task_id === "string" && payload.task_id.trim()
          ? payload.task_id.trim()
          : typeof payload.taskId === "string" && payload.taskId.trim()
            ? payload.taskId.trim()
            : null;
      if (!taskId) break;
      publishTaskWorkspaceUpdated(workspaceId, taskId, {
        projectId,
        reason: "comment",
      });
      break;
    }
    case "meeting":
      publishMeetingWorkspaceUpdated(workspaceId, event.entityId, {
        projectId,
      });
      break;
    case "project":
      publishProjectWorkspaceUpdated(workspaceId, event.entityId, {
        operation: operation === "delete" ? "delete" : "upsert",
      });
      break;
    case "letter":
      publishLetterWorkspaceUpdated(workspaceId, event.entityId, {
        projectId,
      });
      break;
    default:
      break;
  }
}
