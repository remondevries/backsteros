/**
 * Bidirectional core wake so writes reach the peer without waiting for the
 * periodic replication tick.
 *
 * - Cloud write → nudge local (sync_events pull + optional table pull + SSE)
 * - Local write → nudge cloud (vault/table pull + SSE)
 * - local_fallback also pushes tables before/with the nudge (see leader-mutations)
 */
import { appendOpsLog } from "../../lib/ops-log-buffer.js";
import {
  pullVaultMarkdownFromPeer,
  syncDocumentMetadataFromStorageKey,
} from "../vault-document-metadata.js";
import { getCoreReplicationConfig } from "./config.js";
import { replicatedTablesForEntity } from "./entity-tables.js";
import { publishWorkspaceUpdatedFromSyncEvent } from "./sync-event-live-publish.js";
import { pullPeerSyncEvents } from "./sync-event-replication.js";
import { pullTable } from "./worker.js";

const NUDGE_TIMEOUT_MS = 8_000;

export type ReplicationNudgeInput = {
  workspaceId: string;
  reason?: string;
  entity?: string;
  entityId?: string;
  /** Parent task id — required for task_comment SSE (entityId is the comment). */
  taskId?: string | null;
  storageKey?: string | null;
  contentVersion?: number | null;
  operation?: "upsert" | "delete";
  projectId?: string | null;
};

/**
 * Fire-and-forget wake of the replication peer after an entity write on this
 * core. No-op when replication is unset. Peer offline: warn only.
 */
export function notifyPeerOfEntityWrite(input: ReplicationNudgeInput): void {
  const config = getCoreReplicationConfig();
  if (!config) return;

  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) return;

  void (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NUDGE_TIMEOUT_MS);
    try {
      const response = await fetch(
        `${config.peerUrl}/internal/core-replication/nudge`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.secret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspace_id: workspaceId,
            reason: input.reason ?? input.entity ?? "entity",
            entity: input.entity ?? "document",
            entity_id: input.entityId ?? null,
            task_id: input.taskId ?? null,
            storage_key: input.storageKey ?? null,
            content_version: input.contentVersion ?? null,
            operation: input.operation ?? "upsert",
            project_id: input.projectId ?? null,
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        appendOpsLog(
          "warn",
          "replication nudge peer error",
          `${response.status} ${body.slice(0, 200)}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendOpsLog("warn", "replication nudge peer unreachable", message);
    } finally {
      clearTimeout(timer);
    }
  })();
}

/** @deprecated Prefer {@link notifyPeerOfEntityWrite}. */
export const notifyPeerOfDocumentWrite = notifyPeerOfEntityWrite;

/** @deprecated Prefer {@link notifyPeerOfEntityWrite} (bidirectional). */
export const notifyReplicaOfCloudWrite = notifyPeerOfEntityWrite;

/**
 * Peer wake handler — works on both roles:
 * - local: pull ordered sync_events from cloud, then vault / tables
 * - cloud: pull vault / tables from local (sync_events already leader-owned)
 * Then publish workspace SSE for open shells on this core.
 */
export async function handleReplicationNudge(
  input: ReplicationNudgeInput,
): Promise<{ ok: true; role: string }> {
  const config = getCoreReplicationConfig();
  if (!config) {
    return { ok: true, role: "disabled" };
  }

  if (config.role === "local") {
    await pullPeerSyncEvents();
  }

  const storageKey = input.storageKey?.trim().replace(/\\/g, "/") || null;
  const operation = input.operation === "delete" ? "delete" : "upsert";

  if (storageKey && operation !== "delete") {
    const pulled = await pullVaultMarkdownFromPeer(storageKey);
    if (pulled) {
      await syncDocumentMetadataFromStorageKey(input.workspaceId, storageKey);
    }
  }

  // Metadata entities (CRM groups, contacts, …) use table-twin catch-up.
  // Pull immediately so cloud/local don't wait for the 15s tick after a nudge.
  const tables = replicatedTablesForEntity(input.entity);
  for (const table of tables) {
    try {
      await pullTable(table);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendOpsLog(
        "warn",
        "replication nudge table pull failed",
        `${table}: ${message}`,
      );
    }
  }

  if (input.entityId?.trim()) {
    publishWorkspaceUpdatedFromSyncEvent(input.workspaceId, {
      entity: input.entity?.trim() || "document",
      entityId: input.entityId.trim(),
      operation,
      payload: {
        project_id: input.projectId ?? null,
        content_version: input.contentVersion ?? null,
        storage_key: storageKey,
        // task_comment SSE maps to parent task; entityId alone is the comment id.
        task_id: input.taskId?.trim() || null,
      },
    });
  }

  appendOpsLog(
    "info",
    "replication nudge handled",
    `${config.role} ${input.entity ?? "document"} ${input.entityId ?? ""}`,
  );

  return { ok: true, role: config.role };
}
