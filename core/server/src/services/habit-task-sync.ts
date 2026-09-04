import type { HabitTaskSyncChange } from "./habits.js";
import {
  commitRestEntityWriteBatch,
  isRestLeaderFirstWrite,
} from "./rest-leader-write.js";

/** Push habit-derived task mutations into the unified sync pipeline. */
export async function emitHabitTaskSyncChanges(
  workspaceId: string,
  changes: HabitTaskSyncChange[],
): Promise<void> {
  if (changes.length === 0) return;

  const deduped = new Map<string, HabitTaskSyncChange>();
  for (const change of changes) {
    deduped.set(change.task.id, change);
  }
  const unique = [...deduped.values()];

  const { recordTaskRestSyncEvent, taskRowToSyncPayload } = await import(
    "./sync.js"
  );

  if (isRestLeaderFirstWrite()) {
    await commitRestEntityWriteBatch({
      workspaceId,
      changes: unique.map((change) => ({
        entity: "task" as const,
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
      })),
    });
    return;
  }

  for (const change of unique) {
    await recordTaskRestSyncEvent(
      workspaceId,
      change.task,
      change.operation,
    );
  }
}
