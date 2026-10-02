import { and, eq } from "drizzle-orm";

import { db } from "../../db/index.js";
import { mutationReceipts, syncEvents } from "../../db/schema.js";
import type { SyncEntity, SyncOperation } from "../../lib/sync-constants.js";
import { applySyncChange, isPowerSyncSkippableError, mergeHabitDerivedTaskChanges, type SyncChange } from "../sync.js";
import {
  crmActivityToSyncPayload,
  listCrmActivitiesForMeeting,
} from "../crm-activities.js";
import {
  ensureHabitTasksForDate,
  type HabitTaskSyncChange,
} from "../habits.js";
import {
  getDocumentById,
  hydrateLocalDocumentVaultContent,
  updateDocumentContent,
} from "../documents.js";
import {
  DocumentPropertyError,
  putDocumentProperties,
} from "../document-properties.js";
import {
  appendSyncEvent,
  getWorkspaceLastSyncId,
  type SyncEventRow,
} from "../sync-log.js";
import { appendOpsLog } from "../../lib/ops-log-buffer.js";
import { getCoreReplicationConfig } from "./config.js";
import {
  applyPeerSyncEvent,
} from "./sync-event-replication.js";
import {
  SYNC_ENTITIES,
  SYNC_OPERATIONS,
} from "../../lib/sync-constants.js";

/**
 * Match the core-replication worker page timeout (120s). Document content
 * forwards can include large markdown bodies; the previous 60s budget produced
 * AbortError under vault load (observed ~2 minutes wall-clock when queued
 * behind peer sync).
 */
const FORWARD_TIMEOUT_MS = 120_000;

export type LeaderMutationChange = {
  entity: SyncEntity;
  entityId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  /** Unique id for the sync_events / receipt row (defaults to parent:entity:id). */
  eventMutationId?: string;
};

export type LeaderMutationResult = {
  lastSyncId: number;
  events: SyncEventRow[];
  source: "leader" | "local_fallback";
};

function replicationHeaders(secret: string): HeadersInit {
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

function parseEntity(value: string): SyncEntity | null {
  return (SYNC_ENTITIES as readonly string[]).includes(value)
    ? (value as SyncEntity)
    : null;
}

function parseOperation(value: string): SyncOperation | null {
  return (SYNC_OPERATIONS as readonly string[]).includes(value)
    ? (value as SyncOperation)
    : null;
}

function toSyncChange(change: LeaderMutationChange): SyncChange {
  return {
    entity: change.entity,
    entity_id: change.entityId,
    operation: change.operation,
    payload: change.payload,
    updated_at: Date.now(),
  };
}

async function loadEventByMutationId(
  workspaceId: string,
  eventMutationId: string,
): Promise<SyncEventRow | null> {
  const [row] = await db
    .select()
    .from(syncEvents)
    .where(
      and(
        eq(syncEvents.workspaceId, workspaceId),
        eq(syncEvents.mutationId, eventMutationId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    cursor: row.cursor,
    mutationId: row.mutationId,
    deviceId: row.deviceId,
    entity: row.entity,
    entityId: row.entityId,
    operation: row.operation,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}

/**
 * Leader (cloud) accepts mutations: claim receipt → apply → append sync_events.
 * Idempotent on event_mutation_id.
 */
export async function acceptLeaderMutations(input: {
  workspaceId: string;
  mutationId: string;
  deviceId?: string;
  changes: LeaderMutationChange[];
}): Promise<LeaderMutationResult> {
  const deviceId = input.deviceId ?? "replica";
  const events: SyncEventRow[] = [];

  for (const change of input.changes) {
    const eventMutationId =
      change.eventMutationId ??
      `${input.mutationId}:${change.entity}:${change.entityId}`;

    const followUpMutationIds: string[] = [];

    await db.transaction(async (tx) => {
      const [receipt] = await tx
        .insert(mutationReceipts)
        .values({
          workspaceId: input.workspaceId,
          mutationId: eventMutationId,
          deviceId,
        })
        .onConflictDoNothing()
        .returning({ mutationId: mutationReceipts.mutationId });

      if (!receipt) {
        return;
      }

      const habitTaskChangesOut: HabitTaskSyncChange[] = [];
      try {
        await applySyncChange(input.workspaceId, toSyncChange(change), tx, {
          habitTaskChangesOut,
        });
      } catch (error) {
        // Same set as the local PowerSync apply path. A 500 makes the client
        // retry this CRUD row forever (stale label ids, missing assignee, …).
        if (!isPowerSyncSkippableError(error)) throw error;
        console.warn(
          `[powersync] skipping ${change.operation} ${change.entity}/${change.entityId}: ${error.message}`,
        );
        appendOpsLog(
          "warn",
          "powersync skipped permanent validation error",
          `${change.operation} ${change.entity}/${change.entityId}: ${error.message}`,
        );
        await tx
          .update(mutationReceipts)
          .set({
            result: {
              accepted: true,
              skipped: error.message,
              source: "leader_mutation",
              parent_mutation_id: input.mutationId,
            },
          })
          .where(
            and(
              eq(mutationReceipts.workspaceId, input.workspaceId),
              eq(mutationReceipts.mutationId, eventMutationId),
            ),
          );
        return;
      }
      await appendSyncEvent(
        {
          workspaceId: input.workspaceId,
          mutationId: eventMutationId,
          deviceId,
          entity: change.entity,
          entityId: change.entityId,
          operation: change.operation,
          payload: change.payload,
        },
        tx,
      );

      if (change.entity === "meeting") {
        const activityRows = await listCrmActivitiesForMeeting(
          input.workspaceId,
          change.entityId,
          tx,
        );
        for (const activity of activityRows) {
          const activityMutationId = `${eventMutationId}:crm_activity:${activity.id}`;
          const [activityReceipt] = await tx
            .insert(mutationReceipts)
            .values({
              workspaceId: input.workspaceId,
              mutationId: activityMutationId,
              deviceId,
            })
            .onConflictDoNothing()
            .returning({ mutationId: mutationReceipts.mutationId });
          if (!activityReceipt) continue;
          await appendSyncEvent(
            {
              workspaceId: input.workspaceId,
              mutationId: activityMutationId,
              deviceId,
              entity: "crm_activity",
              entityId: activity.id,
              operation: activity.deletedAt ? "delete" : "upsert",
              payload: crmActivityToSyncPayload(activity),
            },
            tx,
          );
          followUpMutationIds.push(activityMutationId);
        }
      }

      if (change.entity === "habit") {
        const { taskRowToSyncPayload } = await import("../sync.js");
        const ensured = await ensureHabitTasksForDate(
          input.workspaceId,
          undefined,
          tx,
        );
        const taskChanges = mergeHabitDerivedTaskChanges(
          habitTaskChangesOut,
          ensured.changedTasks,
        );
        for (const taskChange of taskChanges) {
          const taskMutationId = `${eventMutationId}:task:${taskChange.task.id}`;
          const [taskReceipt] = await tx
            .insert(mutationReceipts)
            .values({
              workspaceId: input.workspaceId,
              mutationId: taskMutationId,
              deviceId,
            })
            .onConflictDoNothing()
            .returning({ mutationId: mutationReceipts.mutationId });
          if (!taskReceipt) continue;
          await appendSyncEvent(
            {
              workspaceId: input.workspaceId,
              mutationId: taskMutationId,
              deviceId,
              entity: "task",
              entityId: taskChange.task.id,
              operation: taskChange.operation,
              payload:
                taskChange.operation === "delete"
                  ? {
                      id: taskChange.task.id,
                      deleted_at:
                        taskChange.task.deletedAt?.toISOString() ??
                        new Date().toISOString(),
                    }
                  : taskRowToSyncPayload(taskChange.task),
            },
            tx,
          );
          followUpMutationIds.push(taskMutationId);
        }
      }

      await tx
        .update(mutationReceipts)
        .set({
          result: {
            accepted: true,
            source: "leader_mutation",
            parent_mutation_id: input.mutationId,
          },
        })
        .where(
          and(
            eq(mutationReceipts.workspaceId, input.workspaceId),
            eq(mutationReceipts.mutationId, eventMutationId),
          ),
        );
    });

    const event = await loadEventByMutationId(
      input.workspaceId,
      eventMutationId,
    );
    if (event) {
      events.push(event);
    }
    for (const followUpId of followUpMutationIds) {
      const followUp = await loadEventByMutationId(
        input.workspaceId,
        followUpId,
      );
      if (followUp) events.push(followUp);
    }
  }

  await db
    .insert(mutationReceipts)
    .values({
      workspaceId: input.workspaceId,
      mutationId: input.mutationId,
      deviceId,
      result: { accepted: true, source: "leader_mutation_parent" },
    })
    .onConflictDoNothing();

  const lastSyncId = await getWorkspaceLastSyncId(input.workspaceId);
  return { lastSyncId, events, source: "leader" };
}

async function applyLeaderEventsLocally(
  workspaceId: string,
  events: SyncEventRow[],
): Promise<void> {
  // OS-49: do NOT advance the ordered sync-event pull cursor here. Leader-first
  // responses can jump the serial clock past unapplied (or failed) events in
  // the peer feed; only pullWorkspaceSyncEvents may move the cursor after each
  // successfully handled event in order. Receipts make re-apply a no-op.
  for (const event of events) {
    await applyPeerSyncEvent(workspaceId, event);
  }
  // Open desktop shells on this core need SSE before PowerSync download —
  // same as cloud acceptLeaderMutations and handleReplicationNudge.
  if (events.length > 0) {
    const { publishWorkspaceUpdatedFromSyncEvent } = await import(
      "./sync-event-live-publish.js"
    );
    for (const event of events) {
      publishWorkspaceUpdatedFromSyncEvent(workspaceId, event);
    }
  }
}

/**
 * Local-core only: forward to cloud leader, then apply returned ordered events
 * without appending local sync_events (cloud cursor is authority).
 * On forward failure: accept on this core as temporary clock.
 */
export async function commitMutationsLeaderFirst(input: {
  workspaceId: string;
  mutationId: string;
  deviceId?: string;
  changes: LeaderMutationChange[];
}): Promise<LeaderMutationResult> {
  if (input.changes.length === 0) {
    return {
      lastSyncId: await getWorkspaceLastSyncId(input.workspaceId),
      events: [],
      source: "local_fallback",
    };
  }

  if (!shouldForwardMutationsToLeader()) {
    throw new Error("commitMutationsLeaderFirst requires CORE_REPLICATION_ROLE=local");
  }

  try {
    const forwarded = await forwardMutationsToLeader(input);
    await applyLeaderEventsLocally(input.workspaceId, forwarded.events);
    return forwarded;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[leader-first] forward failed (${message}); falling back to local clock`,
    );
    // Local apply+append — do not applyPeer again (already applied in accept).
    const fallback = await acceptLeaderMutations(input);

    // Cloud never pulls sync_events from local. Push table twin + nudge so
    // portal/cloud see the write without waiting for the 15s tick.
    const { replicatedTablesForEntities } = await import("./entity-tables.js");
    const { scheduleTableReplicationPush } = await import("./worker.js");
    const { notifyPeerOfEntityWrite } = await import("./nudge.js");
    const { publishWorkspaceUpdatedFromSyncEvent } = await import(
      "./sync-event-live-publish.js"
    );
    const tables = replicatedTablesForEntities(
      input.changes.map((change) => change.entity),
    );
    scheduleTableReplicationPush(tables, "local_fallback");
    for (const event of fallback.events) {
      publishWorkspaceUpdatedFromSyncEvent(input.workspaceId, event);
    }
    const first = input.changes[0];
    if (first) {
      const taskIdFromPayload =
        typeof first.payload.task_id === "string"
          ? first.payload.task_id
          : typeof first.payload.taskId === "string"
            ? first.payload.taskId
            : null;
      notifyPeerOfEntityWrite({
        workspaceId: input.workspaceId,
        reason: "local_fallback",
        entity: first.entity,
        entityId: first.entityId,
        taskId: taskIdFromPayload,
        operation: first.operation === "delete" ? "delete" : "upsert",
      });
    }

    return { ...fallback, source: "local_fallback" };
  }
}

export async function forwardMutationsToLeader(input: {
  workspaceId: string;
  mutationId: string;
  deviceId?: string;
  changes: LeaderMutationChange[];
}): Promise<LeaderMutationResult> {
  const config = getCoreReplicationConfig();
  if (!config) {
    throw new Error("CORE_REPLICATION_NOT_CONFIGURED");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${config.peerUrl}/internal/core-replication/mutations`,
      {
        method: "POST",
        headers: replicationHeaders(config.secret),
        signal: controller.signal,
        body: JSON.stringify({
          workspace_id: input.workspaceId,
          mutation_id: input.mutationId,
          device_id: input.deviceId ?? "local",
          changes: input.changes.map((change) => ({
            entity: change.entity,
            entity_id: change.entityId,
            operation: change.operation,
            payload: change.payload,
            event_mutation_id: change.eventMutationId,
          })),
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`leader mutation failed (${response.status}): ${body}`);
    }

    const payload = (await response.json()) as {
      last_sync_id: number;
      events: Array<{
        cursor: number;
        mutation_id: string;
        device_id: string | null;
        entity: string;
        entity_id: string;
        operation: string;
        payload: Record<string, unknown>;
        created_at: string;
      }>;
    };

    const events: SyncEventRow[] = (payload.events ?? []).map((raw) => {
      const entity = parseEntity(raw.entity);
      const operation = parseOperation(raw.operation);
      if (!entity || !operation) {
        throw new Error(`INVALID_LEADER_EVENT:${raw.entity}:${raw.operation}`);
      }
      return {
        cursor: raw.cursor,
        mutationId: raw.mutation_id,
        deviceId: raw.device_id,
        entity: raw.entity,
        entityId: raw.entity_id,
        operation: raw.operation,
        payload: raw.payload ?? {},
        createdAt: new Date(raw.created_at),
      };
    });

    return {
      lastSyncId: payload.last_sync_id,
      events,
      source: "leader",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export type DocumentContentLeaderResult = LeaderMutationResult & {
  contentVersion: number;
  byteSize: number;
};

const LEADER_CONTENT_CLIENT_ERRORS = new Set([
  "EMPTY_BODY_OVER_NONEMPTY",
  "CONTENT_VERSION_CONFLICT",
  "DOCUMENT_NOT_FOUND",
]);

function isLeaderContentClientError(error: unknown): boolean {
  return (
    error instanceof Error &&
    LEADER_CONTENT_CLIENT_ERRORS.has(error.message)
  );
}

function leaderDocumentContentErrorFromResponse(
  status: number,
  body: string,
): Error {
  try {
    const parsed = JSON.parse(body) as { code?: string };
    if (parsed.code === "empty_body_over_nonempty") {
      return new Error("EMPTY_BODY_OVER_NONEMPTY");
    }
    if (parsed.code === "content_version_conflict") {
      return new Error("CONTENT_VERSION_CONFLICT");
    }
    if (parsed.code === "not_found") {
      return new Error("DOCUMENT_NOT_FOUND");
    }
  } catch (error) {
    if (isLeaderContentClientError(error)) {
      return error as Error;
    }
  }
  return new Error(`leader document content failed (${status}): ${body}`);
}

/** Leader accepts Tier-D document content: storage write + content sync_event. */
export async function acceptDocumentContentLeaderMutation(input: {
  workspaceId: string;
  documentId: string;
  content: string;
  ifMatchVersion?: number;
  mutationId: string;
  deviceId?: string;
}): Promise<DocumentContentLeaderResult> {
  const deviceId = input.deviceId ?? "replica";
  const eventMutationId = input.mutationId;

  let duplicate = false;
  await db.transaction(async (tx) => {
    const [receipt] = await tx
      .insert(mutationReceipts)
      .values({
        workspaceId: input.workspaceId,
        mutationId: eventMutationId,
        deviceId,
      })
      .onConflictDoNothing()
      .returning({ mutationId: mutationReceipts.mutationId });
    if (!receipt) {
      duplicate = true;
    }
  });

  if (duplicate) {
    const existing = await loadEventByMutationId(
      input.workspaceId,
      eventMutationId,
    );
    const row = await getDocumentById(input.workspaceId, input.documentId);
    if (!existing || !row) {
      throw new Error("DOCUMENT_CONTENT_MUTATION_DUPLICATE_WITHOUT_ROW");
    }
    return {
      lastSyncId: existing.cursor,
      events: [existing],
      source: "leader",
      contentVersion: row.contentVersion,
      byteSize: row.byteSize ?? 0,
    };
  }

  const updated = await updateDocumentContent(
    input.workspaceId,
    input.documentId,
    {
      content: input.content,
      ifMatchVersion: input.ifMatchVersion,
    },
    { mutationId: eventMutationId, deviceId },
  );
  if (!updated) {
    throw new Error("DOCUMENT_NOT_FOUND");
  }

  const event = await loadEventByMutationId(
    input.workspaceId,
    eventMutationId,
  );
  if (!event) {
    throw new Error("DOCUMENT_CONTENT_EVENT_MISSING");
  }

  await db
    .insert(mutationReceipts)
    .values({
      workspaceId: input.workspaceId,
      mutationId: `parent:${eventMutationId}`,
      deviceId,
      result: { accepted: true, source: "leader_document_content_parent" },
    })
    .onConflictDoNothing();

  const lastSyncId = await getWorkspaceLastSyncId(input.workspaceId);
  return {
    lastSyncId,
    events: [event],
    source: "leader",
    contentVersion: updated.contentVersion,
    byteSize: updated.byteSize ?? 0,
  };
}

async function forwardDocumentContentToLeader(input: {
  workspaceId: string;
  documentId: string;
  content: string;
  ifMatchVersion?: number;
  mutationId: string;
  deviceId?: string;
}): Promise<DocumentContentLeaderResult> {
  const config = getCoreReplicationConfig();
  if (!config) {
    throw new Error("CORE_REPLICATION_NOT_CONFIGURED");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${config.peerUrl}/internal/core-replication/document-content`,
      {
        method: "POST",
        headers: replicationHeaders(config.secret),
        signal: controller.signal,
        body: JSON.stringify({
          workspace_id: input.workspaceId,
          document_id: input.documentId,
          content: input.content,
          if_match_version: input.ifMatchVersion,
          mutation_id: input.mutationId,
          device_id: input.deviceId ?? "rest",
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw leaderDocumentContentErrorFromResponse(response.status, body);
    }

    const payload = (await response.json()) as {
      last_sync_id: number;
      content_version: number;
      byte_size: number;
      events: Array<{
        cursor: number;
        mutation_id: string;
        device_id: string | null;
        entity: string;
        entity_id: string;
        operation: string;
        payload: Record<string, unknown>;
        created_at: string;
      }>;
    };

    const events: SyncEventRow[] = (payload.events ?? []).map((raw) => {
      const entity = parseEntity(raw.entity);
      const operation = parseOperation(raw.operation);
      if (!entity || !operation) {
        throw new Error(`INVALID_LEADER_EVENT:${raw.entity}:${raw.operation}`);
      }
      return {
        cursor: raw.cursor,
        mutationId: raw.mutation_id,
        deviceId: raw.device_id,
        entity: raw.entity,
        entityId: raw.entity_id,
        operation: raw.operation,
        payload: raw.payload ?? {},
        createdAt: new Date(raw.created_at),
      };
    });

    return {
      lastSyncId: payload.last_sync_id,
      events,
      source: "leader",
      contentVersion: payload.content_version,
      byteSize: payload.byte_size,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Local-core only: forward document content to cloud leader, apply returned
 * content sync_event locally, hydrate local vault bytes. Offline fallback uses
 * local updateDocumentContent (append local sync_events).
 */
export async function commitDocumentContentLeaderFirst(input: {
  workspaceId: string;
  documentId: string;
  content: string;
  ifMatchVersion?: number;
  mutationId?: string;
  deviceId?: string;
}): Promise<DocumentContentLeaderResult> {
  const mutationId =
    input.mutationId ??
    `rest:document-content:${input.documentId}:${Date.now()}:${crypto.randomUUID()}`;
  const deviceId = input.deviceId ?? "rest";

  if (!shouldForwardMutationsToLeader()) {
    const updated = await updateDocumentContent(
      input.workspaceId,
      input.documentId,
      {
        content: input.content,
        ifMatchVersion: input.ifMatchVersion,
      },
      { mutationId, deviceId },
    );
    if (!updated) {
      throw new Error("DOCUMENT_NOT_FOUND");
    }
    const lastSyncId = await getWorkspaceLastSyncId(input.workspaceId);
    const event = await loadEventByMutationId(input.workspaceId, mutationId);
    return {
      lastSyncId,
      events: event ? [event] : [],
      source: "local_fallback",
      contentVersion: updated.contentVersion,
      byteSize: updated.byteSize ?? 0,
    };
  }

  try {
    const forwarded = await forwardDocumentContentToLeader({
      ...input,
      mutationId,
      deviceId,
    });
    await applyLeaderEventsLocally(input.workspaceId, forwarded.events);
    await hydrateLocalDocumentVaultContent(
      input.workspaceId,
      input.documentId,
      input.content,
    );
    return forwarded;
  } catch (error) {
    if (isLeaderContentClientError(error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[leader-first] document content forward failed (${message}); falling back to local clock`,
    );
    const updated = await updateDocumentContent(
      input.workspaceId,
      input.documentId,
      {
        content: input.content,
        ifMatchVersion: input.ifMatchVersion,
      },
      { mutationId, deviceId },
    );
    if (!updated) {
      throw new Error("DOCUMENT_NOT_FOUND");
    }
    const lastSyncId = await getWorkspaceLastSyncId(input.workspaceId);
    const event = await loadEventByMutationId(input.workspaceId, mutationId);
    return {
      lastSyncId,
      events: event ? [event] : [],
      source: "local_fallback",
      contentVersion: updated.contentVersion,
      byteSize: updated.byteSize ?? 0,
    };
  }
}

/** True when this process should forward writes to cloud-core. */
export function shouldForwardMutationsToLeader(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const config = getCoreReplicationConfig(env);
  return Boolean(config && config.role === "local");
}

export type DocumentPropertiesLeaderResult = LeaderMutationResult & {
  contentVersion: number;
  docKey: string | null;
  properties: Record<string, unknown>;
  frontMatterValid: boolean;
  /** Markdown body written on the leader (includes allocated DOC-n). */
  content: string;
};

export async function acceptDocumentPropertiesLeaderMutation(input: {
  workspaceId: string;
  documentId: string;
  properties: Record<string, unknown>;
  ifMatchVersion?: number;
  mutationId: string;
  deviceId?: string;
}): Promise<DocumentPropertiesLeaderResult> {
  const deviceId = input.deviceId ?? "replica";
  const result = await putDocumentProperties(
    input.workspaceId,
    input.documentId,
    {
      properties: input.properties,
      ifMatchVersion: input.ifMatchVersion,
    },
    { mutationId: input.mutationId, deviceId },
  );
  if (!result) {
    throw new Error("DOCUMENT_NOT_FOUND");
  }
  const lastSyncId = await getWorkspaceLastSyncId(input.workspaceId);
  const event = await loadEventByMutationId(
    input.workspaceId,
    input.mutationId,
  );
  return {
    lastSyncId,
    events: event ? [event] : [],
    source: "leader",
    contentVersion: result.contentVersion,
    docKey: result.row.docKey,
    properties: result.properties,
    frontMatterValid: result.row.frontMatterValid,
    content: result.content,
  };
}

async function forwardDocumentPropertiesToLeader(input: {
  workspaceId: string;
  documentId: string;
  properties: Record<string, unknown>;
  ifMatchVersion?: number;
  mutationId: string;
  deviceId?: string;
}): Promise<DocumentPropertiesLeaderResult> {
  const config = getCoreReplicationConfig();
  if (!config) {
    throw new Error("CORE_REPLICATION_NOT_CONFIGURED");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${config.peerUrl}/internal/core-replication/document-properties`,
      {
        method: "POST",
        headers: replicationHeaders(config.secret),
        signal: controller.signal,
        body: JSON.stringify({
          workspace_id: input.workspaceId,
          document_id: input.documentId,
          properties: input.properties,
          if_match_version: input.ifMatchVersion,
          mutation_id: input.mutationId,
          device_id: input.deviceId ?? "rest",
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw leaderDocumentContentErrorFromResponse(response.status, body);
    }

    const payload = (await response.json()) as {
      last_sync_id: number;
      content_version: number;
      doc_key: string | null;
      properties: Record<string, unknown>;
      front_matter_valid: boolean;
      content: string;
      events: Array<{
        cursor: number;
        mutation_id: string;
        device_id: string | null;
        entity: string;
        entity_id: string;
        operation: string;
        payload: Record<string, unknown>;
        created_at: string;
      }>;
    };

    const events: SyncEventRow[] = (payload.events ?? []).map((raw) => {
      const entity = parseEntity(raw.entity);
      const operation = parseOperation(raw.operation);
      if (!entity || !operation) {
        throw new Error(`INVALID_LEADER_EVENT:${raw.entity}:${raw.operation}`);
      }
      return {
        cursor: raw.cursor,
        mutationId: raw.mutation_id,
        deviceId: raw.device_id,
        entity: raw.entity,
        entityId: raw.entity_id,
        operation: raw.operation,
        payload: raw.payload ?? {},
        createdAt: new Date(raw.created_at),
      };
    });

    return {
      lastSyncId: payload.last_sync_id,
      events,
      source: "leader",
      contentVersion: payload.content_version,
      docKey: payload.doc_key,
      properties: payload.properties ?? {},
      frontMatterValid: payload.front_matter_valid ?? true,
      content: typeof payload.content === "string" ? payload.content : "",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function commitDocumentPropertiesLeaderFirst(input: {
  workspaceId: string;
  documentId: string;
  properties: Record<string, unknown>;
  ifMatchVersion?: number;
  mutationId?: string;
  deviceId?: string;
}): Promise<DocumentPropertiesLeaderResult> {
  const mutationId =
    input.mutationId ??
    `rest:document-properties:${input.documentId}:${Date.now()}:${crypto.randomUUID()}`;
  const deviceId = input.deviceId ?? "rest";

  if (!shouldForwardMutationsToLeader()) {
    const result = await putDocumentProperties(
      input.workspaceId,
      input.documentId,
      {
        properties: input.properties,
        ifMatchVersion: input.ifMatchVersion,
      },
      { mutationId, deviceId },
    );
    if (!result) {
      throw new Error("DOCUMENT_NOT_FOUND");
    }
    const lastSyncId = await getWorkspaceLastSyncId(input.workspaceId);
    const event = await loadEventByMutationId(input.workspaceId, mutationId);
    return {
      lastSyncId,
      events: event ? [event] : [],
      source: "local_fallback",
      contentVersion: result.contentVersion,
      docKey: result.row.docKey,
      properties: result.properties,
      frontMatterValid: result.row.frontMatterValid,
      content: result.content,
    };
  }

  try {
    // Validate locally first (storage readable, YAML ok) before forwarding.
    const { planDocumentPropertiesPut } = await import(
      "../document-properties.js"
    );
    await planDocumentPropertiesPut(input.workspaceId, input.documentId, {
      properties: input.properties,
      ifMatchVersion: input.ifMatchVersion,
    });
    const forwarded = await forwardDocumentPropertiesToLeader({
      ...input,
      mutationId,
      deviceId,
    });
    await applyLeaderEventsLocally(input.workspaceId, forwarded.events);
    if (forwarded.content) {
      await hydrateLocalDocumentVaultContent(
        input.workspaceId,
        input.documentId,
        forwarded.content,
      );
    }
    return forwarded;
  } catch (error) {
    if (error instanceof DocumentPropertyError) {
      throw error;
    }
    if (isLeaderContentClientError(error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[leader-first] document properties forward failed (${message}); falling back to local clock`,
    );
    const result = await putDocumentProperties(
      input.workspaceId,
      input.documentId,
      {
        properties: input.properties,
        ifMatchVersion: input.ifMatchVersion,
      },
      { mutationId, deviceId },
    );
    if (!result) {
      throw new Error("DOCUMENT_NOT_FOUND");
    }
    const lastSyncId = await getWorkspaceLastSyncId(input.workspaceId);
    const event = await loadEventByMutationId(input.workspaceId, mutationId);
    return {
      lastSyncId,
      events: event ? [event] : [],
      source: "local_fallback",
      contentVersion: result.contentVersion,
      docKey: result.row.docKey,
      properties: result.properties,
      frontMatterValid: result.row.frontMatterValid,
      content: result.content,
    };
  }
}
