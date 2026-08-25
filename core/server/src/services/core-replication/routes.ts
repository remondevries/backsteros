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
