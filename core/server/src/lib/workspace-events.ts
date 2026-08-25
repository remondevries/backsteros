/**
 * In-process fan-out for workspace entity updates → open shell SSE streams.
 * Used by portal + desktop to refresh without REST polling / stale Tier D caches.
 */

export type WorkspaceUpdatedKind =
  | "task"
  | "meeting"
  | "project"
  | "document"
  | "letter";

export type WorkspaceUpdatedEvent = {
  workspaceId: string;
  kind: WorkspaceUpdatedKind;
  entityId: string;
  projectId?: string | null;
  reason?: "comment" | "patch";
};

type WorkspaceUpdatedListener = (event: WorkspaceUpdatedEvent) => void;

const listenersByWorkspace = new Map<string, Set<WorkspaceUpdatedListener>>();

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

export function publishTaskWorkspaceUpdated(
  workspaceId: string,
  taskId: string,
  input?: { projectId?: string | null; reason?: "comment" | "patch" },
): void {
  publishWorkspaceUpdated({
    workspaceId,
    kind: "task",
    entityId: taskId,
    projectId: input?.projectId ?? null,
    reason: input?.reason,
  });
}

export function publishMeetingWorkspaceUpdated(
  workspaceId: string,
  meetingId: string,
  input?: { projectId?: string | null },
): void {
  publishWorkspaceUpdated({
    workspaceId,
    kind: "meeting",
    entityId: meetingId,
    projectId: input?.projectId ?? null,
    reason: "patch",
  });
}

export function publishProjectWorkspaceUpdated(
  workspaceId: string,
  projectId: string,
): void {
  publishWorkspaceUpdated({
    workspaceId,
    kind: "project",
    entityId: projectId,
    projectId,
    reason: "patch",
  });
}

export function publishDocumentWorkspaceUpdated(
  workspaceId: string,
  documentId: string,
  input?: { projectId?: string | null },
): void {
  publishWorkspaceUpdated({
    workspaceId,
    kind: "document",
    entityId: documentId,
    projectId: input?.projectId ?? null,
    reason: "patch",
  });
}

export function publishLetterWorkspaceUpdated(
  workspaceId: string,
  letterId: string,
  input?: { projectId?: string | null },
): void {
  publishWorkspaceUpdated({
    workspaceId,
    kind: "letter",
    entityId: letterId,
    projectId: input?.projectId ?? null,
    reason: "patch",
  });
}

/** Test helper — clear all subscribers. */
export function clearWorkspaceUpdatedListeners(): void {
  listenersByWorkspace.clear();
}
