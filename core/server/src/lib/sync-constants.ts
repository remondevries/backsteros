export const SYNC_SCHEMA_VERSION = 1;

export const SYNC_ENTITIES = [
  "project",
  "task",
  "document",
  "area",
  "organization",
  "contact",
  "letter",
  "workspace_setting",
  "bank_account",
  "financial_category",
  "financial_goal",
  "financial_recurring",
  "cashflow_planner_entry",
  "habit",
  "meeting",
  "task_comment",
] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const SYNC_OPERATIONS = ["upsert", "patch", "delete"] as const;
export type SyncOperation = (typeof SYNC_OPERATIONS)[number];

export const POWERSYNC_TABLES = [
  "projects",
  "tasks",
  "documents",
  "areas",
  "organizations",
  "contacts",
  "letters",
  "workspace_settings",
  "bank_accounts",
  "financial_categories",
  "financial_goals",
  "financial_recurrings",
  "cashflow_planner_entries",
  "habits",
  "meetings",
  "task_comments",
] as const;
export type PowerSyncTable = (typeof POWERSYNC_TABLES)[number];

export const POWERSYNC_OPS = ["PUT", "PATCH", "DELETE"] as const;
export type PowerSyncOp = (typeof POWERSYNC_OPS)[number];
