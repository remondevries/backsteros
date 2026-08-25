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
  /** True when the table may be absent on older local cores. */
  optional?: boolean;
};

const TABLE_SPECS: TableSpec[] = [
  {
    name: "workspaces",
    pk: ["id"],
    updatedAtColumn: "updated_at",
  },
  {
    name: "workspace_settings",
    pk: ["workspace_id"],
    updatedAtColumn: "updated_at",
  },
  {
    name: "entity_counters",
    pk: ["workspace_id", "entity", "scope_id"],
    updatedAtColumn: "updated_at",
  },
  {
    name: "api_keys",
    pk: ["id"],
    updatedAtColumn: "updated_at",
  },
  {
    name: "meeting_scheduling_settings",
    pk: ["workspace_id"],
    updatedAtColumn: "updated_at",
    optional: true,
  },
  {
    name: "meetings",
    pk: ["id"],
    updatedAtColumn: "updated_at",
    optional: true,
  },
  {
    name: "tasks",
    pk: ["id"],
    updatedAtColumn: "updated_at",
    whereSql: "legacy_source = 'calendar_busy'",
  },
];

const specByName = new Map<KnownTable, TableSpec>(
  TABLE_SPECS.map((spec) => [spec.name, spec]),
);

export function getTableSpec(table: KnownTable): TableSpec | null {
  return specByName.get(table) ?? null;
}

export function listReplicatedTableSpecs(): TableSpec[] {
  return REPLICATED_TABLES.map((name) => specByName.get(name)!);
}

export function listBootstrapTableSpecs(): TableSpec[] {
  return BOOTSTRAP_TABLES.map((name) => specByName.get(name)!);
}

export function rowIdFromPk(row: Record<string, unknown>, pk: readonly string[]): string {
  return pk.map((col) => String(row[col] ?? "")).join("\0");
}

export function isReplicatedTableName(name: string): name is ReplicatedTable {
  return (REPLICATED_TABLES as readonly string[]).includes(name);
}

export function isBootstrapTableName(name: string): name is BootstrapTable {
  return (BOOTSTRAP_TABLES as readonly string[]).includes(name);
}
