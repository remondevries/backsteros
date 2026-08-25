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

async function isLiveReplicationTable(table: string): Promise<boolean> {
  if (!(REPLICATED_TABLES as readonly string[]).includes(table)) {
    return false;
  }
  return tableExists(table);
}

export function registerCoreReplicationRoutes(app: Hono) {
  app.get("/internal/core-replication/changes", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }

    const table = parseTable(c.req.query("table"));
    if (!table || !(await isLiveReplicationTable(table))) {
      return c.json(
        { error: "Unknown or unsupported table", code: "bad_request" as const },
        400,
      );
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
    if (!table || !(await isLiveReplicationTable(table))) {
      return c.json(
        { error: "Unknown or unsupported table", code: "bad_request" as const },
        400,
      );
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
}
