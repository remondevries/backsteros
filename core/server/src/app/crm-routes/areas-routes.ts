import {
  areaSchema,
  buildAreaRestPayload,
  can,
  circleService,
  commitRestEntityWrite,
  forbidden,
  getAuth,
  isRestLeaderFirstWrite,
  newId,
  notFound,
  nudgePeerEntityLive,
  recordAreaRestSyncEvent,
  toArea,
  zValidator,
} from "../route-deps.js";
import type { Hono } from "../route-deps.js";

/** Areas CRUD. */
export function registerAreaRoutes(app: Hono) {
  app.get("/api/v1/areas", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "projects:read")) return c.json(forbidden(), 403);
    const rows = await circleService.listAreas(auth.workspaceId);
    return c.json({ areas: rows.map(toArea) });
  });
  app.get("/api/v1/areas/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "projects:read")) return c.json(forbidden(), 403);
    const row = await circleService.getAreaById(auth.workspaceId, c.req.param("id"));
    return row ? c.json(toArea(row)) : c.json(notFound("Area"), 404);
  });
  app.post("/api/v1/areas", zValidator("json", areaSchema), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "projects:write")) return c.json(forbidden(), 403);
    const body = c.req.valid("json");
    if (isRestLeaderFirstWrite()) {
      const areaId = newId();
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "area",
        entityId: areaId,
        operation: "upsert",
        payload: buildAreaRestPayload(areaId, body),
      });
      const row = await circleService.getAreaById(auth.workspaceId, areaId);
      if (!row) {
        return c.json({ error: "Area create failed", code: "internal" }, 500);
      }
      nudgePeerEntityLive(auth, "area", row.id, "upsert");
      return c.json(toArea(row), 201);
    }
    const row = await circleService.createArea(auth.workspaceId, body);
    await recordAreaRestSyncEvent(auth.workspaceId, row, "upsert");
    nudgePeerEntityLive(auth, "area", row.id, "upsert");
    return c.json(toArea(row), 201);
  });
  app.patch("/api/v1/areas/:id", zValidator("json", areaSchema.partial()), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "projects:write")) return c.json(forbidden(), 403);
    const areaId = c.req.param("id");
    const patch = c.req.valid("json");
    if (isRestLeaderFirstWrite()) {
      const existing = await circleService.getAreaById(auth.workspaceId, areaId);
      if (!existing) return c.json(notFound("Area"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "area",
        entityId: areaId,
        operation: "upsert",
        payload: buildAreaRestPayload(areaId, patch),
      });
      const row = await circleService.getAreaById(auth.workspaceId, areaId);
      if (!row) return c.json(notFound("Area"), 404);
      nudgePeerEntityLive(auth, "area", row.id, "upsert");
      return c.json(toArea(row));
    }
    const row = await circleService.updateArea(auth.workspaceId, areaId, patch);
    if (!row) return c.json(notFound("Area"), 404);
    await recordAreaRestSyncEvent(auth.workspaceId, row, "upsert");
    nudgePeerEntityLive(auth, "area", row.id, "upsert");
    return c.json(toArea(row));
  });
  app.delete("/api/v1/areas/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "projects:write")) return c.json(forbidden(), 403);
    const areaId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await circleService.getAreaById(auth.workspaceId, areaId);
      if (!existing) return c.json(notFound("Area"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "area",
        entityId: areaId,
        operation: "delete",
        payload: { id: areaId, deleted_at: new Date().toISOString() },
      });
      nudgePeerEntityLive(auth, "area", areaId, "delete");
      return c.body(null, 204);
    }
    const row = await circleService.deleteArea(auth.workspaceId, areaId);
    if (!row) return c.json(notFound("Area"), 404);
    await recordAreaRestSyncEvent(auth.workspaceId, row, "delete");
    nudgePeerEntityLive(auth, "area", row.id, "delete");
    return c.body(null, 204);
  });
}
