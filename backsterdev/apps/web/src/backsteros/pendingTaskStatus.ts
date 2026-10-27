import { migrateBacksterosTaskStatus, type BacksterosTaskStatus } from "./taskStatus";
import type { BacksterosTask } from "./types";

/**
 * Optimistic status overlays for shared list queries.
 *
 * Soft-poll replaces the whole list when *any* row's fingerprint changes. Without
 * this map, an in-flight status promote can be wiped by an unrelated task update
 * until the server (and soft-poll) catch up — often seconds to minutes.
 */
const pendingByTaskId = new Map<string, BacksterosTaskStatus>();

/** Remember a status we just applied locally until the server agrees. */
export function setPendingBacksterosTaskStatus(taskId: string, status: BacksterosTaskStatus): void {
  const id = taskId.trim();
  if (!id) return;
  pendingByTaskId.set(id, status);
}

/** Drop the overlay once the server (or a hard reload) is authoritative. */
export function clearPendingBacksterosTaskStatus(taskId: string): void {
  pendingByTaskId.delete(taskId.trim());
}

/** Test helper. */
export function clearAllPendingBacksterosTaskStatuses(): void {
  pendingByTaskId.clear();
}

/** Test helper. */
export function getPendingBacksterosTaskStatusCount(): number {
  return pendingByTaskId.size;
}

/**
 * Human-owned or terminal statuses. If the server already shows one of these
 * while an agent overlay is still pending, drop the overlay so Waiting / On
 * Hold / closed outcomes are not masked by a stale In Progress / In Review.
 *
 * Do **not** include ready_to_start / triage / backlog / in_review here —
 * those are the usual statuses when work starts, and soft-poll often returns
 * them for several seconds while the In Progress PATCH is still in flight.
 * Treating them as "server wins" caused the row/detail to flicker between
 * In Progress and the previous status for the whole lag window.
 */
const SERVER_WINS_OVER_AGENT_PENDING = new Set<BacksterosTaskStatus>([
  "waiting",
  "on_hold",
  "completed",
  "canceled",
  "duplicated",
]);

/**
 * Re-apply optimistic statuses onto a freshly fetched list. Clears overlays
 * that already match the server, or when the server moved to a human-owned
 * status (e.g. Waiting) while an agent In Progress / In Review overlay lingered.
 */
export function applyPendingBacksterosTaskStatuses<
  T extends { readonly id: string; readonly status: string },
>(tasks: readonly T[]): readonly T[] {
  if (pendingByTaskId.size === 0) return tasks;

  let changed = false;
  const next = tasks.map((task) => {
    const pending = pendingByTaskId.get(task.id);
    if (pending == null) return task;
    const serverStatus = migrateBacksterosTaskStatus(task.status);
    if (serverStatus === pending) {
      pendingByTaskId.delete(task.id);
      return task;
    }
    if (SERVER_WINS_OVER_AGENT_PENDING.has(serverStatus)) {
      pendingByTaskId.delete(task.id);
      return task;
    }
    changed = true;
    return { ...task, status: pending };
  });

  return changed ? next : tasks;
}

/**
 * Soft-poll / single-task fetch: keep an in-flight agent status overlay so the
 * detail chip does not snap back to the previous server value every few seconds.
 */
export function applyPendingBacksterosTaskStatus<T extends { readonly id: string; readonly status: string }>(
  task: T,
): T {
  const [next] = applyPendingBacksterosTaskStatuses([task]);
  return next ?? task;
}

/** Convenience for hooks that patch a single row. */
export function pendingStatusPatch(
  taskId: string,
  patch: Partial<Pick<BacksterosTask, "status">>,
): void {
  if (patch.status == null) return;
  setPendingBacksterosTaskStatus(taskId, migrateBacksterosTaskStatus(patch.status));
}
