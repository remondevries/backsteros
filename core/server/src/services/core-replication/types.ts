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

export type ReplicationApplyRequest = {
  table: string;
  changes: ReplicationChange[];
};

export type ReplicationApplyResponse = {
  applied: number;
  skipped: number;
};

export type BootstrapResponse = {
  table: string;
  changes: ReplicationChange[];
};
