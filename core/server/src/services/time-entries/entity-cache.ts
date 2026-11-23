import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../../db/index.js";
import { documents, meetings, tasks, timeEntries } from "../../db/schema.js";
import type { DbExecutor, TimeEntryEntityType } from "./types.js";

/** Sum non-deleted entry durations for an entity (open + closed). */
export async function sumEntityDurationSeconds(
  workspaceId: string,
  entityType: TimeEntryEntityType,
  entityId: string,
  executor: DbExecutor = db,
): Promise<number> {
  const [row] = await executor
    .select({
      total: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.entityType, entityType),
        eq(timeEntries.entityId, entityId),
        isNull(timeEntries.deletedAt),
      ),
    );
  const total = Number(row?.total ?? 0);
  return Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0;
}

function trackedMinutesFromSeconds(seconds: number | null): number | null {
  if (seconds == null || seconds < 60) return null;
  return Math.floor(seconds / 60);
}

/** Refresh denormalized entity `tracked_duration_seconds` from the ledger. */
export async function recomputeEntityTrackedDurationCache(
  workspaceId: string,
  entityType: TimeEntryEntityType,
  entityId: string,
  executor: DbExecutor = db,
  now: Date = new Date(),
): Promise<number | null> {
  const total = await sumEntityDurationSeconds(
    workspaceId,
    entityType,
    entityId,
    executor,
  );
  const trackedDurationSeconds = total > 0 ? total : null;
  const trackedMinutes = trackedMinutesFromSeconds(trackedDurationSeconds);

  if (entityType === "task") {
    await executor
      .update(tasks)
      .set({
        trackedDurationSeconds,
        trackedMinutes,
        updatedAt: now,
      })
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          eq(tasks.id, entityId),
          isNull(tasks.deletedAt),
        ),
      );
  } else if (entityType === "meeting") {
    await executor
      .update(meetings)
      .set({
        trackedDurationSeconds,
        trackedMinutes,
        updatedAt: now,
      })
      .where(
        and(
          eq(meetings.workspaceId, workspaceId),
          eq(meetings.id, entityId),
          isNull(meetings.deletedAt),
        ),
      );
  } else if (entityType === "document") {
    await executor
      .update(documents)
      .set({
        trackedDurationSeconds,
        trackedMinutes,
        lastTrackedAt: trackedDurationSeconds != null ? now : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(documents.workspaceId, workspaceId),
          eq(documents.id, entityId),
          isNull(documents.deletedAt),
        ),
      );
  }

  return trackedDurationSeconds;
}
