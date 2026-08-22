/**
 * Canonical PowerSync publication / sync-rule tables (Tier A/B metadata).
 * Keep in sync with deploy/powersync/sync-config.yaml streams.
 * Do not add Tier C/D blob tables (PDF bytes, markdown bodies).
 */
export const POWERSYNC_PUBLICATION_TABLES = [
  "projects",
  "tasks",
  "documents",
  "organizations",
  "contacts",
  "areas",
  "letters",
  "avatars",
  "mentions",
  "workspace_settings",
  "bank_accounts",
  "financial_categories",
  "financial_goals",
  "financial_recurrings",
  "habits",
  "meetings",
] as const;

export type PowerSyncPublicationTable =
  (typeof POWERSYNC_PUBLICATION_TABLES)[number];
