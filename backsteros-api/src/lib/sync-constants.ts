export const SYNC_SCHEMA_VERSION = 1;

export const SYNC_ENTITIES = ["project", "task", "document"] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const SYNC_OPERATIONS = ["upsert", "delete"] as const;
export type SyncOperation = (typeof SYNC_OPERATIONS)[number];

export const POWERSYNC_TABLES = ["projects", "tasks", "documents"] as const;
export type PowerSyncTable = (typeof POWERSYNC_TABLES)[number];

export const POWERSYNC_OPS = ["PUT", "PATCH", "DELETE"] as const;
export type PowerSyncOp = (typeof POWERSYNC_OPS)[number];
