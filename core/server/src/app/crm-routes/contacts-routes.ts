import {
  CONTACTS_LIST_PAGINATED_ONLY_KEYS,
  ListQueryError,
  PortalUsernameConflictError,
  buildContactRestPayload,
  buildCrmActivityRestPayload,
  can,
  circleService,
  collectQueryParams,
  commitRestEntityWrite,
  contactLookupQuerySchema,
  contactSchema,
  createCrmActivityNoteSchema,
  createPortalContactLogSchema,
  crmActivitiesService,
  crmActivityFeedQuerySchema,
  crmGroupsService,
  forbidden,
  getAuth,
  ignoredLegacyListKeys,
  isRestLeaderFirstWrite,
  listQueryErrorBody,
  loadCrmActivityRow,
  loadCrmGroupMemberRow,
  newId,
  notFound,
  nudgeContactLive,
  nudgeCrmActivityLive,
  nudgeCrmGroupMemberLive,
  parseContactsListQuery,
  portalAuthLoginSchema,
  portalContactLogsService,
  prepareContactWriteBody,
  proxyErrorStatus,
  recordContactRestSyncEvent,
  recordCrmActivityRestSyncEvent,
  recordCrmGroupMemberRestSyncEvent,
  requireResolvedRef,
  routeContactId,
  toPublicContact,
  verifyPortalPassword,
  zValidator,
} from "../route-deps.js";
import type { Hono } from "../route-deps.js";

/** Contacts CRUD, relations, portal invites, activity and portal logs. */
export function registerContactRoutes(app: Hono) {
  app.post(
    "/api/v1/portal/auth/login",
    zValidator("json", portalAuthLoginSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
      const body = c.req.valid("json");
      const row = await circleService.getContactForPortalLogin(
        auth.workspaceId,
        body.username,
      );
      if (!row?.portalPasswordHash) {
        return c.json(
          { error: "Invalid username or password", code: "unauthorized" },
          401,
        );
      }
      const ok = await verifyPortalPassword(body.password, row.portalPasswordHash);
      if (!ok) {
        return c.json(
          { error: "Invalid username or password", code: "unauthorized" },
          401,
        );
      }
      return c.json({
        contact: toPublicContact(row),
      });
    },
  );

  app.get("/api/v1/contacts", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    const raw = collectQueryParams(new URL(c.req.url));
    let parsed;
    try {
      parsed = parseContactsListQuery(raw);
      parsed = {
        ...parsed,
        organizationId: await requireResolvedRef(
          auth.workspaceId,
          parsed.organizationId,
          "organizationId",
        ),
      };
    } catch (error) {
      if (error instanceof ListQueryError) {
        return c.json(listQueryErrorBody(error), 400);
      }
      throw error;
    }

    if (parsed.mode === "legacy") {
      const ignored = ignoredLegacyListKeys(
        raw,
        CONTACTS_LIST_PAGINATED_ONLY_KEYS,
      );
      if (ignored.length) {
        c.header(
          "X-BacksterOS-Hint",
          `Ignored without paginated=true: ${ignored.join(", ")}. Add paginated=true for { items, nextCursor }.`,
        );
      }
      const rows = await circleService.listContacts(auth.workspaceId, {
        organizationId: parsed.organizationId,
        q: parsed.q,
      });
      return c.json({ contacts: rows.map(toPublicContact) });
    }

    const result = await circleService.listContactsPaginated(
      auth.workspaceId,
      parsed,
    );
    return c.json({
      items: result.items.map(toPublicContact),
      nextCursor: result.nextCursor,
    });
  });
  app.get("/api/v1/contacts/lookup", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    const parsed = contactLookupQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json(
        { error: "Invalid contact lookup query", code: "bad_request" },
        400,
      );
    }
    const row = await circleService.lookupContactByChannel(
      auth.workspaceId,
      parsed.data,
    );
    return c.json({ contact: row ? toPublicContact(row) : null });
  });
  app.get("/api/v1/contacts/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    const contactId = await routeContactId(auth.workspaceId, c.req.param("id"));
    if (!contactId) return c.json(notFound("Contact"), 404);
    const row = await circleService.getContactById(auth.workspaceId, contactId);
    return row ? c.json(toPublicContact(row)) : c.json(notFound("Contact"), 404);
  });
  app.get("/api/v1/contacts/:id/relations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    const contactId = await routeContactId(auth.workspaceId, c.req.param("id"));
    if (!contactId) return c.json(notFound("Contact"), 404);
    const result = await circleService.getContactRelations(auth.workspaceId, contactId);
    return result ? c.json(result) : c.json(notFound("Contact"), 404);
  });
  app.post("/api/v1/contacts", zValidator("json", contactSchema), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
    const body = await prepareContactWriteBody(c.req.valid("json"));
    if (isRestLeaderFirstWrite()) {
      try {
        const contactId = newId();
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "contact",
          entityId: contactId,
          operation: "upsert",
          payload: buildContactRestPayload(contactId, body),
        });
        const row = await circleService.getContactById(auth.workspaceId, contactId);
        if (!row) return c.json({ error: "Contact create failed", code: "internal" }, 500);
        await crmGroupsService.inheritOrganizationGroupMemberships(
          auth.workspaceId,
          row.id,
        );
        nudgeContactLive(auth, row.id, "upsert");
        return c.json(toPublicContact(row), 201);
      } catch (error) {
        if (error instanceof PortalUsernameConflictError) {
          return c.json(
            { error: error.message, code: error.code },
            409,
          );
        }
        throw error;
      }
    }
    try {
      const row = await circleService.createContact(auth.workspaceId, body);
      await recordContactRestSyncEvent(auth.workspaceId, row, "upsert");
      nudgeContactLive(auth, row.id, "upsert");
      for (const member of await crmGroupsService.inheritOrganizationGroupMemberships(
        auth.workspaceId,
        row.id,
      )) {
        const dbRow = await loadCrmGroupMemberRow(auth.workspaceId, member.id);
        if (dbRow) {
          await recordCrmGroupMemberRestSyncEvent(
            auth.workspaceId,
            dbRow,
            "upsert",
          );
          nudgeCrmGroupMemberLive(auth, dbRow.id, "upsert");
        }
      }
      return c.json(toPublicContact(row), 201);
    } catch (error) {
      if (error instanceof PortalUsernameConflictError) {
        return c.json(
          { error: error.message, code: error.code },
          409,
        );
      }
      throw error;
    }
  });
  app.patch("/api/v1/contacts/:id", zValidator("json", contactSchema.partial()), async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
    const contactIdRaw = c.req.param("id");
    const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
    if (!contactId) return c.json(notFound("Contact"), 404);
    const raw = c.req.valid("json") as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(raw, "portalPassword")) {
      console.info(
        `[portal-password] PATCH contact=${contactId} includesPassword=${raw.portalPassword !== undefined && raw.portalPassword !== null} clear=${raw.portalPassword === "" || raw.portalPassword === null}`,
      );
    }
    const patch = await prepareContactWriteBody(raw);
    if (isRestLeaderFirstWrite()) {
      try {
        const existing = await circleService.getContactById(auth.workspaceId, contactId);
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "contact",
          entityId: contactId,
          operation: "upsert",
          payload: buildContactRestPayload(
            contactId,
            existing ? patch : { ...patch, firstName: patch.firstName ?? patch.name ?? "Contact" },
          ),
        });
        const row = await circleService.getContactById(auth.workspaceId, contactId);
        if (row && patch.organizationId !== undefined) {
          await crmGroupsService.inheritOrganizationGroupMemberships(
            auth.workspaceId,
            row.id,
          );
        }
        if (row) nudgeContactLive(auth, row.id, "upsert");
        return row ? c.json(toPublicContact(row)) : c.json(notFound("Contact"), 404);
      } catch (error) {
        if (error instanceof PortalUsernameConflictError) {
          return c.json(
            { error: error.message, code: error.code },
            409,
          );
        }
        throw error;
      }
    }
    let row: Awaited<ReturnType<typeof circleService.updateContact>>;
    try {
      row = await circleService.updateContact(auth.workspaceId, contactId, patch);
      if (!row) {
        // Heal local-only PowerSync contacts that never uploaded: create with the
        // client id so membership / relationship writes can proceed.
        try {
          row = await circleService.createContact(
            auth.workspaceId,
            {
              ...patch,
              firstName:
                patch.firstName ??
                (typeof patch.name === "string" ? patch.name : null) ??
                "Contact",
            } as Parameters<typeof circleService.createContact>[1],
            contactId,
          );
        } catch (error) {
          if (error instanceof PortalUsernameConflictError) throw error;
          return c.json(notFound("Contact"), 404);
        }
      }
    } catch (error) {
      if (error instanceof PortalUsernameConflictError) {
        return c.json(
          { error: error.message, code: error.code },
          409,
        );
      }
      throw error;
    }
    await recordContactRestSyncEvent(auth.workspaceId, row, "upsert");
    nudgeContactLive(auth, row.id, "upsert");
    if (patch.organizationId !== undefined) {
      for (const member of await crmGroupsService.inheritOrganizationGroupMemberships(
        auth.workspaceId,
        row.id,
      )) {
        const dbRow = await loadCrmGroupMemberRow(auth.workspaceId, member.id);
        if (dbRow) {
          await recordCrmGroupMemberRestSyncEvent(
            auth.workspaceId,
            dbRow,
            "upsert",
          );
          nudgeCrmGroupMemberLive(auth, dbRow.id, "upsert");
        }
      }
    }
    return c.json(toPublicContact(row));
  });
  app.post("/api/v1/contacts/:id/send-portal-password-reset", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
    const contactIdRaw = c.req.param("id");
    const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
    if (!contactId) return c.json(notFound("Contact"), 404);
    const row = await circleService.getContactById(auth.workspaceId, contactId);
    if (!row) return c.json(notFound("Contact"), 404);
    const { sendPortalPasswordResetViaPortal } = await import(
      "../../lib/portal-password-reset-proxy.js"
    );
    const result = await sendPortalPasswordResetViaPortal(contactId);
    if (!result.ok) {
      return c.json(
        { error: result.error, code: "portal_password_reset_failed" },
        proxyErrorStatus(result.status),
      );
    }
    return c.json({
      ok: true,
      email: result.email,
      message: result.message,
    });
  });
  app.post("/api/v1/contacts/:id/send-portal-invite", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
    const contactIdRaw = c.req.param("id");
    const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
    if (!contactId) return c.json(notFound("Contact"), 404);
    const row = await circleService.getContactById(auth.workspaceId, contactId);
    if (!row) return c.json(notFound("Contact"), 404);
    const { sendPortalInviteViaPortal } = await import(
      "../../lib/portal-password-reset-proxy.js"
    );
    const result = await sendPortalInviteViaPortal(contactId);
    if (!result.ok) {
      return c.json(
        { error: result.error, code: "portal_invite_failed" },
        proxyErrorStatus(result.status),
      );
    }
    return c.json({
      ok: true,
      email: result.email,
      message: result.message,
    });
  });
  app.delete("/api/v1/contacts/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
    const contactIdRaw = c.req.param("id");
    const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
    if (!contactId) return c.json(notFound("Contact"), 404);
    if (isRestLeaderFirstWrite()) {
      const existing = await circleService.getContactById(auth.workspaceId, contactId);
      if (!existing) return c.json(notFound("Contact"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "contact",
        entityId: contactId,
        operation: "delete",
        payload: { id: contactId },
      });
      nudgeContactLive(auth, contactId, "delete");
      return c.body(null, 204);
    }
    const row = await circleService.deleteContact(auth.workspaceId, contactId);
    if (!row) return c.json(notFound("Contact"), 404);
    await recordContactRestSyncEvent(auth.workspaceId, row, "delete");
    nudgeContactLive(auth, row.id, "delete");
    return c.body(null, 204);
  });

  app.get("/api/v1/contacts/:id/activity", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    const contactIdRaw = c.req.param("id");
    const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
    if (!contactId) return c.json(notFound("Contact"), 404);
    const contact = await circleService.getContactById(
      auth.workspaceId,
      contactId,
    );
    if (!contact) return c.json(notFound("Contact"), 404);
    const query = crmActivityFeedQuerySchema.parse({
      cursor: c.req.query("cursor"),
      limit: c.req.query("limit"),
    });
    const feed = await crmActivitiesService.listCrmActivityFeed(
      auth.workspaceId,
      { subjectType: "contact", subjectId: contact.id },
      query,
    );
    return c.json(feed);
  });
  app.get("/api/v1/contacts/:id/portal-logs", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    const contactIdRaw = c.req.param("id");
    const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
    if (!contactId) return c.json(notFound("Contact"), 404);
    const contact = await circleService.getContactById(auth.workspaceId, contactId);
    if (!contact) return c.json(notFound("Contact"), 404);
    const rawLimit = c.req.query("limit");
    const parsedLimit =
      rawLimit != null ? Number.parseInt(String(rawLimit), 10) : undefined;
    const logs = await portalContactLogsService.listPortalContactLogs(
      auth.workspaceId,
      contactId,
      {
        limit:
          parsedLimit != null && Number.isFinite(parsedLimit)
            ? parsedLimit
            : undefined,
      },
    );
    return c.json({ logs });
  });
  app.post(
    "/api/v1/contacts/:id/portal-logs",
    zValidator("json", createPortalContactLogSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
      const contactIdRaw = c.req.param("id");
      const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
      if (!contactId) return c.json(notFound("Contact"), 404);
      const contact = await circleService.getContactById(
        auth.workspaceId,
        contactId,
      );
      if (!contact) return c.json(notFound("Contact"), 404);
      if (!contact.portalUsername?.trim()) {
        return c.json(
          {
            error: "Contact has no portal account",
            code: "portal_account_missing",
          },
          400,
        );
      }
      const body = c.req.valid("json");
      if (body.kind === "project_view" && !body.projectId?.trim()) {
        return c.json(
          { error: "projectId is required for project_view", code: "invalid" },
          400,
        );
      }
      const log = await portalContactLogsService.appendPortalContactLog(
        auth.workspaceId,
        contactId,
        body,
      );
      return c.json(log, 201);
    },
  );
  app.post(
    "/api/v1/contacts/:id/activity",
    zValidator("json", createCrmActivityNoteSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:write")) return c.json(forbidden(), 403);
      const contactIdRaw = c.req.param("id");
      const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
      if (!contactId) return c.json(notFound("Contact"), 404);
      const contact = await circleService.getContactById(
        auth.workspaceId,
        contactId,
      );
      if (!contact) return c.json(notFound("Contact"), 404);
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
              "contact",
              contact.id,
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
          { subjectType: "contact", subjectId: contact.id },
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
