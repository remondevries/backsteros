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
