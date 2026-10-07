import type { Context, Hono } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

import { extractBearerToken, verifyReplicationSecret } from "./auth.js";
import { verifyAvatarReplicationAuth } from "./avatar-replication.js";
import {
  acknowledgePendingSyncEventPull,
  getCoreReplicationConfig,
  getPendingSyncEventPullAck,
  getSyncEventPullRuntimeOverride,
  isSyncEventPullEnabled,
  setSyncEventPullRuntimeEnabled,
  syncPendingAckWithState,
} from "./config.js";
import { REPLICATED_TABLES } from "./constants.js";
import { tableExists } from "./cursors.js";
import { applyRemoteChanges } from "./apply.js";
import { fetchAllLocalRows, fetchLocalTableTips } from "./fetch.js";
import {
  computeTableFingerprint,
  fetchLocalRowsByKeys,
  listReplicationRowKeys,
} from "./reconcile.js";
import { getChangesSince } from "./sync.js";
import type { KnownTable } from "./tables.js";
import type { ReplicationApplyRequest, ReplicationCursor } from "./types.js";
import { buildSyncEventsFeed } from "./sync-event-replication.js";
import {
  acceptLeaderMutations,
  acceptDocumentContentLeaderMutation,
  acceptDocumentPropertiesLeaderMutation,
} from "./leader-mutations.js";
import { DocumentPropertyError } from "../document-properties.js";
import type { SyncEntity, SyncOperation } from "../../lib/sync-constants.js";
import { SYNC_ENTITIES, SYNC_OPERATIONS } from "../../lib/sync-constants.js";
import { syncDocumentMetadataAfterVaultWrite } from "../vault-document-metadata.js";
import {
  applyVaultFileDelete,
  applyVaultFilePut,
  listMarkdownFiles,
  readVaultMarkdownBase64,
  requireVaultRoot,
  VaultPathError,
} from "./vault-replication.js";
import { handleReplicationNudge } from "./nudge.js";
import { verifyLocalCoreControlAuthorization } from "./local-core-control-token.js";
import {
  formatPendingUnpushedSummary,
  getPendingUnpushedState,
  isPendingCoveredByAck,
  parseAcknowledgePendingBody,
  resolveAcknowledgePendingSnapshot,
  shouldPauseSyncEventPull,
} from "./pending-unpushed-state.js";
import { AgentMailApiError } from "../../lib/agentmail-client.js";
import * as agentmailSettingsService from "../agentmail-settings.js";
import { readEmailAgentCallback } from "../email-agent-callbacks.js";

function unauthorized() {
  return { error: "Unauthorized", code: "unauthorized" as const };
}

/** Exported for unit tests — IPv4/IPv6 loopback only. */
export function isLoopbackRemoteAddress(
  address: string | null | undefined,
): boolean {
  if (!address) return false;
  const normalized = address.trim().toLowerCase();
  if (normalized === "127.0.0.1" || normalized === "::1") return true;
  return normalized.startsWith("::ffff:127.0.0.1");
}

function remoteAddressFromContext(c: Context): string | null {
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}

/**
 * Local-core control surface (OS-82). Auth is a local-only control token — not
 * CORE_REPLICATION_SECRET — because Tailscale serve proxies peer traffic from
 * 127.0.0.1. Role=local is required; loopback is defence in depth only.
 */
function denySyncEventPullControl(c: Context): Response | null {
  const config = getCoreReplicationConfig();
  if (!config || config.role !== "local") {
    return c.json({ error: "Not found", code: "not_found" as const }, 404);
  }
  if (!isLoopbackRemoteAddress(remoteAddressFromContext(c))) {
    return c.json({ error: "Forbidden", code: "forbidden" as const }, 403);
  }
  return null;
}

function syncEventPullControlAuth(authorization: string | undefined): boolean {
  return verifyLocalCoreControlAuthorization(authorization);
}

function replicationAuth(authorization: string | undefined): boolean {
  const config = getCoreReplicationConfig();
  if (!config) return false;
  const token = extractBearerToken(authorization);
  return verifyReplicationSecret(token, config.secret);
}

function parseTable(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  return value.trim();
}

function parseCursor(
  since: string | undefined,
  sinceId: string | undefined,
): ReplicationCursor {
  const updatedAt = since?.trim() || new Date(0).toISOString();
  return { updatedAt, rowId: sinceId?.trim() || "" };
}

/** Optional tables missing on this peer should not 400 — return empty deltas. */
async function isKnownReplicationTable(table: string): Promise<"live" | "absent" | "unknown"> {
  if (!(REPLICATED_TABLES as readonly string[]).includes(table)) {
    return "unknown";
  }
  return (await tableExists(table)) ? "live" : "absent";
}

export function registerCoreReplicationRoutes(app: Hono) {
  /** Auth-only liveness check for hybrid scheduled-job leadership (local ↔ cloud). */
  app.get("/internal/core-replication/ping", (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }
    const config = getCoreReplicationConfig();
    return c.json({ ok: true, role: config?.role ?? null });
  });

  /**
   * Cloud → local wake after agent writes. Local pulls sync_events (+ optional
   * vault file) and publishes workspace SSE for open desktop shells.
   */
  app.post("/internal/core-replication/nudge", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }

    const body = (await c.req.json()) as {
      workspace_id?: string;
      reason?: string;
      entity?: string;
      entity_id?: string;
      task_id?: string | null;
      storage_key?: string | null;
      content_version?: number | null;
      operation?: string;
      project_id?: string | null;
    };

    const workspaceId = body.workspace_id?.trim();
    if (!workspaceId) {
      return c.json(
        { error: "workspace_id is required", code: "bad_request" as const },
        400,
      );
    }

    const result = await handleReplicationNudge({
      workspaceId,
      reason: body.reason?.trim(),
      entity: body.entity?.trim(),
      entityId: body.entity_id?.trim(),
      taskId: typeof body.task_id === "string" ? body.task_id : null,
      storageKey:
        typeof body.storage_key === "string" ? body.storage_key : null,
      contentVersion:
        typeof body.content_version === "number" &&
        Number.isFinite(body.content_version)
          ? body.content_version
          : null,
      operation: body.operation === "delete" ? "delete" : "upsert",
      projectId:
        typeof body.project_id === "string" ? body.project_id : null,
    });
    return c.json(result);
  });

  app.get("/internal/core-replication/sync-events", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }

    const workspaceId = c.req.query("workspace_id")?.trim();
    if (!workspaceId) {
      return c.json(
        { error: "workspace_id is required", code: "bad_request" as const },
        400,
      );
    }

    const afterRaw = c.req.query("after")?.trim() ?? "0";
    const afterCursor = Number.parseInt(afterRaw, 10);
    if (!Number.isFinite(afterCursor) || afterCursor < 0) {
      return c.json(
        { error: "after must be a non-negative integer", code: "bad_request" as const },
        400,
      );
    }

    const limitRaw = c.req.query("limit")?.trim();
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
      return c.json(
        { error: "limit must be a positive integer", code: "bad_request" as const },
        400,
      );
    }

    const feed = await buildSyncEventsFeed({
      workspaceId,
      afterCursor,
      limit,
    });
    return c.json(feed);
  });

  app.post("/internal/core-replication/mutations", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }

    const body = (await c.req.json()) as {
      workspace_id?: string;
      mutation_id?: string;
      device_id?: string;
      changes?: Array<{
        entity?: string;
        entity_id?: string;
        operation?: string;
        payload?: Record<string, unknown>;
        event_mutation_id?: string;
      }>;
    };

    const workspaceId = body.workspace_id?.trim();
    const mutationId = body.mutation_id?.trim();
    if (!workspaceId || !mutationId) {
      return c.json(
        {
          error: "workspace_id and mutation_id are required",
          code: "bad_request" as const,
        },
        400,
      );
    }
    if (!Array.isArray(body.changes) || body.changes.length === 0) {
      return c.json(
        { error: "changes must be a non-empty array", code: "bad_request" as const },
        400,
      );
    }

    const changes = [];
    for (const raw of body.changes) {
      const entity = raw.entity?.trim();
      const entityId = raw.entity_id?.trim();
      const operation = raw.operation?.trim();
      if (
        !entity ||
        !entityId ||
        !operation ||
        !(SYNC_ENTITIES as readonly string[]).includes(entity) ||
        !(SYNC_OPERATIONS as readonly string[]).includes(operation)
      ) {
        return c.json(
          {
            error: "each change needs valid entity, entity_id, operation",
            code: "bad_request" as const,
          },
          400,
        );
      }
      changes.push({
        entity: entity as SyncEntity,
        entityId,
        operation: operation as SyncOperation,
        payload: raw.payload ?? {},
        eventMutationId: raw.event_mutation_id?.trim() || undefined,
      });
    }

    const result = await acceptLeaderMutations({
      workspaceId,
      mutationId,
      deviceId: body.device_id?.trim() || "replica",
      changes,
    });

    // Open portal/desktop shells on this core (usually cloud) need SSE before
    // PowerSync — especially task_comment → parent task id.
    const { publishWorkspaceUpdatedFromSyncEvent } = await import(
      "./sync-event-live-publish.js"
    );
    for (const event of result.events) {
      publishWorkspaceUpdatedFromSyncEvent(workspaceId, event);
    }

    return c.json({
      last_sync_id: result.lastSyncId,
      events: result.events.map((event) => ({
        cursor: event.cursor,
        mutation_id: event.mutationId,
        device_id: event.deviceId,
        entity: event.entity,
        entity_id: event.entityId,
        operation: event.operation,
        payload: event.payload,
        created_at: event.createdAt.toISOString(),
      })),
    });
  });

  app.post("/internal/core-replication/document-content", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }

    const body = (await c.req.json()) as {
      workspace_id?: string;
      document_id?: string;
      content?: string;
      if_match_version?: number;
      mutation_id?: string;
      device_id?: string;
    };

    const workspaceId = body.workspace_id?.trim();
    const documentId = body.document_id?.trim();
    const mutationId = body.mutation_id?.trim();
    if (!workspaceId || !documentId || !mutationId) {
      return c.json(
        {
          error: "workspace_id, document_id, and mutation_id are required",
          code: "bad_request" as const,
        },
        400,
      );
    }
    if (typeof body.content !== "string") {
      return c.json(
        { error: "content is required", code: "bad_request" as const },
        400,
      );
    }

    try {
      const result = await acceptDocumentContentLeaderMutation({
        workspaceId,
        documentId,
        content: body.content,
        ifMatchVersion: body.if_match_version,
        mutationId,
        deviceId: body.device_id?.trim() || "replica",
      });

      return c.json({
        last_sync_id: result.lastSyncId,
        content_version: result.contentVersion,
        byte_size: result.byteSize,
        events: result.events.map((event) => ({
          cursor: event.cursor,
          mutation_id: event.mutationId,
          device_id: event.deviceId,
          entity: event.entity,
          entity_id: event.entityId,
          operation: event.operation,
          payload: event.payload,
          created_at: event.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "DOCUMENT_NOT_FOUND") {
        return c.json(
          { error: "Document not found", code: "not_found" as const },
          404,
        );
      }
      if (error instanceof Error && error.message === "CONTENT_VERSION_CONFLICT") {
        return c.json(
          {
            error: "Document content version conflict",
            code: "content_version_conflict",
          },
          409,
        );
      }
      if (error instanceof Error && error.message === "EMPTY_BODY_OVER_NONEMPTY") {
        return c.json(
          {
            error: "Refusing to overwrite non-empty document with empty body",
            code: "empty_body_over_nonempty",
          },
          409,
        );
      }
      if (error instanceof Error && error.message === "STORAGE_ACCESS_DENIED") {
        return c.json(
          {
            error: "Local vault access denied — check vault folder permissions",
            code: "storage_access_denied",
          },
          503,
        );
      }
      throw error;
    }
  });

  app.post("/internal/core-replication/document-properties", async (c) => {
    const config = getCoreReplicationConfig();
    if (!config || config.role !== "cloud") {
      return c.json(unauthorized(), 401);
    }
    const token = extractBearerToken(c.req.header("Authorization"));
    if (!token || !verifyReplicationSecret(token, config.secret)) {
      return c.json(unauthorized(), 401);
    }

    const body = (await c.req.json()) as {
      workspace_id?: string;
      document_id?: string;
      properties?: Record<string, unknown>;
      if_match_version?: number;
      mutation_id?: string;
      device_id?: string;
    };
    const workspaceId = body.workspace_id?.trim();
    const documentId = body.document_id?.trim();
    const mutationId = body.mutation_id?.trim();
    if (!workspaceId || !documentId || !mutationId) {
      return c.json(
        {
          error: "workspace_id, document_id, and mutation_id are required",
          code: "bad_request" as const,
        },
        400,
      );
    }
    if (!body.properties || typeof body.properties !== "object") {
      return c.json(
        { error: "properties is required", code: "bad_request" as const },
        400,
      );
    }

    try {
      const result = await acceptDocumentPropertiesLeaderMutation({
        workspaceId,
        documentId,
        properties: body.properties,
        ifMatchVersion: body.if_match_version,
        mutationId,
        deviceId: body.device_id?.trim() || "replica",
      });
      return c.json({
        last_sync_id: result.lastSyncId,
        content_version: result.contentVersion,
        doc_key: result.docKey,
        properties: result.properties,
        front_matter_valid: result.frontMatterValid,
        content: result.content,
        events: result.events.map((event) => ({
          cursor: event.cursor,
          mutation_id: event.mutationId,
          device_id: event.deviceId,
          entity: event.entity,
          entity_id: event.entityId,
          operation: event.operation,
          payload: event.payload,
          created_at: event.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      if (error instanceof DocumentPropertyError) {
        if (error.code === "CONTENT_VERSION_CONFLICT") {
          return c.json(
            {
              error: "Document content version conflict",
              code: "content_version_conflict",
            },
            409,
          );
        }
        if (error.code === "INVALID_YAML") {
          return c.json(
            { error: "Invalid YAML front matter", code: "invalid_yaml" },
            422,
          );
        }
        if (error.code === "STORAGE_NOT_FOUND") {
          return c.json(
            {
              error: "Document content not found in storage",
              code: "storage_not_found",
            },
            422,
          );
        }
        return c.json(
          { error: error.message, code: "invalid_property" },
          422,
        );
      }
      if (error instanceof Error && error.message === "DOCUMENT_NOT_FOUND") {
        return c.json(
          { error: "Document not found", code: "not_found" as const },
          404,
        );
      }
      if (error instanceof Error && error.message === "CONTENT_VERSION_CONFLICT") {
        return c.json(
          {
            error: "Document content version conflict",
            code: "content_version_conflict",
          },
          409,
        );
      }
      throw error;
    }
  });

  app.get("/internal/core-replication/changes", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }

    const table = parseTable(c.req.query("table"));
    const tableState = table ? await isKnownReplicationTable(table) : "unknown";
    if (!table || tableState === "unknown") {
      return c.json(
        { error: "Unknown or unsupported table", code: "bad_request" as const },
        400,
      );
    }
    if (tableState === "absent") {
      const since = parseCursor(c.req.query("since"), c.req.query("since_id"));
      return c.json({ table, changes: [], cursor: since });
    }

    const since = parseCursor(
      c.req.query("since"),
      c.req.query("since_id"),
    );
    const payload = await getChangesSince(
      table as (typeof REPLICATED_TABLES)[number],
      since,
    );
    return c.json(payload);
  });

  /**
   * Batch tip watermarks for every replicated table. Callers compare each tip
   * to their pull cursor and only GET /changes for tables that moved — cuts
   * empty per-table poll traffic (~44 requests/tick → 1 + dirty tables).
   */
  app.get("/internal/core-replication/sync-state", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }

    const tips = await fetchLocalTableTips([...REPLICATED_TABLES]);
    return c.json({ tips });
  });

  app.post("/internal/core-replication/apply", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }

    const body = (await c.req.json()) as ReplicationApplyRequest;
    const table = parseTable(body.table);
    const tableState = table ? await isKnownReplicationTable(table) : "unknown";
    if (!table || tableState === "unknown") {
      return c.json(
        { error: "Unknown or unsupported table", code: "bad_request" as const },
        400,
      );
    }
    if (tableState === "absent") {
      return c.json({
        applied: 0,
        skipped: Array.isArray(body.changes) ? body.changes.length : 0,
        failed: [],
      });
    }

    if (!Array.isArray(body.changes)) {
      return c.json(
        { error: "changes must be an array", code: "bad_request" as const },
        400,
      );
    }

    const result = await applyRemoteChanges(table as KnownTable, body.changes, {
      direction: "push",
    });
    return c.json(result);
  });

  app.get("/internal/core-replication/table-fingerprint", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }
    const table = parseTable(c.req.query("table"));
    const tableState = table ? await isKnownReplicationTable(table) : "unknown";
    if (!table || tableState === "unknown") {
      return c.json(
        { error: "Unknown or unsupported table", code: "bad_request" as const },
        400,
      );
    }
    if (tableState === "absent") {
      return c.json({ table, count: 0, fingerprint: "" });
    }
    const fingerprint = await computeTableFingerprint(table as KnownTable);
    return c.json(
      fingerprint ?? { table, count: 0, fingerprint: "" },
    );
  });

  app.get("/internal/core-replication/table-keys", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }
    const table = parseTable(c.req.query("table"));
    const tableState = table ? await isKnownReplicationTable(table) : "unknown";
    if (!table || tableState === "unknown") {
      return c.json(
        { error: "Unknown or unsupported table", code: "bad_request" as const },
        400,
      );
    }
    if (tableState === "absent") {
      return c.json({ table, keys: [] });
    }
    const keys = await listReplicationRowKeys(table as KnownTable);
    return c.json({ table, keys });
  });

  app.post("/internal/core-replication/rows", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }
    const body = (await c.req.json()) as { table?: string; keys?: unknown };
    const table = parseTable(body.table);
    const tableState = table ? await isKnownReplicationTable(table) : "unknown";
    if (!table || tableState === "unknown") {
      return c.json(
        { error: "Unknown or unsupported table", code: "bad_request" as const },
        400,
      );
    }
    if (!Array.isArray(body.keys) || !body.keys.every((k) => typeof k === "string")) {
      return c.json(
        { error: "keys must be a string array", code: "bad_request" as const },
        400,
      );
    }
    if (tableState === "absent") {
      return c.json({ table, changes: [] });
    }
    const changes = await fetchLocalRowsByKeys(
      table as KnownTable,
      body.keys as string[],
    );
    return c.json({ table, changes });
  });

  app.get("/internal/core-replication/bootstrap", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }

    const table = parseTable(c.req.query("table"));
    if (!table || !(await tableExists(table))) {
      return c.json(
        { error: "Unknown or unsupported table", code: "bad_request" as const },
        400,
      );
    }

    const changes = await fetchAllLocalRows(table as KnownTable);
    return c.json({ table, changes });
  });

  app.get("/internal/core-replication/avatar", async (c) => {
    if (!verifyAvatarReplicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }
    // Avatar bytes are vault-scoped; full copy lands in a follow-up if needed.
    return c.json(
      {
        error: "Avatar byte replication not configured on this core",
        code: "not_implemented" as const,
      },
      501,
    );
  });

  app.get("/internal/core-replication/vault/manifest", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }
    try {
      const vaultRoot = await requireVaultRoot();
      const files = await listMarkdownFiles(vaultRoot);
      return c.json({ files });
    } catch (error) {
      if (error instanceof Error && error.message === "STORAGE_NOT_CONFIGURED") {
        return c.json({ files: [] });
      }
      throw error;
    }
  });

  app.get("/internal/core-replication/vault/file", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }
    const relativePath = c.req.query("path");
    if (!relativePath?.trim()) {
      return c.json(
        { error: "path is required", code: "bad_request" as const },
        400,
      );
    }
    try {
      const vaultRoot = await requireVaultRoot();
      const file = await readVaultMarkdownBase64(vaultRoot, relativePath);
      return c.json({
        path: relativePath.trim().replace(/\\/g, "/"),
        mtimeMs: file.mtimeMs,
        contentBase64: file.contentBase64,
      });
    } catch (error) {
      if (error instanceof VaultPathError) {
        return c.json({ error: error.message, code: error.code }, 400);
      }
      if (error instanceof Error && error.message === "STORAGE_NOT_CONFIGURED") {
        return c.json(
          { error: "Vault not configured", code: "storage_not_configured" },
          503,
        );
      }
      const err = error as NodeJS.ErrnoException;
      if (err?.code === "ENOENT") {
        return c.json({ error: "Not found", code: "not_found" }, 404);
      }
      throw error;
    }
  });

  app.put("/internal/core-replication/vault/file", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }
    const body = (await c.req.json()) as {
      path?: string;
      mtimeMs?: number;
      contentBase64?: string;
    };
    if (
      typeof body.path !== "string" ||
      typeof body.mtimeMs !== "number" ||
      typeof body.contentBase64 !== "string"
    ) {
      return c.json(
        {
          error: "path, mtimeMs, and contentBase64 are required",
          code: "bad_request" as const,
        },
        400,
      );
    }
    try {
      const vaultRoot = await requireVaultRoot();
      const result = await applyVaultFilePut(vaultRoot, {
        path: body.path,
        mtimeMs: body.mtimeMs,
        contentBase64: body.contentBase64,
      });
      if (result === "applied") {
        await syncDocumentMetadataAfterVaultWrite(body.path);
      }
      return c.json({ result });
    } catch (error) {
      if (error instanceof VaultPathError) {
        return c.json({ error: error.message, code: error.code }, 400);
      }
      if (error instanceof Error && error.message === "STORAGE_NOT_CONFIGURED") {
        return c.json(
          { error: "Vault not configured", code: "storage_not_configured" },
          503,
        );
      }
      throw error;
    }
  });

  app.delete("/internal/core-replication/vault/file", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }
    const relativePath = c.req.query("path");
    if (!relativePath?.trim()) {
      return c.json(
        { error: "path is required", code: "bad_request" as const },
        400,
      );
    }
    try {
      const vaultRoot = await requireVaultRoot();
      const result = await applyVaultFileDelete(vaultRoot, relativePath);
      return c.json({ result });
    } catch (error) {
      if (error instanceof VaultPathError) {
        return c.json({ error: error.message, code: error.code }, 400);
      }
      if (error instanceof Error && error.message === "STORAGE_NOT_CONFIGURED") {
        return c.json(
          { error: "Vault not configured", code: "storage_not_configured" },
          503,
        );
      }
      throw error;
    }
  });

  app.get("/internal/core-replication/sync-event-pull", async (c) => {
    if (!syncEventPullControlAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }
    const denied = denySyncEventPullControl(c);
    if (denied) return denied;

    const config = getCoreReplicationConfig();
    let pending;
    try {
      pending = await getPendingUnpushedState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json(
        { error: message, code: "internal" as const },
        500,
      );
    }
    syncPendingAckWithState(pending);
    const ack = getPendingSyncEventPullAck();
    const pausedForPending = shouldPauseSyncEventPull(pending, ack);
    return c.json({
      ok: true,
      role: config?.role ?? null,
      enabled: isSyncEventPullEnabled(),
      runtimeOverride: getSyncEventPullRuntimeOverride(),
      pendingAcknowledged: isPendingCoveredByAck(pending, ack),
      pausedForPending,
      pending,
      summary: formatPendingUnpushedSummary(pending),
    });
  });

  app.post("/internal/core-replication/sync-event-pull", async (c) => {
    if (!syncEventPullControlAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }
    const denied = denySyncEventPullControl(c);
    if (denied) return denied;

    const body = (await c.req.json().catch(() => ({}))) as {
      enabled?: boolean;
      acknowledgePending?: unknown;
    };
    if (typeof body.enabled === "boolean") {
      setSyncEventPullRuntimeEnabled(body.enabled);
    }

    const shownAck = parseAcknowledgePendingBody(body.acknowledgePending);
    if (shownAck === "invalid") {
      return c.json(
        {
          error:
            "acknowledgePending must be an object with non-negative integer unpushedRowCount, openDeadLetterCount, localOnlyRowCount",
          code: "bad_request" as const,
        },
        400,
      );
    }

    let pending;
    try {
      pending = await getPendingUnpushedState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json(
        { error: message, code: "internal" as const },
        500,
      );
    }

    if (shownAck) {
      acknowledgePendingSyncEventPull(
        resolveAcknowledgePendingSnapshot(shownAck, pending),
      );
    }
    syncPendingAckWithState(pending);
    const ack = getPendingSyncEventPullAck();
    const pausedForPending = shouldPauseSyncEventPull(pending, ack);
    return c.json({
      ok: true,
      enabled: isSyncEventPullEnabled(),
      runtimeOverride: getSyncEventPullRuntimeOverride(),
      pendingAcknowledged: isPendingCoveredByAck(pending, ack),
      pausedForPending,
      pending,
      summary: formatPendingUnpushedSummary(pending),
    });
  });

  /**
   * Local-core → cloud-core: register email_agent_callbacks + wake Judith.
   * Callback URLs are always on agent.backsteros.com (OS-100).
   */
  app.post("/internal/core-replication/email-agent-draft", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }
    const config = getCoreReplicationConfig();
    if (!config || config.role !== "cloud") {
      return c.json(
        {
          error: "Email agent draft mailbox is cloud-only",
          code: "forbidden" as const,
        },
        403,
      );
    }

    const body = (await c.req.json().catch(() => null)) as {
      workspace_id?: string;
      inbox_id?: string;
      message_id?: string;
      prompt?: string;
      intent?: "reply_draft" | "task" | "calendar" | "note" | null;
      current_draft_body?: string | null;
    } | null;

    const workspaceId = body?.workspace_id?.trim();
    const inboxId = body?.inbox_id?.trim();
    const messageId = body?.message_id?.trim();
    const prompt = body?.prompt?.trim();
    if (!workspaceId || !inboxId || !messageId || !prompt) {
      return c.json(
        {
          error:
            "workspace_id, inbox_id, message_id, and prompt are required",
          code: "bad_request" as const,
        },
        400,
      );
    }

    try {
      const started = await agentmailSettingsService.startEmailAgentDraft(
        workspaceId,
        inboxId,
        messageId,
        prompt,
        body?.intent,
        body?.current_draft_body,
      );
      return c.json(started);
    } catch (error) {
      if (error instanceof AgentMailApiError) {
        return c.json(
          {
            error: error.message,
            code: error.status === 404 ? "not_found" : "bad_request",
          },
          error.status === 404 ? 404 : 400,
        );
      }
      const message =
        error instanceof Error
          ? error.message
          : "Could not start email agent draft on cloud-core";
      return c.json({ error: message, code: "bad_request" as const }, 400);
    }
  });

  app.get(
    "/internal/core-replication/email-agent-draft-callbacks/:requestId",
    async (c) => {
      if (!replicationAuth(c.req.header("Authorization"))) {
        return c.json(unauthorized(), 401);
      }
      const config = getCoreReplicationConfig();
      if (!config || config.role !== "cloud") {
        return c.json(
          {
            error: "Email agent draft mailbox is cloud-only",
            code: "forbidden" as const,
          },
          403,
        );
      }

      const requestId = decodeURIComponent(c.req.param("requestId"));
      const workspaceId = c.req.query("workspace_id")?.trim();
      if (!workspaceId) {
        return c.json(
          { error: "workspace_id is required", code: "bad_request" as const },
          400,
        );
      }

      const poll = await readEmailAgentCallback(workspaceId, requestId);
      if (!poll) {
        return c.json(
          {
            error: "Email agent draft callback not found",
            code: "not_found" as const,
          },
          404,
        );
      }
      return c.json(poll);
    },
  );
}
