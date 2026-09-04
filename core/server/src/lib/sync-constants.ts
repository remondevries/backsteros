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
  "financial_transaction",
  "habit",
  "meeting",
  "task_comment",
  "contact_relationship",
  "crm_relationship_label",
  "crm_group",
  "crm_group_member",
  "crm_activity",
  "task_activity",
  "email_thread",
  "email_thread_comment",
  "recurring_task",
  "mention",
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
  "contact_relationships",
  "crm_relationship_labels",
  "crm_groups",
  "crm_group_members",
  "crm_activities",
] as const;
export type PowerSyncTable = (typeof POWERSYNC_TABLES)[number];

/** Published to clients but not client-uploadable — see crm-sync.test.ts. */
export const POWERSYNC_DOWNLOAD_ONLY_TABLES = [
  "avatars",
  "mentions",
  "task_activities",
] as const;

export const POWERSYNC_OPS = ["PUT", "PATCH", "DELETE"] as const;
export type PowerSyncOp = (typeof POWERSYNC_OPS)[number];
