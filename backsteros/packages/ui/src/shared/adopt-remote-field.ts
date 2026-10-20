/**
 * When a remote/synced value changes, update the tracked source and adopt into
 * local state only if the field is still clean (local matches the prior source).
 * Matches letter/task title live-sync behavior.
 */
export function adoptRemoteField(
  remote: string,
  local: string,
  source: string,
  setLocal: (next: string) => void,
  setSource: (next: string) => void,
): void {
  if (remote === source) return;
  setSource(remote);
  if (local === source) {
    setLocal(remote);
  }
}

/**
 * Same as {@link adoptRemoteField} for JSON-keyed collections (emails, phones,
 * languages, …), with an optional in-flight pending key.
 *
 * While `pendingKey` is set, ignore remote flaps until the synced value matches
 * the optimistic write — otherwise PowerSync identity churn / stale overlays
 * briefly revert the field after the user selects a value.
 */
export function adoptRemoteKeyedField(options: {
  remoteKey: string;
  localKey: string;
  sourceKey: string;
  pendingKey: string | null;
  setSource: (next: string) => void;
  setLocalFromRemote: () => void;
  clearPending: () => void;
}): void {
  const {
    remoteKey,
    localKey,
    sourceKey,
    pendingKey,
    setSource,
    setLocalFromRemote,
    clearPending,
  } = options;

  if (pendingKey !== null) {
    if (remoteKey === pendingKey) {
      clearPending();
      setSource(remoteKey);
      setLocalFromRemote();
    }
    return;
  }

  if (remoteKey === sourceKey) return;
  setSource(remoteKey);
  if (localKey === sourceKey) {
    setLocalFromRemote();
  }
}
