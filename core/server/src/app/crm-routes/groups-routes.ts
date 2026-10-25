import {
  buildCrmGroupMemberRestPayload,
  buildCrmGroupRestPayload,
  can,
  circleService,
  commitRestEntityWrite,
  crmGroupInputSchema,
  crmGroupMemberInputSchema,
  crmGroupsService,
  forbidden,
  getAuth,
  isRestLeaderFirstWrite,
  loadCrmGroupMemberRow,
  loadCrmGroupRow,
  newId,
  notFound,
  nudgeCrmGroupLive,
  nudgeCrmGroupMemberLive,
  recordCrmGroupMemberRestSyncEvent,
  recordCrmGroupRestSyncEvent,
  routeContactId,
  routeOrganizationId,
  updateCrmGroupSchema,
  zValidator,
} from "../route-deps.js";
import type { Hono } from "../route-deps.js";

/** CRM groups and memberships. */
export function registerCrmGroupRoutes(app: Hono) {
  app.get("/api/v1/crm-groups", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read") && !can(auth, "organizations:read")) {
      return c.json(forbidden(), 403);
    }
    return c.json({
      groups: await crmGroupsService.listCrmGroups(auth.workspaceId),
    });
  });
  app.get("/api/v1/crm-groups/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read") && !can(auth, "organizations:read")) {
      return c.json(forbidden(), 403);
    }
    const row = await crmGroupsService.getCrmGroupById(
      auth.workspaceId,
      c.req.param("id"),
    );
    return row ? c.json(row) : c.json(notFound("Group"), 404);
  });
  app.post(
    "/api/v1/crm-groups",
    zValidator("json", crmGroupInputSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:write") && !can(auth, "organizations:write")) {
        return c.json(forbidden(), 403);
      }
      const body = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const groupId = newId();
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "crm_group",
          entityId: groupId,
          operation: "upsert",
          payload: buildCrmGroupRestPayload(groupId, body),
        });
        const row = await crmGroupsService.getCrmGroupById(
          auth.workspaceId,
          groupId,
        );
        if (!row) {
          return c.json({ error: "Group create failed", code: "internal" }, 500);
        }
        return c.json(row, 201);
      }
      const row = await crmGroupsService.createCrmGroup(auth.workspaceId, body);
      const dbRow = await loadCrmGroupRow(auth.workspaceId, row.id);
      if (dbRow) {
        await recordCrmGroupRestSyncEvent(auth.workspaceId, dbRow, "upsert");
      }
      nudgeCrmGroupLive(auth, row.id, "upsert");
      return c.json(row, 201);
    },
  );
  app.patch(
    "/api/v1/crm-groups/:id",
    zValidator("json", updateCrmGroupSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:write") && !can(auth, "organizations:write")) {
        return c.json(forbidden(), 403);
      }
      const groupId = c.req.param("id");
      const patch = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const existing = await crmGroupsService.getCrmGroupById(
          auth.workspaceId,
          groupId,
        );
        if (!existing) return c.json(notFound("Group"), 404);
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "crm_group",
          entityId: groupId,
          operation: "upsert",
          payload: buildCrmGroupRestPayload(groupId, patch),
        });
        const row = await crmGroupsService.getCrmGroupById(
          auth.workspaceId,
          groupId,
        );
        return row ? c.json(row) : c.json(notFound("Group"), 404);
      }
      const row = await crmGroupsService.updateCrmGroup(
        auth.workspaceId,
        groupId,
        patch,
      );
      if (!row) return c.json(notFound("Group"), 404);
      const dbRow = await loadCrmGroupRow(auth.workspaceId, groupId);
      if (dbRow) {
        await recordCrmGroupRestSyncEvent(auth.workspaceId, dbRow, "upsert");
      }
      nudgeCrmGroupLive(auth, groupId, "upsert");
      return c.json(row);
    },
  );
  app.delete("/api/v1/crm-groups/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write") && !can(auth, "organizations:write")) {
      return c.json(forbidden(), 403);
    }
    const groupId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await crmGroupsService.getCrmGroupById(
        auth.workspaceId,
        groupId,
      );
      if (!existing) return c.json(notFound("Group"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "crm_group",
        entityId: groupId,
        operation: "delete",
        payload: { id: groupId },
      });
      return c.body(null, 204);
    }
    const ok = await crmGroupsService.deleteCrmGroup(auth.workspaceId, groupId);
    if (!ok) return c.json(notFound("Group"), 404);
    const dbRow = await loadCrmGroupRow(auth.workspaceId, groupId);
    if (dbRow) {
      await recordCrmGroupRestSyncEvent(auth.workspaceId, dbRow, "delete");
    }
    nudgeCrmGroupLive(auth, groupId, "delete");
    return c.body(null, 204);
  });
  app.get("/api/v1/crm-groups/:id/members", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read") && !can(auth, "organizations:read")) {
      return c.json(forbidden(), 403);
    }
    const members = await crmGroupsService.listCrmGroupMembers(
      auth.workspaceId,
      c.req.param("id"),
    );
    return members
      ? c.json({ members })
      : c.json(notFound("Group"), 404);
  });
  app.post(
    "/api/v1/crm-groups/:id/members",
    zValidator("json", crmGroupMemberInputSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "contacts:write") && !can(auth, "organizations:write")) {
        return c.json(forbidden(), 403);
      }
      const groupId = c.req.param("id");
      const body = c.req.valid("json");
      try {
        if (isRestLeaderFirstWrite()) {
          if (!(await crmGroupsService.getCrmGroupById(auth.workspaceId, groupId))) {
            return c.json(notFound("Group"), 404);
          }

          const planned = await crmGroupsService.planCrmGroupMembershipCascade(
            auth.workspaceId,
            body,
          );
          let primary: Awaited<
            ReturnType<typeof crmGroupsService.getCrmGroupMemberById>
          > = null;

          for (const subject of planned) {
            const isPrimary =
              subject.subjectType === body.subjectType &&
              subject.subjectId === body.subjectId;

            // Skip cascade targets that are not on this core yet; fail only if
            // the subject the user actually selected is missing.
            if (subject.subjectType === "contact") {
              const contact = await circleService.getContactById(
                auth.workspaceId,
                subject.subjectId,
              );
              if (!contact) {
                if (isPrimary) {
                  return c.json(notFound("Member subject"), 404);
                }
                continue;
              }
            } else {
              const organization = await circleService.getOrganizationById(
                auth.workspaceId,
                subject.subjectId,
              );
              if (!organization) {
                if (isPrimary) {
                  return c.json(notFound("Member subject"), 404);
                }
                continue;
              }
            }

            const currentMembers = await crmGroupsService.listCrmGroupMembers(
              auth.workspaceId,
              groupId,
            );
            const already = currentMembers?.find(
              (member) =>
                member.subjectType === subject.subjectType &&
                member.subjectId === subject.subjectId,
            );
            if (already) {
              if (isPrimary) primary = already;
              continue;
            }

            const memberId = newId();
            await commitRestEntityWrite({
              workspaceId: auth.workspaceId,
              entity: "crm_group_member",
              entityId: memberId,
              operation: "upsert",
              payload: buildCrmGroupMemberRestPayload(memberId, groupId, subject),
            });
            const row =
              (await crmGroupsService.getCrmGroupMemberById(
                auth.workspaceId,
                memberId,
              )) ??
              (
                await crmGroupsService.listCrmGroupMembers(
                  auth.workspaceId,
                  groupId,
                )
              )?.find(
                (member) =>
                  member.subjectType === subject.subjectType &&
                  member.subjectId === subject.subjectId,
              ) ??
              null;
            if (!row) {
              return c.json(
                { error: "Group member create failed", code: "internal" },
                500,
              );
            }
            if (isPrimary) primary = row;
          }

          if (!primary) {
            return c.json(
              { error: "Group member create failed", code: "internal" },
              500,
            );
          }
          return c.json(primary, 201);
        }

        const result = await crmGroupsService.addCrmGroupMemberWithCascade(
          auth.workspaceId,
          groupId,
          body,
        );
        for (const member of result.members) {
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
        return c.json(result.primary, 201);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        if (error.message === "GROUP_NOT_FOUND") {
          return c.json(notFound("Group"), 404);
        }
        if (error.message === "SUBJECT_NOT_FOUND") {
          return c.json(notFound("Member subject"), 404);
        }
        throw error;
      }
    },
  );
  app.delete("/api/v1/crm-groups/:groupId/members/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:write") && !can(auth, "organizations:write")) {
      return c.json(forbidden(), 403);
    }
    const groupId = c.req.param("groupId");
    const memberId = c.req.param("id");
    const existing = await crmGroupsService.getCrmGroupMemberById(
      auth.workspaceId,
      memberId,
    );
    if (!existing || existing.groupId !== groupId) {
      return c.json(notFound("Member"), 404);
    }

    if (isRestLeaderFirstWrite()) {
      const removeTargets = [existing];
      if (existing.subjectType === "organization") {
        const members = await crmGroupsService.listCrmGroupMembers(
          auth.workspaceId,
          groupId,
        );
        const planned = await crmGroupsService.planCrmGroupMembershipCascade(
          auth.workspaceId,
          {
            subjectType: "organization",
            subjectId: existing.subjectId,
          },
        );
        const contactIds = new Set(
          planned
            .filter((entry) => entry.subjectType === "contact")
            .map((entry) => entry.subjectId),
        );
        for (const member of members ?? []) {
          if (
            member.subjectType === "contact" &&
            contactIds.has(member.subjectId) &&
            member.id !== existing.id
          ) {
            removeTargets.push(member);
          }
        }
      } else if (existing.subjectType === "contact") {
        // Mirror service cascade: clearing a contact label also clears the org
        // (and sibling contacts) so the label cannot reappear via inheritance.
        const planned = await crmGroupsService.planCrmGroupMembershipCascade(
          auth.workspaceId,
          {
            subjectType: "contact",
            subjectId: existing.subjectId,
          },
        );
        const orgId = planned.find(
          (entry) => entry.subjectType === "organization",
        )?.subjectId;
        if (orgId) {
          const members = await crmGroupsService.listCrmGroupMembers(
            auth.workspaceId,
            groupId,
          );
          const orgMember = members?.find(
            (member) =>
              member.subjectType === "organization" &&
              member.subjectId === orgId,
          );
          if (orgMember) {
            removeTargets.length = 0;
            removeTargets.push(orgMember);
            const contactIds = new Set(
              planned
                .filter((entry) => entry.subjectType === "contact")
                .map((entry) => entry.subjectId),
            );
            for (const member of members ?? []) {
              if (
                member.subjectType === "contact" &&
                contactIds.has(member.subjectId)
              ) {
                removeTargets.push(member);
              }
            }
          }
        }
      }

      for (const target of removeTargets) {
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "crm_group_member",
          entityId: target.id,
          operation: "delete",
          payload: { id: target.id, group_id: groupId },
        });
      }
      return c.body(null, 204);
    }

    const result = await crmGroupsService.removeCrmGroupMemberWithCascade(
      auth.workspaceId,
      groupId,
      memberId,
    );
    if (result.removed.length === 0) return c.json(notFound("Member"), 404);
    for (const member of result.removed) {
      const dbRow = await loadCrmGroupMemberRow(auth.workspaceId, member.id);
      if (dbRow) {
        await recordCrmGroupMemberRestSyncEvent(
          auth.workspaceId,
          dbRow,
          "delete",
        );
        nudgeCrmGroupMemberLive(auth, dbRow.id, "delete");
      }
    }
    return c.body(null, 204);
  });
  app.get("/api/v1/contacts/:id/groups", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "contacts:read")) return c.json(forbidden(), 403);
    const contactIdRaw = c.req.param("id");
    const contactId = await routeContactId(auth.workspaceId, contactIdRaw);
    if (!contactId) return c.json(notFound("Contact"), 404);
    const groups = await crmGroupsService.listCrmGroupsForSubject(
      auth.workspaceId,
      "contact",
      contactId,
    );
    // Local-first: contact may not be in Postgres yet — empty membership is fine.
    return c.json({ groups: groups ?? [] });
  });
  app.get("/api/v1/organizations/:id/groups", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "organizations:read")) return c.json(forbidden(), 403);
    const organizationIdRaw = c.req.param("id");
    const organizationId = await routeOrganizationId(auth.workspaceId, organizationIdRaw);
    if (!organizationId) return c.json(notFound("Organization"), 404);
    const groups = await crmGroupsService.listCrmGroupsForSubject(
      auth.workspaceId,
      "organization",
      organizationId,
    );
    return c.json({ groups: groups ?? [] });
  });
}
