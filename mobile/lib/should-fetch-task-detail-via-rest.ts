/**
 * Prefer PowerSync; once the local watch has settled without a row, fetch via
 * REST. Task lists always hydrate from REST when offline / empty local — detail
 * must match that, or opening a listed task shows "Task not found".
 */
export function shouldFetchTaskDetailViaRest(input: {
  taskId: string | undefined;
  hasSyncedTask: boolean;
  syncLoading: boolean;
  powerSyncStatus: string;
  powerSyncReady: boolean;
  restFallbackAllowed: boolean;
}): boolean {
  if (!input.taskId || input.hasSyncedTask) return false;

  // Still waiting for first sync / empty-DB grace period.
  const waitingForSync =
    input.syncLoading ||
    (!input.powerSyncReady &&
      !input.restFallbackAllowed &&
      input.powerSyncStatus !== "error" &&
      input.powerSyncStatus !== "unauthenticated");

  return !waitingForSync;
}
