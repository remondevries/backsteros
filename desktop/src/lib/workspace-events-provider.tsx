import { useEffect, type ReactNode } from "react";

import { useDesktopApi } from "./api-context";
import {
  isCrmDataWorkspaceKind,
  isEmailWorkspaceKind,
  isFinanceWorkspaceKind,
  startWorkspaceEventsLoop,
  WORKSPACE_AREA_UPDATED_EVENT,
  WORKSPACE_CONTACT_UPDATED_EVENT,
  WORKSPACE_CRM_DATA_UPDATED_EVENT,
  WORKSPACE_CRM_GROUPS_UPDATED_EVENT,
  WORKSPACE_DOCUMENT_UPDATED_EVENT,
  WORKSPACE_EMAIL_UPDATED_EVENT,
  WORKSPACE_ENTITY_UPDATED_EVENT,
  WORKSPACE_FINANCE_UPDATED_EVENT,
  WORKSPACE_HABIT_UPDATED_EVENT,
  WORKSPACE_LETTER_UPDATED_EVENT,
  WORKSPACE_MEETING_UPDATED_EVENT,
  WORKSPACE_ORGANIZATION_UPDATED_EVENT,
  WORKSPACE_PROJECT_UPDATED_EVENT,
  WORKSPACE_TASK_UPDATED_EVENT,
  type WorkspaceAreaUpdatedDetail,
  type WorkspaceContactUpdatedDetail,
  type WorkspaceDocumentUpdatedDetail,
  type WorkspaceEntityUpdatedDetail,
  type WorkspaceHabitUpdatedDetail,
  type WorkspaceLetterUpdatedDetail,
  type WorkspaceMeetingUpdatedDetail,
  type WorkspaceOrganizationUpdatedDetail,
  type WorkspaceProjectUpdatedDetail,
  type WorkspaceTaskUpdatedDetail,
} from "./workspace-events";

/**
 * Long-lived workspace SSE → window CustomEvent for list overlays and
 * catalog refreshes before PowerSync download catches up.
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
        if (payload.kind === "meeting") {
          window.dispatchEvent(
            new CustomEvent<WorkspaceMeetingUpdatedDetail>(
              WORKSPACE_MEETING_UPDATED_EVENT,
              {
                detail: {
                  meetingId: payload.entityId,
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
          return;
        }
        if (payload.kind === "contact") {
          window.dispatchEvent(
            new CustomEvent<WorkspaceContactUpdatedDetail>(
              WORKSPACE_CONTACT_UPDATED_EVENT,
              {
                detail: {
                  contactId: payload.entityId,
                  operation: payload.operation,
                },
              },
            ),
          );
          return;
        }
        if (payload.kind === "organization") {
          window.dispatchEvent(
            new CustomEvent<WorkspaceOrganizationUpdatedDetail>(
              WORKSPACE_ORGANIZATION_UPDATED_EVENT,
              {
                detail: {
                  organizationId: payload.entityId,
                  operation: payload.operation,
                },
              },
            ),
          );
          return;
        }
        if (payload.kind === "area") {
          window.dispatchEvent(
            new CustomEvent<WorkspaceAreaUpdatedDetail>(
              WORKSPACE_AREA_UPDATED_EVENT,
              {
                detail: {
                  areaId: payload.entityId,
                  operation: payload.operation,
                },
              },
            ),
          );
          return;
        }
        if (payload.kind === "habit") {
          window.dispatchEvent(
            new CustomEvent<WorkspaceHabitUpdatedDetail>(
              WORKSPACE_HABIT_UPDATED_EVENT,
              {
                detail: {
                  habitId: payload.entityId,
                  operation: payload.operation,
                },
              },
            ),
          );
          return;
        }
        if (payload.kind === "letter") {
          window.dispatchEvent(
            new CustomEvent<WorkspaceLetterUpdatedDetail>(
              WORKSPACE_LETTER_UPDATED_EVENT,
              {
                detail: {
                  letterId: payload.entityId,
                  operation: payload.operation,
                },
              },
            ),
          );
          return;
        }
        if (
          payload.kind === "crm_group" ||
          payload.kind === "crm_group_member"
        ) {
          window.dispatchEvent(new Event(WORKSPACE_CRM_GROUPS_UPDATED_EVENT));
          return;
        }
        if (isCrmDataWorkspaceKind(payload.kind)) {
          window.dispatchEvent(new Event(WORKSPACE_CRM_DATA_UPDATED_EVENT));
          return;
        }
        if (isFinanceWorkspaceKind(payload.kind)) {
          window.dispatchEvent(new Event(WORKSPACE_FINANCE_UPDATED_EVENT));
          return;
        }
        if (isEmailWorkspaceKind(payload.kind)) {
          window.dispatchEvent(new Event(WORKSPACE_EMAIL_UPDATED_EVENT));
          return;
        }
        window.dispatchEvent(
          new CustomEvent<WorkspaceEntityUpdatedDetail>(
            WORKSPACE_ENTITY_UPDATED_EVENT,
            {
              detail: {
                kind: payload.kind,
                entityId: payload.entityId,
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
