/**
 * entity_counters merge (Round 4).
 *
 * A counter is a monotonic high-water mark of the next display number. Last-
 * writer-wins on updated_at can roll it back (older peer row with a higher
 * next_value is dropped; a timestamp tie keeps whichever core applied first),
 * which re-issues numbers and forks task / email / organization numbering.
 *
 * Always merge: next_value = max(local, remote); updated_at = max of both so
 * the merged row replicates onward and both cores converge regardless of the
 * order (or tie) in which rows arrive.
 */

export type EntityCounterState = {
  nextValue: number;
  updatedAt: Date;
};

export type EntityCounterMerge = {
  nextValue: number;
  updatedAt: Date;
  /** True when the merged state differs from the existing local row. */
  changed: boolean;
};

export function mergeEntityCounter(
  existing: EntityCounterState | null,
  remote: EntityCounterState,
): EntityCounterMerge {
  if (!existing) {
    return { ...remote, changed: true };
  }
  const nextValue = Math.max(existing.nextValue, remote.nextValue);
  const remoteMs = remote.updatedAt.getTime();
  const existingMs = existing.updatedAt.getTime();
  const updatedAt =
    Number.isFinite(remoteMs) && remoteMs > existingMs
      ? remote.updatedAt
      : existing.updatedAt;
  return {
    nextValue,
    updatedAt,
    changed:
      nextValue !== existing.nextValue ||
      updatedAt.getTime() !== existing.updatedAt.getTime(),
  };
}
