import type { Hono } from "hono";

import { getCoreReplicationConfig } from "./config.js";
import type { ReplicatedTable } from "./constants.js";
import { REPLICATED_TABLES } from "./constants.js";
import {
  applyRemoteChanges,
  fetchAllLocalRows,
  getChangesSince,
} from "./sync.js";
import { isImplementedReplicatedTable } from "./tables.js";
import type { ReplicationApplyRequest, ReplicationCursor } from "./types.js";

function unauthorized() {
  return { error: "Unauthorized", code: "unauthorized" as const };
}

function replicationAuth(authorization: string | undefined): boolean {
  const config = getCoreReplicationConfig();
  if (!config) return false;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;
  return token === config.secret;
}

function parseTable(value: string | undefined): ReplicatedTable | null {
  if (!value) return null;
  return (REPLICATED_TABLES as readonly string[]).includes(value)
    ? (value as ReplicatedTable)
    : null;
}

function parseCursor(
  since: string | undefined,
  sinceId: string | undefined,
): ReplicationCursor {
  const updatedAt = since?.trim() || new Date(0).toISOString();
  return { updatedAt, rowId: sinceId?.trim() || "" };
}

export function registerCoreReplicationRoutes(app: Hono) {
  app.get("/internal/core-replication/changes", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }

    const table = parseTable(c.req.query("table"));
    if (!table || !isImplementedReplicatedTable(table)) {
      return c.json(
        { error: "Unknown or unsupported table", code: "bad_request" as const },
        400,
      );
    }

    const since = parseCursor(
      c.req.query("since"),
      c.req.query("since_id"),
    );
    const payload = await getChangesSince(table, since);
    return c.json(payload);
  });

  app.post("/internal/core-replication/apply", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }

    const body = (await c.req.json()) as ReplicationApplyRequest;
    const table = parseTable(body.table);
    if (!table || !isImplementedReplicatedTable(table)) {
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

    const result = await applyRemoteChanges(table, body.changes);
    return c.json(result);
  });

  app.get("/internal/core-replication/bootstrap", async (c) => {
    if (!replicationAuth(c.req.header("Authorization"))) {
      return c.json(unauthorized(), 401);
    }

    const table = parseTable(c.req.query("table"));
    if (!table || !isImplementedReplicatedTable(table)) {
      return c.json(
        { error: "Unknown or unsupported table", code: "bad_request" as const },
        400,
      );
    }

    const changes = await fetchAllLocalRows(table);
    return c.json({ table, changes });
  });
}
