import { useEffect, type ReactNode } from "react";

import { useDesktopApi } from "./api-context";
import {
  startWorkspaceEventsLoop,
  WORKSPACE_DOCUMENT_UPDATED_EVENT,
  WORKSPACE_PROJECT_UPDATED_EVENT,
  WORKSPACE_TASK_UPDATED_EVENT,
  type WorkspaceDocumentUpdatedDetail,
  type WorkspaceProjectUpdatedDetail,
  type WorkspaceTaskUpdatedDetail,
} from "./workspace-events";

/**
 * Long-lived workspace SSE → window CustomEvent for open document hooks,
 * document-list live overlays, and project list/detail before PowerSync.
 */
export function WorkspaceEventsProvider({ children }: { children: ReactNode }) {
  const { client } = useDesktopApi();

  useEffect(() => {
    const controller = new AbortController();
    startWorkspaceEventsLoop({
      client,
      signal: controller.signal,
      onUpdated: (payload) => {
        if (payload.kind === "document") {
          window.dispatchEvent(
            new CustomEvent<WorkspaceDocumentUpdatedDetail>(
              WORKSPACE_DOCUMENT_UPDATED_EVENT,
              {
                detail: {
                  documentId: payload.entityId,
                  contentVersion: payload.contentVersion,
                  operation: payload.operation,
                },
              },
            ),
          );
          return;
        }
        if (payload.kind === "project") {
          window.dispatchEvent(
            new CustomEvent<WorkspaceProjectUpdatedDetail>(
              WORKSPACE_PROJECT_UPDATED_EVENT,
              {
                detail: {
                  projectId: payload.entityId,
                  operation: payload.operation,
                },
              },
            ),
          );
          return;
        }
        if (payload.kind === "task") {
          window.dispatchEvent(
            new CustomEvent<WorkspaceTaskUpdatedDetail>(
              WORKSPACE_TASK_UPDATED_EVENT,
              {
                detail: {
                  taskId: payload.entityId,
                  reason: payload.reason,
                  operation: payload.operation,
                },
              },
            ),
          );
        }
      },
    });
    return () => {
      controller.abort();
    };
  }, [client]);

  return children;
}
