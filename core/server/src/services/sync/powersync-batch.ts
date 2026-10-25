import { and, eq } from "drizzle-orm";

import type { PowerSyncOp, SyncEntity, SyncOperation } from "../../lib/sync-constants.js";
import { db } from "../../db/index.js";
import { mutationReceipts } from "../../db/schema.js";
import type { SyncChange } from "./types.js";
import type { HabitTaskSyncChange } from "../habits.js";
import { applySyncChange } from "./apply-sync-change.js";
import { recordSyncEvent } from "./rest-sync-events.js";
import {
  appendHabitDerivedTaskSyncEvents,
  appendMeetingDerivedCrmActivitySyncEvents,
} from "./derived-events.js";
import { POWERSYNC_SKIPPABLE_ERRORS } from "./payload-mappers.js";
function mapPowerSyncTable(table: string): SyncEntity | null {
  switch (table) {
    case "projects":
      return "project";
    case "tasks":
      return "task";
    case "documents":
      return "document";
    case "areas":
      return "area";
    case "organizations":
      return "organization";
    case "contacts":
      return "contact";
    case "letters":
      return "letter";
    case "workspace_settings":
      return "workspace_setting";
    case "bank_accounts":
      return "bank_account";
    case "financial_categories":
      return "financial_category";
    case "financial_goals":
      return "financial_goal";
    case "financial_recurrings":
      return "financial_recurring";
    case "cashflow_planner_entries":
      return "cashflow_planner_entry";
    case "habits":
      return "habit";
    case "meetings":
      return "meeting";
    case "task_comments":
      return "task_comment";
    case "contact_relationships":
      return "contact_relationship";
    case "crm_relationship_labels":
      return "crm_relationship_label";
    case "crm_groups":
      return "crm_group";
    case "crm_group_members":
      return "crm_group_member";
    case "crm_activities":
      return "crm_activity";
    case "task_labels":
      return "task_label";
    default:
      return null;
  }
}

function mapPowerSyncOp(op: PowerSyncOp): SyncOperation {
  if (op === "DELETE") return "delete";
  if (op === "PUT") return "upsert";
  return "patch";
}

export async function applyPowerSyncBatch(input: {
  workspaceId: string;
  deviceId: string;
  mutationId: string;
  batch: Array<{
    table: string;
    op: PowerSyncOp;
    id: string;
    data?: Record<string, unknown>;
  }>;
}) {
  const { shouldForwardMutationsToLeader, commitMutationsLeaderFirst } =
    await import("../core-replication/leader-mutations.js");

  const changes: Array<{
    entity: SyncEntity;
    entityId: string;
    operation: SyncOperation;
    payload: Record<string, unknown>;
    eventMutationId: string;
  }> = [];

  for (const [index, entry] of input.batch.entries()) {
    const entity = mapPowerSyncTable(entry.table);
    if (!entity) continue;
    const operation = mapPowerSyncOp(entry.op);
    const payload = entry.data ?? {};
    changes.push({
      entity,
      entityId: entry.id,
      operation: operation === "patch" ? "upsert" : operation,
      payload: operation === "delete" ? payload : { ...payload, id: entry.id },
      eventMutationId: `${input.mutationId}:${index}`,
    });
  }

  if (shouldForwardMutationsToLeader()) {
    const claimReceipt = async () => {
      const [parentReceipt] = await db
        .insert(mutationReceipts)
        .values({
          workspaceId: input.workspaceId,
          mutationId: input.mutationId,
          deviceId: input.deviceId,
          result: { accepted: false, source: "powersync_leader_first_pending" },
        })
        .onConflictDoNothing()
        .returning({ mutationId: mutationReceipts.mutationId });
      return parentReceipt ?? null;
    };

    let parentReceipt = await claimReceipt();
    if (!parentReceipt) {
      const [existing] = await db
        .select({
          mutationId: mutationReceipts.mutationId,
          result: mutationReceipts.result,
        })
        .from(mutationReceipts)
        .where(
          and(
            eq(mutationReceipts.workspaceId, input.workspaceId),
            eq(mutationReceipts.mutationId, input.mutationId),
          ),
        )
        .limit(1);
      const accepted =
        existing?.result &&
        typeof existing.result === "object" &&
        (existing.result as { accepted?: unknown }).accepted === true;
      if (accepted) {
        return { ok: true as const, duplicate: true };
      }
      // Prior attempt claimed the id but never finished applying — drop the
      // claim so PowerSync can retry without a silent ACK-and-wipe.
      await db
        .delete(mutationReceipts)
        .where(
          and(
            eq(mutationReceipts.workspaceId, input.workspaceId),
            eq(mutationReceipts.mutationId, input.mutationId),
          ),
        );
      parentReceipt = await claimReceipt();
      if (!parentReceipt) {
        const [raced] = await db
          .select({ result: mutationReceipts.result })
          .from(mutationReceipts)
          .where(
            and(
              eq(mutationReceipts.workspaceId, input.workspaceId),
              eq(mutationReceipts.mutationId, input.mutationId),
            ),
          )
          .limit(1);
        if (
          raced?.result &&
          typeof raced.result === "object" &&
          (raced.result as { accepted?: unknown }).accepted === true
        ) {
          return { ok: true as const, duplicate: true };
        }
        throw new Error("POWERSYNC_MUTATION_CLAIM_RACE");
      }
    }

    try {
      const leaderResult = await commitMutationsLeaderFirst({
        workspaceId: input.workspaceId,
        mutationId: input.mutationId,
        deviceId: input.deviceId,
        changes,
      });
      await db
        .update(mutationReceipts)
        .set({ result: { accepted: true, source: "powersync_leader_first" } })
        .where(
          and(
            eq(mutationReceipts.workspaceId, input.workspaceId),
            eq(mutationReceipts.mutationId, input.mutationId),
          ),
        );
      // local_fallback already pushed tables + nudged inside commitMutationsLeaderFirst.
      if (leaderResult.source !== "local_fallback" && changes[0]) {
        const { notifyPeerOfEntityWrite } = await import(
          "../core-replication/nudge.js"
        );
        const { publishWorkspaceUpdatedFromSyncEvent } = await import(
          "../core-replication/sync-event-live-publish.js"
        );
        const first = changes[0];
        const taskIdFromPayload =
          typeof first.payload.task_id === "string"
            ? first.payload.task_id
            : typeof first.payload.taskId === "string"
              ? first.payload.taskId
              : null;
        // Wake open shells on this core (desktop) before the peer round-trip.
        publishWorkspaceUpdatedFromSyncEvent(input.workspaceId, {
          entity: first.entity,
          entityId: first.entityId,
          operation: first.operation,
          payload: first.payload,
        });
        notifyPeerOfEntityWrite({
          workspaceId: input.workspaceId,
          reason: "powersync",
          entity: first.entity,
          entityId: first.entityId,
          taskId: taskIdFromPayload,
          operation: first.operation === "delete" ? "delete" : "upsert",
        });
      }
      return { ok: true as const, duplicate: false };
    } catch (error) {
      await db
        .delete(mutationReceipts)
        .where(
          and(
            eq(mutationReceipts.workspaceId, input.workspaceId),
            eq(mutationReceipts.mutationId, input.mutationId),
          ),
        );
      throw error;
    }
  }

  let duplicate = false;
  await db.transaction(async (tx) => {
    const [receipt] = await tx
      .insert(mutationReceipts)
      .values({
        workspaceId: input.workspaceId,
        mutationId: input.mutationId,
        deviceId: input.deviceId,
      })
      .onConflictDoNothing()
      .returning({ mutationId: mutationReceipts.mutationId });
    if (!receipt) {
      duplicate = true;
      return;
    }

    for (const [index, entry] of input.batch.entries()) {
      const entity = mapPowerSyncTable(entry.table);
      if (!entity) continue;
      const operation = mapPowerSyncOp(entry.op);
      let payload = entry.data ?? {};
      // Never accept portal password hashes from the PowerSync client — REST
      // `portalPassword` is the only write path for credentials.
      if (
        entity === "contact" &&
        operation !== "delete" &&
        payload &&
        ("portal_password_hash" in payload || "portalPasswordHash" in payload)
      ) {
        const {
          portal_password_hash: _snakeHash,
          portalPasswordHash: _camelHash,
          ...rest
        } = payload as Record<string, unknown>;
        payload = rest;
      }
      const change: SyncChange = {
        entity,
        entity_id: entry.id,
        operation,
        payload: operation === "delete" ? payload : { ...payload, id: entry.id },
        updated_at: Date.now(),
      };
      try {
        const habitTaskChangesOut: HabitTaskSyncChange[] = [];
        await applySyncChange(input.workspaceId, change, tx, {
          habitTaskChangesOut,
        });
        const eventMutationId = `${input.mutationId}:${index}`;
        await recordSyncEvent({
          workspaceId: input.workspaceId,
          mutationId: eventMutationId,
          deviceId: input.deviceId,
          entity,
          entityId: entry.id,
          operation: operation === "patch" ? "upsert" : operation,
          payload: change.payload,
        }, tx);
        if (entity === "meeting") {
          await appendMeetingDerivedCrmActivitySyncEvents(
            input.workspaceId,
            entry.id,
            eventMutationId,
            input.deviceId,
            tx,
          );
        }
        if (entity === "habit") {
          await appendHabitDerivedTaskSyncEvents(
            input.workspaceId,
            eventMutationId,
            input.deviceId,
            tx,
            habitTaskChangesOut,
          );
        }
        continue;
      } catch (error) {
        // PowerSync retries 4xx/5xx forever — skip permanent validation failures.
        if (
          error instanceof Error &&
          POWERSYNC_SKIPPABLE_ERRORS.has(error.message)
        ) {
          console.warn(
            `[powersync] skipping ${entry.op} ${entry.table}/${entry.id}: ${error.message}`,
          );
          const { appendOpsLog } = await import("../../lib/ops-log-buffer.js");
          appendOpsLog(
            "warn",
            "powersync skipped permanent validation error",
            `${entry.op} ${entry.table}/${entry.id}: ${error.message}`,
          );
          continue;
        }
        throw error;
      }
    }
    await tx
      .update(mutationReceipts)
      .set({ result: { accepted: true } })
      .where(and(
        eq(mutationReceipts.workspaceId, input.workspaceId),
        eq(mutationReceipts.mutationId, input.mutationId),
      ));
  });

  return { ok: true as const, duplicate };
}
