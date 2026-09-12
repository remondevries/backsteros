import { type EnvironmentId, type ScopedThreadRef, type ThreadId } from "@t3tools/contracts";

import { migrateBacksterosTaskStatus, type BacksterosTaskStatus } from "./taskStatus";
import { useBacksterosTaskChatStore } from "./taskChatStore";

type SettleHandler = (target: ScopedThreadRef) => void;

let settleHandler: SettleHandler | null = null;

/** Task ids we already asked to settle (dedupe soft-poll + notify). */
const settleRequested = new Set<string>();

/**
 * Register the live settle callback from `useThreadActions`. One handler at a
 * time — mount from the BacksterOS shell once.
 */
export function registerBacksterosTaskChatSettleHandler(handler: SettleHandler): () => void {
  settleHandler = handler;
  return () => {
    if (settleHandler === handler) settleHandler = null;
  };
}

/** Test helper. */
export function clearBacksterosTaskChatSettleRequests(): void {
  settleRequested.clear();
}

/**
 * When a BacksterOS task becomes completed, settle its bound T3 chat so it
 * leaves the active list (Settled shelf on web / desktop / iOS).
 */
export function settleBoundBacksterosTaskChatIfCompleted(
  taskId: string,
  status: BacksterosTaskStatus | string,
): void {
  if (migrateBacksterosTaskStatus(status) !== "completed") {
    // Task reopened — allow a later complete to settle again.
    settleRequested.delete(taskId);
    return;
  }
  if (settleRequested.has(taskId)) return;
  const binding = useBacksterosTaskChatStore.getState().getBinding(taskId);
  if (!binding) return;
  if (!settleHandler) return;

  settleRequested.add(taskId);
  settleHandler({
    environmentId: binding.environmentId as EnvironmentId,
    threadId: binding.threadId as ThreadId,
  });
}

/** Soft-poll / list hydrate: settle chats for any completed bound tasks. */
export function settleBoundChatsForCompletedTasks(
  tasks: readonly { readonly id: string; readonly status: string }[],
): void {
  for (const task of tasks) {
    settleBoundBacksterosTaskChatIfCompleted(task.id, task.status);
  }
}
