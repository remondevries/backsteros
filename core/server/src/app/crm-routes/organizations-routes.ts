import {
  ListQueryError,
  ORGANIZATIONS_LIST_PAGINATED_ONLY_KEYS,
  buildCrmActivityRestPayload,
  buildOrganizationRestPayload,
  can,
  circleService,
  collectQueryParams,
  commitRestEntityWrite,
  createCrmActivityNoteSchema,
  crmActivitiesService,
  crmActivityFeedQuerySchema,
  forbidden,
  getAuth,
  ignoredLegacyListKeys,
  isRestLeaderFirstWrite,
  listQueryErrorBody,
  loadCrmActivityRow,
  newId,
  notFound,
  nudgeCrmActivityLive,
  nudgeOrganizationLive,
  organizationSchema,
  parseOrganizationsListQuery,
  recordCrmActivityRestSyncEvent,
  recordOrganizationRestSyncEvent,
  routeOrganizationId,
  zValidator,
} from "../route-deps.js";
import type { Hono } from "../route-deps.js";

/** Organizations CRUD, relations and activity. */
export function registerOrganizationRoutes(app: Hono) {
  app.get("/api/v1/organizations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:read")) return c.json(forbidden(), 403);
    const raw = collectQueryParams(new URL(c.req.url));
    let parsed;
    try {
      parsed = parseOrganizationsListQuery(raw);
    } catch (error) {
      if (error instanceof ListQueryError) {
        return c.json(listQueryErrorBody(error), 400);
      }
      throw error;
    }

    if (parsed.mode === "legacy") {
      const ignored = ignoredLegacyListKeys(
        raw,
        ORGANIZATIONS_LIST_PAGINATED_ONLY_KEYS,
      );
      if (ignored.length) {
        c.header(
          "X-BacksterOS-Hint",
          `Ignored without paginated=true: ${ignored.join(", ")}. Add paginated=true for { items, nextCursor }.`,
        );
      }
      return c.json({
        organizations: await circleService.listOrganizations(auth.workspaceId, {
          q: parsed.q,
        }),
      });
    }

    return c.json(
      await circleService.listOrganizationsPaginated(auth.workspaceId, parsed),
    );
  });
  app.get("/api/v1/organizations/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:read")) return c.json(forbidden(), 403);
    const organizationId = await routeOrganizationId(auth.workspaceId, c.req.param("id"));
    if (!organizationId) return c.json(notFound("Organization"), 404);
    const row = await circleService.getOrganizationById(auth.workspaceId, organizationId);
    return row ? c.json(row) : c.json(notFound("Organization"), 404);
  });
  app.get("/api/v1/organizations/:id/relations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:read")) return c.json(forbidden(), 403);
    const organizationId = await routeOrganizationId(auth.workspaceId, c.req.param("id"));
    if (!organizationId) return c.json(notFound("Organization"), 404);
    const result = await circleService.getOrganizationRelations(auth.workspaceId, organizationId);
    return result ? c.json(result) : c.json(notFound("Organization"), 404);
  });
  app.post("/api/v1/organizations", zValidator("json", organizationSchema), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:write")) return c.json(forbidden(), 403);
    const body = c.req.valid("json");
    if (isRestLeaderFirstWrite()) {
      const organizationId = newId();
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "organization",
        entityId: organizationId,
        operation: "upsert",
        payload: buildOrganizationRestPayload(organizationId, body),
      });
      const row = await circleService.getOrganizationById(
        auth.workspaceId,
        organizationId,
      );
      if (!row) return c.json({ error: "Organization create failed", code: "internal" }, 500);
      return c.json(row, 201);
    }
    const row = await circleService.createOrganization(auth.workspaceId, body);
    await recordOrganizationRestSyncEvent(auth.workspaceId, row, "upsert");
    nudgeOrganizationLive(auth, row.id, "upsert");
    return c.json(row, 201);
  });
  app.patch("/api/v1/organizations/:id", zValidator("json", organizationSchema.partial()), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:write")) return c.json(forbidden(), 403);
    const organizationIdRaw = c.req.param("id");
    const organizationId = await routeOrganizationId(auth.workspaceId, organizationIdRaw);
    if (!organizationId) return c.json(notFound("Organization"), 404);
    const patch = c.req.valid("json");
    if (isRestLeaderFirstWrite()) {
      const existing = await circleService.getOrganizationById(
        auth.workspaceId,
        organizationId,
      );
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "organization",
        entityId: organizationId,
        operation: "upsert",
        payload: buildOrganizationRestPayload(
          organizationId,
          existing
            ? patch
            : { ...patch, name: patch.name ?? "Organization" },
        ),
      });
      const row = await circleService.getOrganizationById(
        auth.workspaceId,
        organizationId,
      );
      return row ? c.json(row) : c.json(notFound("Organization"), 404);
    }
    let row = await circleService.updateOrganization(
      auth.workspaceId,
      organizationId,
      patch,
    );
    if (!row) {
      try {
        row = await circleService.createOrganization(
          auth.workspaceId,
          {
            ...patch,
            name: patch.name ?? "Organization",
          } as Parameters<typeof circleService.createOrganization>[1],
          organizationId,
        );
      } catch {
        return c.json(notFound("Organization"), 404);
      }
    }
    await recordOrganizationRestSyncEvent(auth.workspaceId, row, "upsert");
    nudgeOrganizationLive(auth, row.id, "upsert");
    return c.json(row);
  });
  app.delete("/api/v1/organizations/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:write")) return c.json(forbidden(), 403);
    const organizationIdRaw = c.req.param("id");
    const organizationId = await routeOrganizationId(auth.workspaceId, organizationIdRaw);
    if (!organizationId) return c.json(notFound("Organization"), 404);
    if (isRestLeaderFirstWrite()) {
      const existing = await circleService.getOrganizationById(
        auth.workspaceId,
        organizationId,
      );
      if (!existing) return c.json(notFound("Organization"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "organization",
        entityId: organizationId,
        operation: "delete",
        payload: { id: organizationId },
      });
      return c.body(null, 204);
    }
    const row = await circleService.deleteOrganization(auth.workspaceId, organizationId);
    if (!row) return c.json(notFound("Organization"), 404);
    await recordOrganizationRestSyncEvent(auth.workspaceId, row, "delete");
    nudgeOrganizationLive(auth, row.id, "delete");
    return c.body(null, 204);
  });
  app.get("/api/v1/organizations/:id/activity", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:read")) return c.json(forbidden(), 403);
    const organizationIdRaw = c.req.param("id");
    const organizationId = await routeOrganizationId(auth.workspaceId, organizationIdRaw);
    if (!organizationId) return c.json(notFound("Organization"), 404);
    const organization = await circleService.getOrganizationById(
      auth.workspaceId,
      organizationId,
    );
    if (!organization) return c.json(notFound("Organization"), 404);
    const query = crmActivityFeedQuerySchema.parse({
      cursor: c.req.query("cursor"),
      limit: c.req.query("limit"),
    });
    const feed = await crmActivitiesService.listCrmActivityFeed(
      auth.workspaceId,
      { subjectType: "organization", subjectId: organization.id },
      query,
    );
    return c.json(feed);
  });
  app.post(
    "/api/v1/organizations/:id/activity",
    zValidator("json", createCrmActivityNoteSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "organizations:write")) return c.json(forbidden(), 403);
      const organizationIdRaw = c.req.param("id");
      const organizationId = await routeOrganizationId(auth.workspaceId, organizationIdRaw);
      if (!organizationId) return c.json(notFound("Organization"), 404);
      const organization = await circleService.getOrganizationById(
        auth.workspaceId,
        organizationId,
      );
      if (!organization) return c.json(notFound("Organization"), 404);
      const body = c.req.valid("json");
      try {
        if (isRestLeaderFirstWrite()) {
          const activityId = newId();
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "crm_activity",
            entityId: activityId,
            operation: "upsert",
            payload: buildCrmActivityRestPayload(
              activityId,
              "organization",
              organization.id,
              body,
              auth.userId ?? null,
            ),
          });
          const row = await crmActivitiesService.getCrmActivityById(
            auth.workspaceId,
            activityId,
          );
          if (!row) {
            return c.json(
              { error: "Activity create failed", code: "internal" },
              500,
            );
          }
          nudgeCrmActivityLive(auth, row.id, "upsert");
          return c.json(row, 201);
        }
        const row = await crmActivitiesService.createCrmActivityNote(
          auth.workspaceId,
          { subjectType: "organization", subjectId: organization.id },
          body,
          auth.userId ?? null,
        );
        const dbRow = await loadCrmActivityRow(auth.workspaceId, row.id);
        if (dbRow) {
          await recordCrmActivityRestSyncEvent(auth.workspaceId, dbRow, "upsert");
        }
        nudgeCrmActivityLive(auth, row.id, "upsert");
        return c.json(row, 201);
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === "INVALID_NOTE_BODY" ||
            error.message === "INVALID_OCCURRED_AT")
        ) {
          return c.json(
            {
              error: {
                code: error.message,
                message: "Invalid note activity payload.",
              },
            },
            400,
          );
        }
        throw error;
      }
    },
  );
}
