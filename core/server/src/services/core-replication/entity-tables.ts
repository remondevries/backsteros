import type { SyncEntity } from "../../lib/sync-constants.js";
import type { ReplicatedTable } from "./constants.js";

/**
 * Map sync_event / nudge entity names → table-twin tables to push/pull
 * immediately after a write (not only on the periodic tick).
 */
const ENTITY_REPLICATION_TABLES: Partial<
  Record<SyncEntity | string, readonly ReplicatedTable[]>
> = {
  project: ["projects"],
  project_update: ["project_updates"],
  task: ["tasks"],
  task_label: ["task_labels"],
  document: ["documents"],
  area: ["areas"],
  organization: ["organizations", "avatars"],
  contact: ["contacts", "avatars"],
  letter: ["letters", "letter_attachments"],
  workspace_setting: ["workspace_settings"],
  bank_account: ["bank_accounts", "avatars"],
  financial_category: ["financial_categories"],
  financial_goal: ["financial_goals"],
  financial_recurring: ["financial_recurrings"],
  cashflow_planner_entry: ["cashflow_planner_entries"],
  financial_transaction: ["financial_transactions"],
  habit: ["habits", "tasks"],
  meeting: ["meetings", "crm_activities"],
  task_comment: ["task_comments", "task_activities"],
  contact_relationship: ["contact_relationships"],
  crm_relationship_label: ["crm_relationship_labels"],
  crm_group: ["crm_groups"],
  crm_group_member: ["crm_group_members"],
  crm_activity: ["crm_activities"],
  task_activity: ["task_activities"],
  email_thread: ["email_threads"],
  email_thread_comment: ["email_thread_comments"],
  recurring_task: ["recurring_tasks"],
  mention: ["mentions"],
  /** Avatar blob metadata (contact / org / bank account chrome). */
  avatar: ["avatars"],
  /** API keys minted/revoked on either core must twin immediately. */
  api_key: ["api_keys"],
  space_publish_setting: ["space_publish_settings"],
  space_site_key: ["space_site_keys"],
};

export function replicatedTablesForEntity(
  entity: string | null | undefined,
): ReplicatedTable[] {
  const key = entity?.trim();
  if (!key) return [];
  return [...(ENTITY_REPLICATION_TABLES[key] ?? [])];
}

export function replicatedTablesForEntities(
  entities: Iterable<string | null | undefined>,
): ReplicatedTable[] {
  const out = new Set<ReplicatedTable>();
  for (const entity of entities) {
    for (const table of replicatedTablesForEntity(entity)) {
      out.add(table);
    }
  }
  return [...out];
}
