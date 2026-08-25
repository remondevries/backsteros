import type { BootstrapTable, ReplicatedTable } from "./constants.js";
import {
  BOOTSTRAP_TABLES,
  REPLICATED_TABLES,
} from "./constants.js";

export type KnownTable = ReplicatedTable | BootstrapTable;

export type TableSpec = {
  /** Postgres table name. */
  name: KnownTable;
  /** Primary key column(s) in snake_case. */
  pk: readonly string[];
  /** Column used for change ordering (snake_case). */
  updatedAtColumn: string;
  /** Optional SQL WHERE fragment (without WHERE). */
  whereSql?: string;
  /** True when the table may be absent on older peers. */
  optional?: boolean;
};

function spec(
  name: KnownTable,
  pk: readonly string[],
  updatedAtColumn = "updated_at",
  extra?: Partial<Pick<TableSpec, "whereSql" | "optional">>,
): TableSpec {
  return { name, pk, updatedAtColumn, ...extra };
}

/**
 * Specs for every replicated table. Order matches BOOTSTRAP_TABLES / FK parents.
 */
const TABLE_SPECS: TableSpec[] = [
  spec("users", ["id"], "created_at"),
  spec("workspaces", ["id"]),
  spec("workspace_members", ["workspace_id", "user_id"], "created_at"),
  spec("workspace_settings", ["workspace_id"]),
  spec("workspace_integration_secrets", ["workspace_id"]),
  spec("areas", ["id"]),
  spec("organizations", ["id"]),
  spec("contacts", ["id"]),
  spec("projects", ["id"]),
  spec("habits", ["id"]),
  spec("bank_accounts", ["id"]),
  spec("financial_categories", ["id"]),
  spec("financial_goals", ["id"]),
  spec("financial_recurrings", ["id"]),
  spec("cashflow_planner_entries", ["id"], "updated_at", { optional: true }),
  spec("tasks", ["id"]),
  spec("documents", ["id"]),
  spec("letters", ["id"]),
  spec("letter_attachments", ["id"], "updated_at", { optional: true }),
  spec("meetings", ["id"], "updated_at", { optional: true }),
  spec("meeting_scheduling_settings", ["workspace_id"], "updated_at", {
    optional: true,
  }),
  spec("avatars", ["id"]),
  spec("mentions", ["id"], "created_at"),
  spec("email_threads", ["id"], "updated_at", { optional: true }),
  spec("email_thread_comments", ["id"], "updated_at", { optional: true }),
  spec("task_comments", ["id"]),
  spec("task_activities", ["id"], "created_at"),
  spec("recurring_tasks", ["id"], "updated_at", { optional: true }),
  spec("device_push_tokens", ["id"], "updated_at", { optional: true }),
  spec("entity_counters", ["workspace_id", "entity", "scope_id"]),
  spec("api_keys", ["id"]),
  spec("financial_transactions", ["id"]),
];

const specByName = new Map<KnownTable, TableSpec>(
  TABLE_SPECS.map((entry) => [entry.name, entry]),
);

export function getTableSpec(table: KnownTable): TableSpec | null {
  return specByName.get(table) ?? null;
}

export function listReplicatedTableSpecs(): TableSpec[] {
  return REPLICATED_TABLES.map((name) => {
    const found = specByName.get(name);
    if (!found) {
      throw new Error(`missing TableSpec for replicated table ${name}`);
    }
    return found;
  });
}

export function listBootstrapTableSpecs(): TableSpec[] {
  return BOOTSTRAP_TABLES.map((name) => {
    const found = specByName.get(name);
    if (!found) {
      throw new Error(`missing TableSpec for bootstrap table ${name}`);
    }
    return found;
  });
}

export function rowIdFromPk(
  row: Record<string, unknown>,
  pk: readonly string[],
): string {
  return pk.map((col) => String(row[col] ?? "")).join("|");
}

export function isReplicatedTableName(name: string): name is ReplicatedTable {
  return (REPLICATED_TABLES as readonly string[]).includes(name);
}

export function isBootstrapTableName(name: string): name is BootstrapTable {
  return (BOOTSTRAP_TABLES as readonly string[]).includes(name);
}
