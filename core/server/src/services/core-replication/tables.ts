import type { ReplicatedTable } from "./constants.js";
import { REPLICATED_TABLES } from "./constants.js";

/** Tables with row handlers in this core build (schema may define more). */
const IMPLEMENTED_TABLES = new Set<ReplicatedTable>(["api_keys"]);

export function isImplementedReplicatedTable(
  table: ReplicatedTable,
): boolean {
  return IMPLEMENTED_TABLES.has(table);
}

export function listActiveReplicatedTables(): ReplicatedTable[] {
  return REPLICATED_TABLES.filter(isImplementedReplicatedTable);
}
