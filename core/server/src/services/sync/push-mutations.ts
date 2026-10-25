import { and, eq } from "drizzle-orm";

import type { SyncMutation } from "./types.js";
import { db } from "../../db/index.js";
import { mutationReceipts } from "../../db/schema.js";
import type { HabitTaskSyncChange } from "../habits.js";
import { applySyncChange } from "./apply-sync-change.js";
import { recordSyncEvent } from "./rest-sync-events.js";
import {
  appendHabitDerivedTaskSyncEvents,
  appendMeetingDerivedCrmActivitySyncEvents,
} from "./derived-events.js";
import { maxCursor } from "./bootstrap-pull.js";
import { SYNC_SCHEMA_VERSION } from "../../lib/sync-constants.js";
export async function pushSyncMutations(input: {
  workspaceId: string;
  deviceId: string;
  mutations: SyncMutation[];
}) {
  const acceptedMutationIds: string[] = [];

  const { shouldForwardMutationsToLeader, commitMutationsLeaderFirst } =
    await import("../core-replication/leader-mutations.js");

  for (const mutation of input.mutations) {
    if (shouldForwardMutationsToLeader()) {
      const changes = mutation.changes.map((change) => ({
        entity: change.entity,
        entityId: change.entity_id,
        operation: change.operation,
        payload: change.payload,
        eventMutationId: `${mutation.id}:${change.entity}:${change.entity_id}`,
      }));
      await commitMutationsLeaderFirst({
        workspaceId: input.workspaceId,
        mutationId: mutation.id,
        deviceId: input.deviceId,
        changes,
      });
      acceptedMutationIds.push(mutation.id);
      continue;
    }

    await db.transaction(async (tx) => {
      const [receipt] = await tx
        .insert(mutationReceipts)
        .values({
          workspaceId: input.workspaceId,
          mutationId: mutation.id,
          deviceId: input.deviceId,
        })
        .onConflictDoNothing()
        .returning({ mutationId: mutationReceipts.mutationId });

      if (!receipt) {
        return;
      }

      for (const change of mutation.changes) {
        const eventMutationId = `${mutation.id}:${change.entity}:${change.entity_id}`;
        const habitTaskChangesOut: HabitTaskSyncChange[] = [];
        await applySyncChange(input.workspaceId, change, tx, {
          habitTaskChangesOut,
        });
        await recordSyncEvent({
          workspaceId: input.workspaceId,
          mutationId: eventMutationId,
          deviceId: input.deviceId,
          entity: change.entity,
          entityId: change.entity_id,
          operation: change.operation,
          payload: change.payload,
        }, tx);
        if (change.entity === "meeting") {
          await appendMeetingDerivedCrmActivitySyncEvents(
            input.workspaceId,
            change.entity_id,
            eventMutationId,
            input.deviceId,
            tx,
          );
        }
        if (change.entity === "habit") {
          await appendHabitDerivedTaskSyncEvents(
            input.workspaceId,
            eventMutationId,
            input.deviceId,
            tx,
            habitTaskChangesOut,
          );
        }
      }

      await tx
        .update(mutationReceipts)
        .set({ result: { accepted: true } })
        .where(
          and(
            eq(mutationReceipts.workspaceId, input.workspaceId),
            eq(mutationReceipts.mutationId, mutation.id),
          ),
        );
      });
    acceptedMutationIds.push(mutation.id);
  }

  const lastSyncId = await maxCursor(input.workspaceId);
  return {
    schema_version: SYNC_SCHEMA_VERSION,
    cursor: lastSyncId,
    last_sync_id: lastSyncId,
    accepted_mutation_ids: acceptedMutationIds,
  };
}
