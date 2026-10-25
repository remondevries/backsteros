import {
  CloudflareApiError,
  TransipApiError,
  cloudflareSettingsService,
  cloudflareZoneOpsService,
  cloudflareZonesSyncService,
  forbidden,
  getAuth,
  publishProjectLive,
  requireScope,
  transipDomainsSyncService,
  transipSettingsService,
  unauthorized,
  updateCloudflareDnsRecordSchema,
  updateTransipDomainContactsInputSchema,
  updateTransipDomainNameserversInputSchema,
} from "../route-deps.js";
import type { Hono } from "../route-deps.js";

/** TransIP domains and Cloudflare zones. */
export function registerProjectInfraRoutes(app: Hono) {
  app.get("/api/v1/transip/status", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }
    return c.json(await transipSettingsService.getTransipStatus(auth.workspaceId));
  });

  app.post("/api/v1/transip/domains/sync", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    try {
      const result = await transipDomainsSyncService.syncTransipDomains(
        auth.workspaceId,
      );
      for (const project of result.createdProjects) {
        publishProjectLive(auth, project.id, "upsert");
      }
      for (const projectId of result.healedProjectIds) {
        publishProjectLive(auth, projectId, "upsert");
      }
      return c.json(result);
    } catch (error) {
      if (error instanceof TransipApiError) {
        if (error.status === 401 || error.status === 403) {
          return c.json(
            { error: error.message, code: error.code },
            error.status,
          );
        }
        return c.json({ error: error.message, code: error.code }, 400);
      }
      throw error;
    }
  });

  app.get("/api/v1/transip/domains/:domainName", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }
    const domainName = c.req.param("domainName")?.trim() ?? "";
    if (!domainName) {
      return c.json(
        { error: "Domain name required", code: "bad_request" },
        400,
      );
    }
    try {
      const detail = await transipDomainsSyncService.getTransipDomainDetail(
        auth.workspaceId,
        decodeURIComponent(domainName),
      );
      return c.json(detail);
    } catch (error) {
      if (error instanceof TransipApiError) {
        const status =
          error.status === 404
            ? 404
            : error.status === 401 || error.status === 403
              ? error.status
              : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.put("/api/v1/transip/domains/:domainName/tags", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const domainName = c.req.param("domainName")?.trim() ?? "";
    if (!domainName) {
      return c.json(
        { error: "Domain name required", code: "bad_request" },
        400,
      );
    }
    const body = await c.req.json().catch(() => null);
    const tags = Array.isArray((body as { tags?: unknown } | null)?.tags)
      ? ((body as { tags: unknown[] }).tags
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter(Boolean))
      : null;
    if (tags == null) {
      return c.json(
        { error: "tags must be an array of strings", code: "bad_request" },
        400,
      );
    }
    try {
      const result = await transipDomainsSyncService.updateTransipDomainTags(
        auth.workspaceId,
        decodeURIComponent(domainName),
        tags,
      );
      if (result.projectId) {
        publishProjectLive(auth, result.projectId, "upsert");
      }
      return c.json(result);
    } catch (error) {
      if (error instanceof TransipApiError) {
        const status =
          error.status === 404
            ? 404
            : error.status === 401 || error.status === 403
              ? error.status
              : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.put("/api/v1/transip/domains/:domainName/contacts", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const domainName = c.req.param("domainName")?.trim() ?? "";
    if (!domainName) {
      return c.json(
        { error: "Domain name required", code: "bad_request" },
        400,
      );
    }
    const body = await c.req.json().catch(() => null);
    const parsed = updateTransipDomainContactsInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "contacts must be a non-empty array", code: "bad_request" },
        400,
      );
    }
    try {
      const result = await transipDomainsSyncService.updateTransipDomainContacts(
        auth.workspaceId,
        decodeURIComponent(domainName),
        parsed.data.contacts,
      );
      return c.json(result);
    } catch (error) {
      if (error instanceof TransipApiError) {
        const status =
          error.status === 404
            ? 404
            : error.status === 401 || error.status === 403
              ? error.status
              : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.put("/api/v1/transip/domains/:domainName/nameservers", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const domainName = c.req.param("domainName")?.trim() ?? "";
    if (!domainName) {
      return c.json(
        { error: "Domain name required", code: "bad_request" },
        400,
      );
    }
    const body = await c.req.json().catch(() => null);
    const parsed = updateTransipDomainNameserversInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: "nameservers must be an array of 2–13 entries",
          code: "bad_request",
        },
        400,
      );
    }
    try {
      const result =
        await transipDomainsSyncService.updateTransipDomainNameservers(
          auth.workspaceId,
          decodeURIComponent(domainName),
          parsed.data.nameservers,
        );
      return c.json(result);
    } catch (error) {
      if (error instanceof TransipApiError) {
        const status =
          error.status === 404
            ? 404
            : error.status === 401 || error.status === 403
              ? error.status
              : 400;
        return c.json({ error: error.message, code: error.code }, status);
      }
      throw error;
    }
  });

  app.get("/api/v1/cloudflare/status", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }
    return c.json(
      await cloudflareSettingsService.getCloudflareStatus(auth.workspaceId),
    );
  });

  app.post("/api/v1/cloudflare/zones/match", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    try {
      const result = await cloudflareZonesSyncService.matchCloudflareZones(
        auth.workspaceId,
      );
      for (const entry of result.domains) {
        if (entry.action !== "updated" || !entry.projectId) continue;
        publishProjectLive(auth, entry.projectId, "upsert");
      }
      return c.json(result);
    } catch (error) {
      if (error instanceof CloudflareApiError) {
        if (error.status === 401 || error.status === 403) {
          return c.json(
            { error: error.message, code: error.code },
            error.status,
          );
        }
        return c.json({ error: error.message, code: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/v1/cloudflare/projects/:projectId/zone", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const projectId = c.req.param("projectId")?.trim() ?? "";
    if (!projectId) {
      return c.json(
        { error: "Project id required", code: "bad_request" },
        400,
      );
    }
    try {
      const result =
        await cloudflareZonesSyncService.ensureProjectCloudflareZone(
          auth.workspaceId,
          decodeURIComponent(projectId),
        );
      if (result.action === "updated") {
        publishProjectLive(auth, result.projectId, "upsert");
      }
      return c.json(result);
    } catch (error) {
      if (error instanceof CloudflareApiError) {
        if (
          error.status === 401 ||
          error.status === 403 ||
          error.status === 404
        ) {
          return c.json(
            { error: error.message, code: error.code },
            error.status as 401 | 403 | 404,
          );
        }
        return c.json({ error: error.message, code: error.code }, 400);
      }
      throw error;
    }
  });

  app.get("/api/v1/cloudflare/zones/:zoneId/dns-records", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }
    const zoneId = c.req.param("zoneId")?.trim() ?? "";
    if (!zoneId) {
      return c.json(
        { error: "Zone id required", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(
        await cloudflareZoneOpsService.listCloudflareDnsRecords(
          auth.workspaceId,
          decodeURIComponent(zoneId),
        ),
      );
    } catch (error) {
      if (error instanceof CloudflareApiError) {
        if (error.status === 401 || error.status === 403) {
          return c.json(
            { error: error.message, code: error.code },
            error.status,
          );
        }
        return c.json({ error: error.message, code: error.code }, 400);
      }
      throw error;
    }
  });

  app.put("/api/v1/cloudflare/zones/:zoneId/dns-records/:recordId", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const zoneId = c.req.param("zoneId")?.trim() ?? "";
    const recordId = c.req.param("recordId")?.trim() ?? "";
    if (!zoneId || !recordId) {
      return c.json(
        { error: "Zone id and record id required", code: "bad_request" },
        400,
      );
    }
    const body = await c.req.json().catch(() => null);
    const parsed = updateCloudflareDnsRecordSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Invalid DNS record payload", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(
        await cloudflareZoneOpsService.updateCloudflareDnsRecord(
          auth.workspaceId,
          decodeURIComponent(zoneId),
          decodeURIComponent(recordId),
          parsed.data,
        ),
      );
    } catch (error) {
      if (error instanceof CloudflareApiError) {
        if (error.status === 401 || error.status === 403) {
          return c.json(
            { error: error.message, code: error.code },
            error.status,
          );
        }
        return c.json({ error: error.message, code: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/v1/cloudflare/zones/:zoneId/purge-cache", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("projects:write")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const zoneId = c.req.param("zoneId")?.trim() ?? "";
    if (!zoneId) {
      return c.json(
        { error: "Zone id required", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(
        await cloudflareZoneOpsService.purgeCloudflareCache(
          auth.workspaceId,
          decodeURIComponent(zoneId),
        ),
      );
    } catch (error) {
      if (error instanceof CloudflareApiError) {
        if (error.status === 401 || error.status === 403) {
          return c.json(
            { error: error.message, code: error.code },
            error.status,
          );
        }
        return c.json({ error: error.message, code: error.code }, 400);
      }
      throw error;
    }
  });
}
