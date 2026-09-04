/**
 * Bidirectional core wake so document writes reach the peer without waiting
 * for the periodic replication tick.
 *
 * - Cloud agent write → nudge local (desktop SSE + vault pull)
 * - Local write / vault edit → nudge cloud (portal SSE + vault pull)
 */
import { appendOpsLog } from "../../lib/ops-log-buffer.js";
import {
  pullVaultMarkdownFromPeer,
  syncDocumentMetadataFromStorageKey,
} from "../vault-document-metadata.js";
import { getCoreReplicationConfig } from "./config.js";
import { publishWorkspaceUpdatedFromSyncEvent } from "./sync-event-live-publish.js";
import { pullPeerSyncEvents } from "./sync-event-replication.js";

const NUDGE_TIMEOUT_MS = 8_000;

export type ReplicationNudgeInput = {
  workspaceId: string;
  reason?: string;
  entity?: string;
  entityId?: string;
  storageKey?: string | null;
  contentVersion?: number | null;
  operation?: "upsert" | "delete";
  projectId?: string | null;
};

/**
 * Fire-and-forget wake of the replication peer after a document write on this
 * core. No-op when replication is unset. Peer offline: warn only.
 */
export function notifyPeerOfDocumentWrite(input: ReplicationNudgeInput): void {
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
            reason: input.reason ?? "document",
            entity: input.entity ?? "document",
            entity_id: input.entityId ?? null,
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

/** @deprecated Prefer {@link notifyPeerOfDocumentWrite} (bidirectional). */
export const notifyReplicaOfCloudWrite = notifyPeerOfDocumentWrite;

/**
 * Peer wake handler — works on both roles:
 * - local: pull ordered sync_events from cloud, then vault file
 * - cloud: pull vault file from local (sync_events already leader-owned)
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

  if (input.entityId?.trim()) {
    publishWorkspaceUpdatedFromSyncEvent(input.workspaceId, {
      entity: input.entity?.trim() || "document",
      entityId: input.entityId.trim(),
      operation,
      payload: {
        project_id: input.projectId ?? null,
        content_version: input.contentVersion ?? null,
        storage_key: storageKey,
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
