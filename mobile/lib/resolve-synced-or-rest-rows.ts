/**
 * Choose list rows from PowerSync local SQLite vs REST.
 *
 * When the sync stream is connected, local watches are live — prefer them.
 * When disconnected, a prior SQLite cache can be stale (items removed elsewhere
 * still linger). Prefer a loaded REST snapshot so membership matches the server.
 */
export function resolveSyncedOrRestRows<T>(input: {
  localRows: readonly T[];
  restRows: readonly T[] | null;
  connected: boolean;
}): T[] {
  const { localRows, restRows, connected } = input;
  const restLoaded = restRows != null;

  if (connected) {
    if (localRows.length > 0) return [...localRows];
    if (restLoaded) return [...restRows];
    return [...localRows];
  }

  if (restLoaded) return [...restRows];
  return [...localRows];
}
