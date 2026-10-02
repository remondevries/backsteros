import type { ReplicatedTable } from "./constants.js";

/** Base delay after the first empty pull; doubles per consecutive empty, then caps. */
export const EMPTY_PULL_BACKOFF_BASE_MS = 15_000;
/** Cap so quiet tables are still re-checked at a bounded interval. */
export const EMPTY_PULL_BACKOFF_MAX_MS = 120_000;

export type EmptyPullState = {
  readonly cursorKey: string;
  streak: number;
  nextPullAtMs: number;
};

const emptyPullState = new Map<ReplicatedTable, EmptyPullState>();

export function resetEmptyPullStateForTests(): void {
  emptyPullState.clear();
}

function cursorIdentity(cursor: { updatedAt: string; rowId: string }): string {
  return `${cursor.updatedAt}\0${cursor.rowId}`;
}

/**
 * Exponential backoff for consecutive empty pulls at the same cursor.
 * streak 1 → 15s, 2 → 30s, 3 → 60s, 4+ → 120s (capped).
 */
export function emptyPullBackoffMs(streak: number): number {
  const safeStreak = Math.max(1, Math.floor(streak));
  const exp = Math.min(safeStreak - 1, 3);
  return Math.min(
    EMPTY_PULL_BACKOFF_MAX_MS,
    EMPTY_PULL_BACKOFF_BASE_MS * 2 ** exp,
  );
}

export function shouldDeferEmptyPull(
  table: ReplicatedTable,
  cursor: { updatedAt: string; rowId: string },
  nowMs: number,
): boolean {
  const prev = emptyPullState.get(table);
  if (!prev) return false;
  if (prev.cursorKey !== cursorIdentity(cursor)) return false;
  return nowMs < prev.nextPullAtMs;
}

export function notePullOutcome(
  table: ReplicatedTable,
  cursor: { updatedAt: string; rowId: string },
  hadChanges: boolean,
  nowMs: number,
): void {
  const key = cursorIdentity(cursor);
  if (hadChanges) {
    emptyPullState.delete(table);
    return;
  }
  const prev = emptyPullState.get(table);
  const streak = prev?.cursorKey === key ? prev.streak + 1 : 1;
  emptyPullState.set(table, {
    cursorKey: key,
    streak,
    nextPullAtMs: nowMs + emptyPullBackoffMs(streak),
  });
}

/** Test helper: inspect backoff state after notePullOutcome. */
export function getEmptyPullStateForTests(
  table: ReplicatedTable,
): EmptyPullState | undefined {
  const state = emptyPullState.get(table);
  return state ? { ...state } : undefined;
}
