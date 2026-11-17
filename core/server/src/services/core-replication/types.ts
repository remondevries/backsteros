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
  /**
   * Open dead-letter attempts for this row on the core that applied it
   * (re-sights bump it). Lets the sender bound its cursor hold. Optional:
   * older peers omit it.
   */
  attempts?: number;
  /**
   * False when `recordReplicationDeadLetter` itself threw — the row has no
   * durable letter. Cursor hold must not advance past these via the in-process
   * counter alone (OS-174). True when a letter was written; omitted by older peers.
   */
  deadLetterRecorded?: boolean;
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
