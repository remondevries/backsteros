import type { CoreReplicationRole } from "./config.js";
import type { ReplicatedTable } from "./constants.js";
import { CALENDAR_BUSY_TASK_LEGACY_SOURCE } from "./constants.js";

export type ConflictDecision = "apply" | "skip";

/**
 * Tie-break when both cores changed the same row at the same timestamp.
 * - meeting_scheduling_settings / workspace_settings: local-core wins
 * - meetings: cloud-core wins (portal bookings)
 * - everything else: accept incoming (last-writer via updated_at already tied)
 */
export function preferIncomingOnConflict(
  table: ReplicatedTable,
  localRole: CoreReplicationRole,
): boolean {
  if (
    table === "meeting_scheduling_settings" ||
    table === "workspace_settings"
  ) {
    return localRole === "cloud";
  }
  if (table === "meetings") {
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

/** @deprecated Busy-only filter removed; kept for tests / legacy callers. */
export function calendarBusyTaskFilterSql(): string {
  return `legacy_source = '${CALENDAR_BUSY_TASK_LEGACY_SOURCE}'`;
}

export function isCalendarBusyTaskRow(row: Record<string, unknown>): boolean {
  return row.legacy_source === CALENDAR_BUSY_TASK_LEGACY_SOURCE;
}
