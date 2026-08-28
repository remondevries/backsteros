/**
 * Prefer PowerSync for task description. REST only when the local watch has
 * settled without a row (cold empty DB) — never on every open.
 */
export function shouldFetchTaskDescriptionViaRest(input: {
  taskId: string | null | undefined;
  hasLocalRow: boolean;
  /** True while the one-row watch has not produced a result yet. */
  syncLoading: boolean;
  powerSyncReady: boolean;
  powerSyncStatus: string;
}): boolean {
  if (!input.taskId || input.hasLocalRow) return false;
  if (input.syncLoading) return false;
  if (
    !input.powerSyncReady &&
    input.powerSyncStatus !== "error" &&
    input.powerSyncStatus !== "unauthenticated"
  ) {
    return false;
  }
  return true;
}
