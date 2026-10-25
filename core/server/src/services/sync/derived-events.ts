import * as crmActivitiesService from "../crm-activities.js";
import {
  recordCrmActivityRestSyncEvent,
  recordSyncEvent,
  taskRowToSyncPayload,
} from "./rest-sync-events.js";
import type { DbExecutor } from "./types.js";
import * as habitService from "../habits.js";
import type { HabitTaskSyncChange } from "../habits.js";
/** Meeting attendee/org feed rows are derived — also emit first-class crm_activity events. */
export async function recordMeetingDerivedCrmActivityRestSyncEvents(
  workspaceId: string,
  meetingId: string,
): Promise<void> {
  const rows = await crmActivitiesService.listCrmActivitiesForMeeting(
    workspaceId,
    meetingId,
  );
  for (const row of rows) {
    await recordCrmActivityRestSyncEvent(
      workspaceId,
      row,
      row.deletedAt ? "delete" : "upsert",
    );
  }
}

export async function appendMeetingDerivedCrmActivitySyncEvents(
  workspaceId: string,
  meetingId: string,
  parentMutationId: string,
  deviceId: string | undefined,
  executor: DbExecutor,
): Promise<void> {
  const rows = await crmActivitiesService.listCrmActivitiesForMeeting(
    workspaceId,
    meetingId,
    executor,
  );
  for (const row of rows) {
    await recordSyncEvent(
      {
        workspaceId,
        mutationId: `${parentMutationId}:crm_activity:${row.id}`,
        deviceId,
        entity: "crm_activity",
        entityId: row.id,
        operation: row.deletedAt ? "delete" : "upsert",
        payload: crmActivitiesService.crmActivityToSyncPayload(row),
      },
      executor,
    );
  }
}

function mergeHabitTaskSyncChanges(
  prior: HabitTaskSyncChange[],
  next: HabitTaskSyncChange[],
): HabitTaskSyncChange[] {
  const byId = new Map<string, HabitTaskSyncChange>();
  for (const change of prior) byId.set(change.task.id, change);
  for (const change of next) byId.set(change.task.id, change);
  return [...byId.values()];
}

/**
 * Emit task sync_events for habit side-effects.
 * `priorChanges` should include updateHabit rename/project moves; ensure covers creates.
 */
export async function appendHabitDerivedTaskSyncEvents(
  workspaceId: string,
  parentMutationId: string,
  deviceId: string | undefined,
  executor: DbExecutor,
  priorChanges: HabitTaskSyncChange[] = [],
): Promise<void> {
  const ensured = await habitService.ensureHabitTasksForDate(
    workspaceId,
    undefined,
    executor,
  );
  const changes = mergeHabitTaskSyncChanges(
    priorChanges,
    ensured.changedTasks,
  );
  for (const change of changes) {
    await recordSyncEvent(
      {
        workspaceId,
        mutationId: `${parentMutationId}:task:${change.task.id}`,
        deviceId,
        entity: "task",
        entityId: change.task.id,
        operation: change.operation,
        payload:
          change.operation === "delete"
            ? {
                id: change.task.id,
                deleted_at:
                  change.task.deletedAt?.toISOString() ??
                  new Date().toISOString(),
              }
            : taskRowToSyncPayload(change.task),
      },
      executor,
    );
  }
}

/** Shared merge for leader-mutation habit follow-ups. */
export function mergeHabitDerivedTaskChanges(
  prior: HabitTaskSyncChange[],
  ensured: HabitTaskSyncChange[],
): HabitTaskSyncChange[] {
  return mergeHabitTaskSyncChanges(prior, ensured);
}
