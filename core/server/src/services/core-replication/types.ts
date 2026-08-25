import type { ReplicatedTable } from "./constants.js";

export type ReplicationCursor = {
  updatedAt: string;
  rowId: string;
};

export type ApiKeyReplicationRow = {
  id: string;
  workspaceId: string;
  userId: string | null;
  name: string;
  prefix: string;
  keyHash: string;
  scopes: string[];
  contactId: string | null;
  createdAt: string;
  revokedAt: string | null;
  updatedAt: string;
};

export type ReplicationChange = {
  table: ReplicatedTable;
  row: ApiKeyReplicationRow;
};

export type ReplicationChangesResponse = {
  table: ReplicatedTable;
  changes: ReplicationChange[];
  cursor: ReplicationCursor;
};

export type ReplicationApplyRequest = {
  table: ReplicatedTable;
  changes: ReplicationChange[];
};

export type ReplicationApplyResponse = {
  applied: number;
  skipped: number;
};
