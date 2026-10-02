export type ReplicationCursor = {
  updatedAt: string;
  rowId: string;
};

/** Generic replicated row — snake_case keys match Postgres columns. */
export type ReplicationRow = Record<string, unknown>;

export type ReplicationChange = {
  table: string;
  row: ReplicationRow;
};

export type ReplicationChangesResponse = {
  table: string;
  changes: ReplicationChange[];
  cursor: ReplicationCursor;
};

/** Per-table tip for empty-pull short-circuit (single sync-state round-trip). */
export type ReplicationTableTip = {
  table: string;
  /** Latest (updatedAt, rowId) on the peer; null when the table is empty/absent. */
  tip: ReplicationCursor | null;
};

export type ReplicationSyncStateResponse = {
  tips: ReplicationTableTip[];
};

export type ReplicationApplyRequest = {
  table: string;
  changes: ReplicationChange[];
};

export type ReplicationApplyFailed = {
  id: string;
  code: string;
  message: string;
};

export type ReplicationApplyResponse = {
  applied: number;
  /** Intentional LWW / no-op / FK-sanitize skips only — not apply exceptions. */
  skipped: number;
  /** Rows that threw during apply (unique/FK/cast). Recorded as dead letters. */
  failed: ReplicationApplyFailed[];
};

export type ReplicationApplyDirection = "pull" | "push";

export type TableFingerprint = {
  table: string;
  count: number;
  fingerprint: string;
};

export type BootstrapResponse = {
  table: string;
  changes: ReplicationChange[];
};
