import type { Hono } from "hono";

import { extractBearerToken, verifyReplicationSecret } from "./auth.js";
import { verifyAvatarReplicationAuth } from "./avatar-replication.js";
import { getCoreReplicationConfig } from "./config.js";
import { REPLICATED_TABLES } from "./constants.js";
import { tableExists } from "./cursors.js";
import { applyRemoteChanges } from "./apply.js";
import { fetchAllLocalRows } from "./fetch.js";
import { getChangesSince } from "./sync.js";
import type { KnownTable } from "./tables.js";
import type { ReplicationApplyRequest, ReplicationCursor } from "./types.js";
import { buildSyncEventsFeed } from "./sync-event-replication.js";
import { acceptLeaderMutations, acceptDocumentContentLeaderMutation } from "./leader-mutations.js";
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

function unauthorized() {
  return { error: "Unauthorized", code: "unauthorized" as const };
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
      return c.json({ applied: 0, skipped: Array.isArray(body.changes) ? body.changes.length : 0 });
    }

    if (!Array.isArray(body.changes)) {
      return c.json(
        { error: "changes must be an array", code: "bad_request" as const },
        400,
      );
    }

    const result = await applyRemoteChanges(table as KnownTable, body.changes);
    return c.json(result);
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
}
