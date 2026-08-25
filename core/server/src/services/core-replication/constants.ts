/**
 * Tables kept in lockstep between local-core and cloud-core via the
 * replication worker. Live changes replicate in both directions.
 *
 * Phase B: full Tier A/B workspace twin (+ agent-facing email/task activity),
 * not the Phase A meetings-only subset. PDFs and PTY stay local-only.
 */
export const REPLICATED_TABLES = [
  "users",
  "workspaces",
  "workspace_members",
  "workspace_settings",
  "workspace_integration_secrets",
  "areas",
  "organizations",
  "contacts",
  "projects",
  "habits",
  "bank_accounts",
  "financial_categories",
  "financial_goals",
  "financial_recurrings",
  "cashflow_planner_entries",
  "tasks",
  "documents",
  "letters",
  "letter_attachments",
  "meetings",
  "meeting_scheduling_settings",
  "avatars",
  "mentions",
  "email_threads",
  "email_thread_comments",
  "task_comments",
  "task_activities",
  "recurring_tasks",
  "device_push_tokens",
  "entity_counters",
  "api_keys",
  "financial_transactions",
] as const;

export type ReplicatedTable = (typeof REPLICATED_TABLES)[number];

/**
 * One-shot bootstrap copy (`replication:bootstrap`). Same ordered set as live
 * sync so foreign-key parents land before children.
 */
export const BOOTSTRAP_TABLES: readonly ReplicatedTable[] = REPLICATED_TABLES;

export type BootstrapTable = ReplicatedTable;

/** Legacy portal key name — old bootstrap copied only this row. */
export const LEGACY_BOOTSTRAP_API_KEY_NAME = "Meetings";

/** @deprecated Busy-only task filter removed in Phase B full twin. */
export const CALENDAR_BUSY_TASK_LEGACY_SOURCE = "calendar_busy";

/** Hostnames that must never be used as CORE_REPLICATION_PEER_URL (agents HTTPS door). */
export const AGENTS_DOOR_HOSTNAMES = [
  "agent.backsteros.com",
  "agents.backsteros.com",
] as const;
