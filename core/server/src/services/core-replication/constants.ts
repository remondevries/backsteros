/**
 * Tables kept in lockstep between local-core and cloud-core via the
 * replication worker. Live changes (insert/update/delete semantics) replicate
 * in both directions.
 */
export const REPLICATED_TABLES = [
  "meeting_scheduling_settings",
  "meetings",
  "api_keys",
] as const;

export type ReplicatedTable = (typeof REPLICATED_TABLES)[number];

/**
 * Tables copied once during bootstrap (`replication-bootstrap.ts`). Overlaps
 * REPLICATED_TABLES for rows that must exist before the worker starts.
 */
export const BOOTSTRAP_TABLES = [
  "meeting_scheduling_settings",
  "meetings",
  "api_keys",
] as const;

export type BootstrapTable = (typeof BOOTSTRAP_TABLES)[number];

/** Legacy portal key name — bootstrap used to copy only this row. */
export const LEGACY_BOOTSTRAP_API_KEY_NAME = "Meetings";
