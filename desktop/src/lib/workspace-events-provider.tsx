import { useEffect, type ReactNode } from "react";

import { useDesktopApi } from "./api-context";
import {
  startWorkspaceEventsLoop,
  WORKSPACE_DOCUMENT_UPDATED_EVENT,
  type WorkspaceDocumentUpdatedDetail,
} from "./workspace-events";

/**
 * Long-lived workspace SSE → window CustomEvent for open document hooks and
 * document-list live overlays (agent create/move/delete/content).
 */
export function WorkspaceEventsProvider({ children }: { children: ReactNode }) {
  const { client } = useDesktopApi();

  useEffect(() => {
    const controller = new AbortController();
    startWorkspaceEventsLoop({
      client,
      signal: controller.signal,
      onUpdated: (payload) => {
        if (payload.kind !== "document") return;
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
      },
    });
    return () => {
      controller.abort();
    };
  }, [client]);

  return children;
}
