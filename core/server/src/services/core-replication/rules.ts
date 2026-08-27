import type { CoreReplicationRole } from "./config.js";
import type { ReplicatedTable } from "./constants.js";
import { CALENDAR_BUSY_TASK_LEGACY_SOURCE } from "./constants.js";

export type ConflictDecision = "apply" | "skip";

export type DocumentContentMeta = {
  byteSize: number;
  contentVersion: number;
};

/**
 * Tie-break when both cores changed the same row at the same timestamp.
 * - meeting_scheduling_settings / workspace_settings: local-core wins
 * - meetings: cloud-core wins (portal bookings)
 * - documents: prefer higher content_version (see shouldApplyDocumentRow)
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

/**
 * Documents: never let empty metadata clobber a non-empty body proof, even if
 * remote updated_at is newer. On equal timestamps prefer higher content_version.
 */
export function shouldApplyDocumentRow(
  localRole: CoreReplicationRole,
  remoteUpdatedAt: Date,
  localUpdatedAt: Date | null,
  remote: DocumentContentMeta,
  local: DocumentContentMeta | null,
): ConflictDecision {
  if (local && remote.byteSize === 0 && local.byteSize > 0) {
    return "skip";
  }
  if (local && remote.byteSize > 0 && local.byteSize === 0) {
    return "apply";
  }

  if (
    local &&
    localUpdatedAt &&
    remoteUpdatedAt.getTime() === localUpdatedAt.getTime()
  ) {
    if (remote.contentVersion > local.contentVersion) return "apply";
    if (remote.contentVersion < local.contentVersion) return "skip";
  }

  return shouldApplyByUpdatedAt(
    "documents",
    localRole,
    remoteUpdatedAt,
    localUpdatedAt,
  );
}

function asNonNegInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function documentContentMetaFromRow(
  row: Record<string, unknown>,
): DocumentContentMeta {
  return {
    byteSize: asNonNegInt(row.byte_size ?? row.byteSize),
    contentVersion: asNonNegInt(row.content_version ?? row.contentVersion),
  };
}

/** @deprecated Busy-only filter removed; kept for tests / legacy callers. */
export function calendarBusyTaskFilterSql(): string {
  return `legacy_source = '${CALENDAR_BUSY_TASK_LEGACY_SOURCE}'`;
}

export function isCalendarBusyTaskRow(row: Record<string, unknown>): boolean {
  return row.legacy_source === CALENDAR_BUSY_TASK_LEGACY_SOURCE;
}
