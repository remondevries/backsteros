import {
  buildContactRelationshipRestPayload,
  buildCrmRelationshipLabelRestPayload,
  can,
  commitRestEntityWrite,
  contactRelationshipInputSchema,
  crmGroupsService,
  crmRelationshipLabelInputSchema,
  crmRelationshipLabelsService,
  forbidden,
  getAuth,
  isRestLeaderFirstWrite,
  loadContactRelationshipRow,
  loadCrmRelationshipLabelRow,
  newId,
  notFound,
  nudgeContactRelationshipLive,
  nudgeCrmRelationshipLabelLive,
  recordContactRelationshipRestSyncEvent,
  recordCrmRelationshipLabelRestSyncEvent,
  routeContactId,
  updateContactRelationshipSchema,
  updateCrmRelationshipLabelSchema,
  zValidator,
} from "../route-deps.js";
import type { Hono } from "../route-deps.js";

/** Contact relationships and relationship labels. */
export function registerCrmRelationshipRoutes(app: Hono) {
  app.get("/api/v1/contacts/:id/relationships", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    const contactIdRaw = c.req.param("id");
    const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
    if (!contactId) return c.json(notFound("Contact"), 404);
    const result = await crmGroupsService.listContactRelationships(
      auth.workspaceId,
      contactId,
    );
    return result
      ? c.json({ relationships: result })
      : c.json(notFound("Contact"), 404);
  });
  app.post(
    "/api/v1/contacts/:id/relationships",
    zValidator("json", contactRelationshipInputSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
      const fromContactIdRaw = c.req.param("id");
      const fromContactId = await routeContactId(auth.workspaceId, fromContactIdRaw);
      if (!fromContactId) return c.json(notFound("Contact"), 404);
      const body = c.req.valid("json");
      try {
        if (isRestLeaderFirstWrite()) {
          const relationshipId = newId();
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "contact_relationship",
            entityId: relationshipId,
            operation: "upsert",
            payload: buildContactRelationshipRestPayload(
              relationshipId,
              fromContactId,
              body,
            ),
          });
          const row = await crmGroupsService.getContactRelationshipById(
            auth.workspaceId,
            relationshipId,
          );
          if (!row) {
            return c.json(
              { error: "Relationship create failed", code: "internal" },
              500,
            );
          }
          return c.json(row, 201);
        }
        const row = await crmGroupsService.createContactRelationship(
          auth.workspaceId,
          fromContactId,
          body,
        );
        const dbRow = await loadContactRelationshipRow(auth.workspaceId, row.id);
        if (dbRow) {
          await recordContactRelationshipRestSyncEvent(
            auth.workspaceId,
            dbRow,
            "upsert",
          );
          nudgeContactRelationshipLive(auth, dbRow.id, "upsert");
        }
        return c.json(row, 201);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        if (error.message === "CONTACT_NOT_FOUND") {
          return c.json(notFound("Contact"), 404);
        }
        if (error.message === "RELATED_CONTACT_NOT_FOUND") {
          return c.json(notFound("Related contact"), 404);
        }
        if (
          error.message === "SELF_RELATIONSHIP" ||
          error.message === "RELATIONSHIP_EXISTS"
        ) {
          return c.json(
            {
              error: {
                code: error.message,
                message:
                  error.message === "SELF_RELATIONSHIP"
                    ? "A contact cannot relate to itself."
                    : "Relationship already exists.",
              },
            },
            400,
          );
        }
        throw error;
      }
    },
  );
  app.patch(
    "/api/v1/contact-relationships/:id",
    zValidator("json", updateContactRelationshipSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
      const relationshipId = c.req.param("id");
      const patch = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const existing = await crmGroupsService.getContactRelationshipById(
          auth.workspaceId,
          relationshipId,
        );
        if (!existing) return c.json(notFound("Relationship"), 404);
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "contact_relationship",
          entityId: relationshipId,
          operation: "upsert",
          payload: buildContactRelationshipRestPayload(
            relationshipId,
            existing.fromContactId,
            patch,
          ),
        });
        const row = await crmGroupsService.getContactRelationshipById(
          auth.workspaceId,
          relationshipId,
        );
        return row ? c.json(row) : c.json(notFound("Relationship"), 404);
      }
      const row = await crmGroupsService.updateContactRelationship(
        auth.workspaceId,
        relationshipId,
        patch,
      );
      if (!row) return c.json(notFound("Relationship"), 404);
      const dbRow = await loadContactRelationshipRow(
        auth.workspaceId,
        relationshipId,
      );
      if (dbRow) {
        await recordContactRelationshipRestSyncEvent(
          auth.workspaceId,
          dbRow,
          "upsert",
        );
        nudgeContactRelationshipLive(auth, dbRow.id, "upsert");
      }
      return c.json(row);
    },
  );
  app.delete("/api/v1/contact-relationships/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
    const relationshipId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await crmGroupsService.getContactRelationshipById(
        auth.workspaceId,
        relationshipId,
      );
      if (!existing) return c.json(notFound("Relationship"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "contact_relationship",
        entityId: relationshipId,
        operation: "delete",
        payload: { id: relationshipId },
      });
      return c.body(null, 204);
    }
    const ok = await crmGroupsService.deleteContactRelationship(
      auth.workspaceId,
      relationshipId,
    );
    if (!ok) return c.json(notFound("Relationship"), 404);
    const dbRow = await loadContactRelationshipRow(
      auth.workspaceId,
      relationshipId,
    );
    if (dbRow) {
      await recordContactRelationshipRestSyncEvent(
        auth.workspaceId,
        dbRow,
        "delete",
      );
      nudgeContactRelationshipLive(auth, dbRow.id, "delete");
    }
    return c.body(null, 204);
  });

  app.get("/api/v1/crm-relationship-labels", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    return c.json({
      labels: await crmRelationshipLabelsService.listCrmRelationshipLabels(
        auth.workspaceId,
      ),
    });
  });

  app.post(
    "/api/v1/crm-relationship-labels",
    zValidator("json", crmRelationshipLabelInputSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
      const body = c.req.valid("json");
      try {
        if (isRestLeaderFirstWrite()) {
          const labelId = newId();
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "crm_relationship_label",
            entityId: labelId,
            operation: "upsert",
            payload: buildCrmRelationshipLabelRestPayload(labelId, body),
          });
          const row =
            await crmRelationshipLabelsService.getCrmRelationshipLabelById(
              auth.workspaceId,
              labelId,
            );
          if (!row) {
            return c.json(
              { error: "Label create failed", code: "internal" },
              500,
            );
          }
          return c.json(row, 201);
        }
        const row =
          await crmRelationshipLabelsService.createCrmRelationshipLabel(
            auth.workspaceId,
            body,
          );
        const dbRow = await loadCrmRelationshipLabelRow(auth.workspaceId, row.id);
        if (dbRow) {
          await recordCrmRelationshipLabelRestSyncEvent(
            auth.workspaceId,
            dbRow,
            "upsert",
          );
          nudgeCrmRelationshipLabelLive(auth, dbRow.id, "upsert");
        }
        return c.json(row, 201);
      } catch (err) {
        if (err instanceof Error && err.message === "LABEL_SLUG_CONFLICT") {
          return c.json({ error: "Label slug already exists" }, 409);
        }
        if (err instanceof Error && err.message === "INVALID_LABEL") {
          return c.json({ error: "Invalid label" }, 400);
        }
        throw err;
      }
    },
  );

  app.patch(
    "/api/v1/crm-relationship-labels/:id",
    zValidator("json", updateCrmRelationshipLabelSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
      const labelId = c.req.param("id");
      const patch = c.req.valid("json");
      try {
        if (isRestLeaderFirstWrite()) {
          const existing =
            await crmRelationshipLabelsService.getCrmRelationshipLabelById(
              auth.workspaceId,
              labelId,
            );
          if (!existing) return c.json(notFound("Relationship label"), 404);
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "crm_relationship_label",
            entityId: labelId,
            operation: "upsert",
            payload: buildCrmRelationshipLabelRestPayload(labelId, patch),
          });
          const row =
            await crmRelationshipLabelsService.getCrmRelationshipLabelById(
              auth.workspaceId,
              labelId,
            );
          return row ? c.json(row) : c.json(notFound("Relationship label"), 404);
        }
        const row =
          await crmRelationshipLabelsService.updateCrmRelationshipLabel(
            auth.workspaceId,
            labelId,
            patch,
          );
        if (!row) return c.json(notFound("Relationship label"), 404);
        const dbRow = await loadCrmRelationshipLabelRow(auth.workspaceId, labelId);
        if (dbRow) {
          await recordCrmRelationshipLabelRestSyncEvent(
            auth.workspaceId,
            dbRow,
            "upsert",
          );
          nudgeCrmRelationshipLabelLive(auth, dbRow.id, "upsert");
        }
        return c.json(row);
      } catch (err) {
        if (err instanceof Error && err.message === "LABEL_SLUG_CONFLICT") {
          return c.json({ error: "Label slug already exists" }, 409);
        }
        if (err instanceof Error && err.message === "INVALID_LABEL") {
          return c.json({ error: "Invalid label" }, 400);
        }
        throw err;
      }
    },
  );

  app.delete("/api/v1/crm-relationship-labels/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
    const labelId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing =
        await crmRelationshipLabelsService.getCrmRelationshipLabelById(
          auth.workspaceId,
          labelId,
        );
      if (!existing) return c.json(notFound("Relationship label"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "crm_relationship_label",
        entityId: labelId,
        operation: "delete",
        payload: { id: labelId },
      });
      return c.body(null, 204);
    }
    const ok = await crmRelationshipLabelsService.deleteCrmRelationshipLabel(
      auth.workspaceId,
      labelId,
    );
    if (!ok) return c.json(notFound("Relationship label"), 404);
    const dbRow = await loadCrmRelationshipLabelRow(auth.workspaceId, labelId);
    if (dbRow) {
      await recordCrmRelationshipLabelRestSyncEvent(
        auth.workspaceId,
        dbRow,
        "delete",
      );
      nudgeCrmRelationshipLabelLive(auth, dbRow.id, "delete");
    }
    return c.body(null, 204);
  });
}
