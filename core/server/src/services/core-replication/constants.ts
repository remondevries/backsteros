/**
 * Tables kept in lockstep between local-core and cloud-core via the
 * replication worker. Live changes replicate in both directions.
 *
 * Matches the VPS-shaped stack on cloud-core; api_keys added for live sync
 * (previously bootstrap-only with Meetings-only filter).
 */
export const REPLICATED_TABLES = [
  "meeting_scheduling_settings",
  "meetings",
  "tasks",
  "api_keys",
] as const;

export type ReplicatedTable = (typeof REPLICATED_TABLES)[number];

/**
 * One-shot bootstrap copy (`replication:bootstrap`). Includes foreign-key
 * parents and every live table so pairing works on a fresh peer.
 */
export const BOOTSTRAP_TABLES = [
  "workspaces",
  "workspace_settings",
  "api_keys",
  "entity_counters",
  ...REPLICATED_TABLES,
] as const;

export type BootstrapTable = (typeof BOOTSTRAP_TABLES)[number];

/** Legacy portal key name — old bootstrap copied only this row. */
export const LEGACY_BOOTSTRAP_API_KEY_NAME = "Meetings";

/** Task rows with this legacy_source value are calendar-busy blocks (cloud-core filter). */
export const CALENDAR_BUSY_TASK_LEGACY_SOURCE = "calendar_busy";

/** Hostnames that must never be used as CORE_REPLICATION_PEER_URL (agents HTTPS door). */
export const AGENTS_DOOR_HOSTNAMES = [
  "agent.backsteros.com",
  "agents.backsteros.com",
] as const;
