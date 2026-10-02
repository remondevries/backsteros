-- Tip watermarks for /internal/core-replication/sync-state
-- (ORDER BY tip_col DESC, pk DESC). IF NOT EXISTS / guarded for optional tables.

CREATE INDEX IF NOT EXISTS "users_replication_tip_idx" ON "users" ("created_at", "id");
CREATE INDEX IF NOT EXISTS "workspaces_replication_tip_idx" ON "workspaces" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "workspace_members_replication_tip_idx" ON "workspace_members" ("created_at", "workspace_id", "user_id");
CREATE INDEX IF NOT EXISTS "workspace_settings_replication_tip_idx" ON "workspace_settings" ("updated_at", "workspace_id");
CREATE INDEX IF NOT EXISTS "workspace_integration_secrets_replication_tip_idx" ON "workspace_integration_secrets" ("updated_at", "workspace_id");
CREATE INDEX IF NOT EXISTS "areas_replication_tip_idx" ON "areas" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "organizations_replication_tip_idx" ON "organizations" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "contacts_replication_tip_idx" ON "contacts" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "contact_relationships_replication_tip_idx" ON "contact_relationships" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "crm_relationship_labels_replication_tip_idx" ON "crm_relationship_labels" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "crm_groups_replication_tip_idx" ON "crm_groups" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "crm_group_members_replication_tip_idx" ON "crm_group_members" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "crm_activities_replication_tip_idx" ON "crm_activities" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "projects_replication_tip_idx" ON "projects" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "habits_replication_tip_idx" ON "habits" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "bank_accounts_replication_tip_idx" ON "bank_accounts" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "financial_categories_replication_tip_idx" ON "financial_categories" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "financial_goals_replication_tip_idx" ON "financial_goals" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "financial_recurrings_replication_tip_idx" ON "financial_recurrings" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "tasks_replication_tip_idx" ON "tasks" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "task_labels_replication_tip_idx" ON "task_labels" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "documents_replication_tip_idx" ON "documents" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "letters_replication_tip_idx" ON "letters" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "avatars_replication_tip_idx" ON "avatars" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "mentions_replication_tip_idx" ON "mentions" ("created_at", "id");
CREATE INDEX IF NOT EXISTS "task_comments_replication_tip_idx" ON "task_comments" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "task_activities_replication_tip_idx" ON "task_activities" ("created_at", "id");
CREATE INDEX IF NOT EXISTS "entity_counters_replication_tip_idx" ON "entity_counters" ("updated_at", "workspace_id", "entity", "scope_id");
CREATE INDEX IF NOT EXISTS "api_keys_replication_tip_idx" ON "api_keys" ("updated_at", "id");
CREATE INDEX IF NOT EXISTS "financial_transactions_replication_tip_idx" ON "financial_transactions" ("updated_at", "id");

DO $$ BEGIN
  IF to_regclass('public.project_updates') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "project_updates_replication_tip_idx" ON "project_updates" ("updated_at", "id");
  END IF;
  IF to_regclass('public.cashflow_planner_entries') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "cashflow_planner_entries_replication_tip_idx" ON "cashflow_planner_entries" ("updated_at", "id");
  END IF;
  IF to_regclass('public.space_publish_settings') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "space_publish_settings_replication_tip_idx" ON "space_publish_settings" ("updated_at", "id");
  END IF;
  IF to_regclass('public.space_site_keys') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "space_site_keys_replication_tip_idx" ON "space_site_keys" ("updated_at", "id");
  END IF;
  IF to_regclass('public.letter_attachments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "letter_attachments_replication_tip_idx" ON "letter_attachments" ("updated_at", "id");
  END IF;
  IF to_regclass('public.task_attachments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "task_attachments_replication_tip_idx" ON "task_attachments" ("updated_at", "id");
  END IF;
  IF to_regclass('public.meetings') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "meetings_replication_tip_idx" ON "meetings" ("updated_at", "id");
  END IF;
  IF to_regclass('public.meeting_scheduling_settings') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "meeting_scheduling_settings_replication_tip_idx" ON "meeting_scheduling_settings" ("updated_at", "workspace_id");
  END IF;
  IF to_regclass('public.email_threads') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "email_threads_replication_tip_idx" ON "email_threads" ("updated_at", "id");
  END IF;
  IF to_regclass('public.email_thread_comments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "email_thread_comments_replication_tip_idx" ON "email_thread_comments" ("updated_at", "id");
  END IF;
  IF to_regclass('public.recurring_tasks') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "recurring_tasks_replication_tip_idx" ON "recurring_tasks" ("updated_at", "id");
  END IF;
  IF to_regclass('public.device_push_tokens') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "device_push_tokens_replication_tip_idx" ON "device_push_tokens" ("updated_at", "id");
  END IF;
END $$;
