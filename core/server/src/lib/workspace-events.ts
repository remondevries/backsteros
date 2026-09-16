/**
 * In-process fan-out for workspace entity updates → open shell SSE streams.
 * Used by portal + desktop to refresh without REST polling / stale Tier D caches.
 *
 * Kinds match {@link SyncEntity} so every replicated write can wake open shells.
 */
import { SYNC_ENTITIES, type SyncEntity } from "./sync-constants.js";

export type WorkspaceUpdatedKind = SyncEntity;

export type WorkspaceUpdatedOperation = "upsert" | "delete";

export type WorkspaceUpdatedEvent = {
  workspaceId: string;
  kind: WorkspaceUpdatedKind;
  entityId: string;
  projectId?: string | null;
  reason?: "comment" | "patch";
  /** Present for document body writes so clients can skip stale Tier D caches. */
  contentVersion?: number | null;
  /** Metadata lifecycle — clients drop rows on delete before PowerSync catches up. */
  operation?: WorkspaceUpdatedOperation;
};

type WorkspaceUpdatedListener = (event: WorkspaceUpdatedEvent) => void;

const listenersByWorkspace = new Map<string, Set<WorkspaceUpdatedListener>>();

const WORKSPACE_UPDATED_KIND_SET = new Set<string>(SYNC_ENTITIES);

export function isWorkspaceUpdatedKind(
  value: string,
): value is WorkspaceUpdatedKind {
  return WORKSPACE_UPDATED_KIND_SET.has(value);
}

export function subscribeWorkspaceUpdated(
  workspaceId: string,
  listener: WorkspaceUpdatedListener,
): () => void {
  const id = workspaceId.trim();
  if (!id) return () => {};
  let set = listenersByWorkspace.get(id);
  if (!set) {
    set = new Set();
    listenersByWorkspace.set(id, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listenersByWorkspace.delete(id);
  };
}

export function publishWorkspaceUpdated(event: WorkspaceUpdatedEvent): void {
  const set = listenersByWorkspace.get(event.workspaceId);
  if (!set || set.size === 0) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch (error) {
      console.error("workspace.updated listener failed:", error);
    }
  }
}

/** Generic wake for any sync entity (finance, habits, CRM extras, …). */
export function publishEntityWorkspaceUpdated(
  workspaceId: string,
  kind: WorkspaceUpdatedKind,
  entityId: string,
  input?: {
    projectId?: string | null;
    reason?: "comment" | "patch";
    contentVersion?: number | null;
    operation?: WorkspaceUpdatedOperation;
  },
): void {
  publishWorkspaceUpdated({
    workspaceId,
    kind,
    entityId,
    projectId: input?.projectId ?? null,
    reason: input?.reason ?? "patch",
    contentVersion: input?.contentVersion ?? null,
    operation: input?.operation ?? "upsert",
  });
}

export function publishTaskWorkspaceUpdated(
  workspaceId: string,
  taskId: string,
  input?: {
    projectId?: string | null;
    reason?: "comment" | "patch";
    operation?: WorkspaceUpdatedOperation;
  },
): void {
  publishEntityWorkspaceUpdated(workspaceId, "task", taskId, {
    projectId: input?.projectId ?? null,
    reason: input?.reason,
    operation: input?.operation ?? "upsert",
  });
}

export function publishMeetingWorkspaceUpdated(
  workspaceId: string,
  meetingId: string,
  input?: {
    projectId?: string | null;
    operation?: WorkspaceUpdatedOperation;
  },
): void {
  publishEntityWorkspaceUpdated(workspaceId, "meeting", meetingId, {
    projectId: input?.projectId ?? null,
    operation: input?.operation ?? "upsert",
  });
}

export function publishProjectWorkspaceUpdated(
  workspaceId: string,
  projectId: string,
  input?: { operation?: WorkspaceUpdatedOperation },
): void {
  publishEntityWorkspaceUpdated(workspaceId, "project", projectId, {
    projectId,
    operation: input?.operation ?? "upsert",
  });
}

export function publishDocumentWorkspaceUpdated(
  workspaceId: string,
  documentId: string,
  input?: {
    projectId?: string | null;
    contentVersion?: number | null;
    operation?: WorkspaceUpdatedOperation;
  },
): void {
  publishEntityWorkspaceUpdated(workspaceId, "document", documentId, {
    projectId: input?.projectId ?? null,
    contentVersion: input?.contentVersion ?? null,
    operation: input?.operation ?? "upsert",
  });
}

export function publishLetterWorkspaceUpdated(
  workspaceId: string,
  letterId: string,
  input?: { projectId?: string | null; operation?: WorkspaceUpdatedOperation },
): void {
  publishEntityWorkspaceUpdated(workspaceId, "letter", letterId, {
    projectId: input?.projectId ?? null,
    operation: input?.operation ?? "upsert",
  });
}

export function publishContactWorkspaceUpdated(
  workspaceId: string,
  contactId: string,
  input?: { operation?: WorkspaceUpdatedOperation },
): void {
  publishEntityWorkspaceUpdated(workspaceId, "contact", contactId, input);
}

export function publishOrganizationWorkspaceUpdated(
  workspaceId: string,
  organizationId: string,
  input?: { operation?: WorkspaceUpdatedOperation },
): void {
  publishEntityWorkspaceUpdated(
    workspaceId,
    "organization",
    organizationId,
    input,
  );
}

export function publishCrmGroupWorkspaceUpdated(
  workspaceId: string,
  groupId: string,
  input?: { operation?: WorkspaceUpdatedOperation },
): void {
  publishEntityWorkspaceUpdated(workspaceId, "crm_group", groupId, input);
}

export function publishCrmGroupMemberWorkspaceUpdated(
  workspaceId: string,
  memberId: string,
  input?: { operation?: WorkspaceUpdatedOperation },
): void {
  publishEntityWorkspaceUpdated(
    workspaceId,
    "crm_group_member",
    memberId,
    input,
  );
}

/** Test helper — clear all subscribers. */
export function clearWorkspaceUpdatedListeners(): void {
  listenersByWorkspace.clear();
}
