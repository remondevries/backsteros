import type { CoreReplicationRole } from "./config.js";
import type { ReplicatedTable } from "./constants.js";
import { CALENDAR_BUSY_TASK_LEGACY_SOURCE } from "./constants.js";

export type ConflictDecision = "apply" | "skip";

/**
 * Tie-break when both cores changed the same row.
 * - meeting_scheduling_settings: local-core wins (settings edited on laptop)
 * - meetings + calendar-busy tasks: cloud-core wins (portal / calendar source)
 * - api_keys: last-write-wins (caller compares updated_at)
 */
export function preferIncomingOnConflict(
  table: ReplicatedTable,
  localRole: CoreReplicationRole,
): boolean {
  if (table === "meeting_scheduling_settings") {
    return localRole === "cloud";
  }
  if (table === "meetings" || table === "tasks") {
    return localRole === "local";
  }
  return true;
}

export function shouldApplyByUpdatedAt(
  table: ReplicatedTable,
  localRole: CoreReplicationRole,
  remoteUpdatedAt: Date,
  localUpdatedAt: Date | null,
): ConflictDecision {
  if (!localUpdatedAt || remoteUpdatedAt > localUpdatedAt) {
    return "apply";
  }
  if (remoteUpdatedAt < localUpdatedAt) {
    return "skip";
  }
  return preferIncomingOnConflict(table, localRole) ? "apply" : "skip";
}

/** SQL fragment appended to calendar-busy task replication queries. */
export function calendarBusyTaskFilterSql(): string {
  return `legacy_source = '${CALENDAR_BUSY_TASK_LEGACY_SOURCE}'`;
}

export function isCalendarBusyTaskRow(row: Record<string, unknown>): boolean {
  return row.legacy_source === CALENDAR_BUSY_TASK_LEGACY_SOURCE;
}
