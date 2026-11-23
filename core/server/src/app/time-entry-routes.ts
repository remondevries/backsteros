import type { Context, Hono } from "hono";
import {
  checkpointTimeEntrySchema,
  createTimeEntrySchema,
  listTimeEntriesQuerySchema,
  stopTimeEntrySchema,
  timeEntrySummaryQuerySchema,
  updateTimeEntrySchema,
} from "@backsteros/contracts";

import type { AuthContext } from "../middleware/auth.js";
import { requireScope } from "../middleware/auth.js";
import * as timeEntryService from "../services/time-entries/index.js";
import type { TimeEntryEntityType } from "../services/time-entries/index.js";

function getAuth(c: Context): AuthContext {
  return c.get("auth");
}

function forbidden() {
  return { error: "Insufficient scope", code: "forbidden" as const };
}

function unauthorized() {
  return { error: "Unauthorized", code: "unauthorized" as const };
}

function notFound(entity: string) {
  return { error: `${entity} not found`, code: "not_found" as const };
}

function writeScopeForEntity(entityType: TimeEntryEntityType): string {
  // Meetings share the tasks scope surface in core.
  if (entityType === "document") return "documents:write";
  return "tasks:write";
}

function readScopeForEntity(entityType: TimeEntryEntityType | undefined): string {
  if (entityType === "document") return "documents:read";
  return "tasks:read";
}

function canReadTime(
  auth: AuthContext,
  entityType: TimeEntryEntityType | undefined,
): boolean {
  if (entityType) {
    return Boolean(requireScope(readScopeForEntity(entityType) as never)(auth));
  }
  return Boolean(
    requireScope("tasks:read")(auth) || requireScope("documents:read")(auth),
  );
}

export function registerTimeEntryRoutes(app: Hono) {
  app.get("/api/v1/time-entries/summary", async (c) => {
    const auth = getAuth(c);
    const parsed = timeEntrySummaryQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: "Invalid query", code: "invalid_query" }, 400);
    }
    if (!canReadTime(auth, parsed.data.entityType)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const summary = await timeEntryService.summarizeTimeEntries(
      auth.workspaceId,
      parsed.data,
    );
    return c.json(summary);
  });

  app.get("/api/v1/time-entries", async (c) => {
    const auth = getAuth(c);
    const parsed = listTimeEntriesQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: "Invalid query", code: "invalid_query" }, 400);
    }
    if (!canReadTime(auth, parsed.data.entityType)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const { rows, nextCursor } = await timeEntryService.listTimeEntries(
      auth.workspaceId,
      parsed.data,
    );
    return c.json({
      entries: rows.map(timeEntryService.toTimeEntry),
      nextCursor,
    });
  });

  app.post("/api/v1/time-entries", async (c) => {
    const auth = getAuth(c);
    const parsed = createTimeEntrySchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return c.json({ error: "Invalid time entry", code: "invalid_body" }, 400);
    }
    if (!requireScope(writeScopeForEntity(parsed.data.entityType) as never)(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const row = await timeEntryService.createTimeEntry(
      auth.workspaceId,
      parsed.data,
      {
        userId: auth.userId ?? null,
        contactId: parsed.data.actorContactId ?? null,
      },
    );
    if (!row) return c.json(notFound("Entity"), 404);
    return c.json(timeEntryService.toTimeEntry(row), 201);
  });

  app.get("/api/v1/time-entries/:id", async (c) => {
    const auth = getAuth(c);
    const row = await timeEntryService.getTimeEntry(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!row) return c.json(notFound("Time entry"), 404);
    if (!canReadTime(auth, row.entityType as TimeEntryEntityType)) {
      return c.json(forbidden(), 403);
    }
    return c.json(timeEntryService.toTimeEntry(row));
  });

  app.patch("/api/v1/time-entries/:id", async (c) => {
    const auth = getAuth(c);
    const existing = await timeEntryService.getTimeEntry(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!existing) return c.json(notFound("Time entry"), 404);
    if (
      !requireScope(
        writeScopeForEntity(existing.entityType as TimeEntryEntityType) as never,
      )(auth)
    ) {
      return c.json(forbidden(), 403);
    }
    const parsed = updateTimeEntrySchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return c.json({ error: "Invalid time entry", code: "invalid_body" }, 400);
    }
    const row = await timeEntryService.updateTimeEntry(
      auth.workspaceId,
      existing.id,
      parsed.data,
    );
    if (!row) return c.json(notFound("Time entry"), 404);
    return c.json(timeEntryService.toTimeEntry(row));
  });

  app.post("/api/v1/time-entries/:id/checkpoint", async (c) => {
    const auth = getAuth(c);
    const existing = await timeEntryService.getTimeEntry(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!existing) return c.json(notFound("Time entry"), 404);
    if (existing.endedAt != null) {
      return c.json(
        { error: "Time entry is not open", code: "not_open" as const },
        400,
      );
    }
    if (
      !requireScope(
        writeScopeForEntity(existing.entityType as TimeEntryEntityType) as never,
      )(auth)
    ) {
      return c.json(forbidden(), 403);
    }
    const parsed = checkpointTimeEntrySchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return c.json(
        { error: "Invalid checkpoint body", code: "invalid_body" },
        400,
      );
    }
    const row = await timeEntryService.checkpointOpenFromEntityTotal(
      auth.workspaceId,
      existing.entityType as TimeEntryEntityType,
      existing.entityId,
      parsed.data.durationSeconds,
    );
    if (!row) return c.json(notFound("Time entry"), 404);
    return c.json(timeEntryService.toTimeEntry(row));
  });

  app.post("/api/v1/time-entries/:id/stop", async (c) => {
    const auth = getAuth(c);
    const existing = await timeEntryService.getTimeEntry(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!existing) return c.json(notFound("Time entry"), 404);
    if (
      !requireScope(
        writeScopeForEntity(existing.entityType as TimeEntryEntityType) as never,
      )(auth)
    ) {
      return c.json(forbidden(), 403);
    }
    const parsed = stopTimeEntrySchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return c.json({ error: "Invalid stop body", code: "invalid_body" }, 400);
    }
    const row = await timeEntryService.stopTimeEntryById(
      auth.workspaceId,
      existing.id,
      parsed.data,
    );
    if (!row) return c.json(notFound("Time entry"), 404);
    return c.json(timeEntryService.toTimeEntry(row));
  });

  app.delete("/api/v1/time-entries/:id", async (c) => {
    const auth = getAuth(c);
    const existing = await timeEntryService.getTimeEntry(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!existing) return c.json(notFound("Time entry"), 404);
    if (
      !requireScope(
        writeScopeForEntity(existing.entityType as TimeEntryEntityType) as never,
      )(auth)
    ) {
      return c.json(forbidden(), 403);
    }
    const row = await timeEntryService.deleteTimeEntry(
      auth.workspaceId,
      existing.id,
    );
    if (!row) return c.json(notFound("Time entry"), 404);
    return c.json(timeEntryService.toTimeEntry(row));
  });
}
