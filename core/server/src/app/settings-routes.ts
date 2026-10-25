/**
 * settings-routes routes (OS-73 split from routes.ts).
 */
import {
  AgentMailApiError,
  GoogleCalendarApiError,
  MapboxApiError,
  MoneybirdApiError,
  SpellcheckError,
  agentmailSettingsService,
  apiKeyService,
  autoReviewWebhookService,
  brandfetchSettingsService,
  buildWorkspaceSettingRestPayload,
  can,
  canManageApiKeys,
  circleService,
  cloudflareSettingsService,
  commitRestEntityWrite,
  cursorSettingsService,
  forbidden,
  getAuth,
  githubSettingsService,
  googleCalendarSettingsService,
  isRestLeaderFirstWrite,
  listCursorModels,
  listExternalCalendarEventsQuerySchema,
  mapboxGeocodeQuerySchema,
  mapboxSettingsService,
  mapboxStaticMapQuerySchema,
  moneybirdSettingsService,
  recordWorkspaceSettingRestSyncEvent,
  sanitizeWorkspaceSettings,
  testCursorConnection,
  transipSettingsService,
  unauthorized,
  updateAgentMailSettingsSchema,
  updateAutoReviewWebhookSettingsSchema,
  updateBrandfetchSettingsSchema,
  updateCloudflareSettingsSchema,
  updateCursorSettingsSchema,
  updateGithubSettingsSchema,
  updateGoogleCalendarSettingsSchema,
  updateMapboxSettingsSchema,
  updateMoneybirdSettingsSchema,
  updateTransipSettingsSchema,
  updateVaultStorageSettingsSchema,
  vaultSettingsService,
  z,
  zValidator,
} from "./route-deps.js";
import type {
  Hono,
} from "./route-deps.js";

type IntegrationSettingsRoute = {
  slug: string;
  label: string;
  get(workspaceId: string): Promise<unknown>;
  /** Resolves `null` when the body fails the update schema. */
  update(workspaceId: string, body: unknown): Promise<unknown>;
  test(workspaceId: string): Promise<unknown>;
};

/** GET / PATCH / GET test for one `/api/v1/settings/{slug}` integration. */
function integrationSettingsRoute<TPatch>(route: {
  slug: string;
  label: string;
  schema: z.ZodType<TPatch>;
  get(workspaceId: string): Promise<unknown>;
  update(workspaceId: string, patch: TPatch): Promise<unknown>;
  test(workspaceId: string): Promise<unknown>;
}): IntegrationSettingsRoute {
  return {
    slug: route.slug,
    label: route.label,
    get: route.get,
    async update(workspaceId, body) {
      const parsed = route.schema.safeParse(body);
      return parsed.success ? route.update(workspaceId, parsed.data) : null;
    },
    test: route.test,
  };
}

function registerIntegrationSecretSettingsRoutes(
  app: Hono,
  routes: IntegrationSettingsRoute[],
) {
  for (const route of routes) {
    const path = `/api/v1/settings/${route.slug}`;
    app.get(path, async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
      return c.json(await route.get(auth.workspaceId));
    });
    app.patch(path, async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
      const updated = await route.update(auth.workspaceId, await c.req.json());
      if (updated === null) {
        return c.json(
          { error: `Invalid ${route.label} settings`, code: "bad_request" },
          400,
        );
      }
      return c.json(updated);
    });
    app.get(`${path}/test`, async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
      return c.json(await route.test(auth.workspaceId));
    });
  }
}

export function registerSettingsRoutes(app: Hono) {
  app.get("/api/v1/settings", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    const settings = sanitizeWorkspaceSettings(
      (await circleService.getSettings(auth.workspaceId)) as Record<
        string,
        unknown
      >,
    );
    return c.json({ settings });
  });
  app.get("/api/v1/settings/storage", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    await vaultSettingsService.warmVaultPathCache(auth.workspaceId);
    return c.json(
      await vaultSettingsService.getVaultStorageSettings(auth.workspaceId),
    );
  });
  app.patch("/api/v1/settings/storage", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const parsed = updateVaultStorageSettingsSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid vault settings", code: "bad_request" }, 400);
    }
    try {
      return c.json(
        await vaultSettingsService.updateVaultStorageSettings(
          auth.workspaceId,
          parsed.data.vaultPath,
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not set vault path";
      if (message === "VAULT_PATH_REQUIRED") {
        return c.json({ error: "Vault path is required", code: "bad_request" }, 400);
      }
      if (message === "VAULT_PATH_CLOUD_FORBIDDEN") {
        return c.json(
          {
            error: "vaultPath is machine-local and cannot be set on cloud-core",
            code: "vault_path_cloud_forbidden",
          },
          400,
        );
      }
      return c.json(
        {
          error: `Vault path is not usable: ${message}`,
          code: "bad_request",
        },
        400,
      );
    }
  });
  app.get("/api/v1/settings/cursor", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(await cursorSettingsService.getCursorSettings(auth.workspaceId));
  });
  app.patch("/api/v1/settings/cursor", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const parsed = updateCursorSettingsSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid Cursor settings", code: "bad_request" }, 400);
    }
    const patch = parsed.data;
    const touchesWorkspaceSettings =
      patch.spellcheckEnabled !== undefined ||
      patch.spellcheckModel !== undefined ||
      patch.spellcheckInstructions !== undefined ||
      patch.researchEnabled !== undefined ||
      patch.researchModel !== undefined ||
      patch.researchInstructions !== undefined;

    if (isRestLeaderFirstWrite()) {
      if (patch.apiKey !== undefined) {
        await cursorSettingsService.updateCursorApiKey(
          auth.workspaceId,
          patch.apiKey,
        );
      }
      if (touchesWorkspaceSettings) {
        const current = (await circleService.getSettings(
          auth.workspaceId,
        )) as Record<string, unknown>;
        const settingsPatch =
          cursorSettingsService.buildCursorWorkspaceSettingsPatch(
            current,
            patch,
          );
        if (settingsPatch) {
          await commitRestEntityWrite({
            workspaceId: auth.workspaceId,
            entity: "workspace_setting",
            entityId: auth.workspaceId,
            operation: "upsert",
            payload: buildWorkspaceSettingRestPayload(
              auth.workspaceId,
              settingsPatch,
            ),
          });
        }
      }
      return c.json(
        await cursorSettingsService.getCursorSettings(auth.workspaceId),
      );
    }

    const result = await cursorSettingsService.updateCursorSettings(
      auth.workspaceId,
      patch,
    );
    if (touchesWorkspaceSettings) {
      const settings = sanitizeWorkspaceSettings(
        (await circleService.getSettings(auth.workspaceId)) as Record<
          string,
          unknown
        >,
      );
      await recordWorkspaceSettingRestSyncEvent(auth.workspaceId, settings);
    }
    return c.json(result);
  });
  app.get("/api/v1/settings/cursor/models", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    try {
      const models = await listCursorModels(auth.workspaceId);
      return c.json({ models });
    } catch (error) {
      if (error instanceof SpellcheckError && error.code === "missing_key") {
        return c.json({ error: error.message, code: "bad_request" }, 400);
      }
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not list Cursor models",
          code: "bad_request",
        },
        400,
      );
    }
  });
  app.get("/api/v1/settings/cursor/test", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(await testCursorConnection(auth.workspaceId));
  });
  registerIntegrationSecretSettingsRoutes(app, [
    integrationSettingsRoute({
      slug: "moneybird",
      label: "Moneybird",
      schema: updateMoneybirdSettingsSchema,
      get: moneybirdSettingsService.getMoneybirdSettings,
      update: moneybirdSettingsService.updateMoneybirdSettings,
      test: moneybirdSettingsService.testMoneybirdConnection,
    }),
    integrationSettingsRoute({
      slug: "mapbox",
      label: "Mapbox",
      schema: updateMapboxSettingsSchema,
      get: mapboxSettingsService.getMapboxSettings,
      update: mapboxSettingsService.updateMapboxSettings,
      test: mapboxSettingsService.testMapboxConnection,
    }),
    integrationSettingsRoute({
      slug: "brandfetch",
      label: "Brandfetch",
      schema: updateBrandfetchSettingsSchema,
      get: brandfetchSettingsService.getBrandfetchSettings,
      update: brandfetchSettingsService.updateBrandfetchSettings,
      test: brandfetchSettingsService.testBrandfetchConnection,
    }),
    integrationSettingsRoute({
      slug: "github",
      label: "GitHub",
      schema: updateGithubSettingsSchema,
      get: githubSettingsService.getGithubSettings,
      update: githubSettingsService.updateGithubSettings,
      test: githubSettingsService.testGithubConnection,
    }),
    integrationSettingsRoute({
      slug: "cloudflare",
      label: "Cloudflare",
      schema: updateCloudflareSettingsSchema,
      get: cloudflareSettingsService.getCloudflareSettings,
      update: cloudflareSettingsService.updateCloudflareSettings,
      test: cloudflareSettingsService.testCloudflareConnection,
    }),
  ]);
  app.get("/api/v1/settings/moneybird/administrations", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    try {
      const administrations =
        await moneybirdSettingsService.listMoneybirdAdministrations(
          auth.workspaceId,
        );
      return c.json({ administrations });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not list Moneybird administrations";
      const status =
        error instanceof MoneybirdApiError && error.status === 401 ? 400 : 400;
      return c.json({ error: message, code: "bad_request" }, status);
    }
  });
  app.get("/api/v1/settings/google-calendar", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    const origin = new URL(c.req.url).origin;
    return c.json(
      await googleCalendarSettingsService.getGoogleCalendarSettings(
        auth.workspaceId,
        origin,
      ),
    );
  });
  app.patch("/api/v1/settings/google-calendar", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const parsed = updateGoogleCalendarSettingsSchema.safeParse(
      await c.req.json(),
    );
    if (!parsed.success) {
      return c.json(
        { error: "Invalid Google Calendar settings", code: "bad_request" },
        400,
      );
    }
    const origin = new URL(c.req.url).origin;
    return c.json(
      await googleCalendarSettingsService.updateGoogleCalendarSettings(
        auth.workspaceId,
        parsed.data,
        origin,
      ),
    );
  });
  app.get("/api/v1/settings/google-calendar/test", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await googleCalendarSettingsService.testGoogleCalendarConnection(
        auth.workspaceId,
      ),
    );
  });
  app.post("/api/v1/settings/google-calendar/oauth/start", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    try {
      const origin = new URL(c.req.url).origin;
      return c.json(
        await googleCalendarSettingsService.startGoogleCalendarOAuth(
          auth.workspaceId,
          origin,
        ),
      );
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not start Google Calendar OAuth",
          code: "bad_request",
        },
        400,
      );
    }
  });
  app.get("/api/v1/settings/google-calendar/oauth/callback", async (c) => {
    const result =
      await googleCalendarSettingsService.completeGoogleCalendarOAuth({
        code: c.req.query("code") ?? null,
        state: c.req.query("state") ?? null,
        error: c.req.query("error") ?? null,
      });
    const title = result.ok ? "Google Calendar connected" : "Connection failed";
    const color = result.ok ? "#166534" : "#991b1b";
    return c.html(
      `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title></head><body style="font-family:system-ui,sans-serif;padding:2rem;max-width:36rem;line-height:1.5"><h1 style="color:${color}">${title}</h1><p>${result.message.replace(/</g, "&lt;")}</p><p>You can close this tab and return to BacksterOS Settings → Integrations → Google Calendar.</p></body></html>`,
      result.ok ? 200 : 400,
    );
  });
  app.get("/api/v1/settings/google-calendar/calendars", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    try {
      const calendars =
        await googleCalendarSettingsService.listGoogleCalendars(
          auth.workspaceId,
        );
      return c.json({ calendars });
    } catch (error) {
      const message =
        error instanceof GoogleCalendarApiError || error instanceof Error
          ? error.message
          : "Could not list Google calendars";
      return c.json({ error: message, code: "bad_request" }, 400);
    }
  });
  app.post("/api/v1/settings/google-calendar/sync", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    return c.json(
      await googleCalendarSettingsService.syncGoogleCalendar(auth.workspaceId),
    );
  });
  app.post("/api/v1/webhooks/google-calendar", async (c) => {
    const result =
      await googleCalendarSettingsService.handleGoogleCalendarWebhook({
        channelId: c.req.header("X-Goog-Channel-ID") ?? null,
        channelToken: c.req.header("X-Goog-Channel-Token") ?? null,
        resourceState: c.req.header("X-Goog-Resource-State") ?? null,
      });
    return c.body(null, result.status);
  });
  app.get("/api/v1/external-calendar-events", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "tasks:read") && !can(auth, "settings:read")) {
      return c.json(forbidden(), 403);
    }
    const parsed = listExternalCalendarEventsQuerySchema.safeParse({
      from: c.req.query("from") || undefined,
      to: c.req.query("to") || undefined,
      provider: c.req.query("provider") || undefined,
    });
    if (!parsed.success) {
      return c.json(
        { error: "Invalid external calendar query", code: "bad_request" },
        400,
      );
    }
    return c.json({
      events: await googleCalendarSettingsService.listExternalCalendarEvents(
        auth.workspaceId,
        parsed.data,
      ),
    });
  });
  app.get("/api/v1/settings/transip", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await transipSettingsService.getTransipSettings(auth.workspaceId),
    );
  });
  app.patch("/api/v1/settings/transip", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const parsed = updateTransipSettingsSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "Invalid TransIP settings", code: "bad_request" },
        400,
      );
    }
    return c.json(
      await transipSettingsService.updateTransipSettings(
        auth.workspaceId,
        parsed.data,
      ),
    );
  });
  app.get("/api/v1/settings/transip/test", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await transipSettingsService.testTransipConnection(auth.workspaceId),
    );
  });
  app.get(
    "/api/v1/mapbox/geocode",
    zValidator("query", mapboxGeocodeQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:read") && !can(auth, "contacts:write")) {
        return c.json(forbidden(), 403);
      }
      const { q, country } = c.req.valid("query");
      try {
        const result = await mapboxSettingsService.geocodeQuery(
          auth.workspaceId,
          q,
          { country },
        );
        return c.json({ result });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Mapbox geocode failed";
        const status =
          error instanceof MapboxApiError && error.status === 401 ? 400 : 400;
        return c.json({ error: message, code: "bad_request" }, status);
      }
    },
  );
  app.get(
    "/api/v1/mapbox/static-map",
    zValidator("query", mapboxStaticMapQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "settings:read") && !can(auth, "contacts:read")) {
        return c.json(forbidden(), 403);
      }
      const query = c.req.valid("query");
      try {
        const png = await mapboxSettingsService.fetchStaticMapPng(
          auth.workspaceId,
          {
            latitude: query.lat,
            longitude: query.lng,
            zoom: query.z,
            width: query.width,
            height: query.height,
          },
        );
        return new Response(png, {
          status: 200,
          headers: {
            "content-type": "image/png",
            "cache-control": "private, max-age=3600",
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Mapbox static map failed";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
  app.get("/api/v1/settings/agentmail", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    try {
      return c.json(
        await agentmailSettingsService.getAgentMailSettings(auth.workspaceId),
      );
    } catch (error) {
      console.error("AgentMail settings read failed:", error);
      return c.json(
        {
          error: agentmailSettingsService.formatAgentMailSettingsError(error),
          code: "bad_request" as const,
        },
        400,
      );
    }
  });
  app.patch("/api/v1/settings/agentmail", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:write")) return c.json(forbidden(), 403);
    const parsed = updateAgentMailSettingsSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        { error: "Invalid AgentMail settings", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(
        await agentmailSettingsService.updateAgentMailSettings(
          auth.workspaceId,
          parsed.data,
        ),
      );
    } catch (error) {
      console.error("AgentMail settings update failed:", error);
      return c.json(
        {
          error: agentmailSettingsService.formatAgentMailSettingsError(error),
          code: "bad_request" as const,
        },
        400,
      );
    }
  });
  app.get("/api/v1/settings/agentmail/inboxes", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    try {
      const inboxes = await agentmailSettingsService.listAgentMailInboxes(
        auth.workspaceId,
      );
      return c.json({ inboxes });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not list AgentMail inboxes";
      const status =
        error instanceof AgentMailApiError && error.status === 401 ? 400 : 400;
      return c.json({ error: message, code: "bad_request" }, status);
    }
  });
  app.get("/api/v1/settings/agentmail/test", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await agentmailSettingsService.testAgentMailConnection(auth.workspaceId),
    );
  });
  app.get("/api/v1/settings/auto-review-webhook", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "settings:read")) return c.json(forbidden(), 403);
    return c.json(
      await autoReviewWebhookService.getAutoReviewWebhookSettings(
        auth.workspaceId,
      ),
    );
  });
  app.patch("/api/v1/settings/auto-review-webhook", async (c) => {
    const auth = getAuth(c);
    const contactIsWorkspaceOwner =
      auth.kind === "api_key" && Boolean(auth.contactId)
        ? await apiKeyService.apiKeyContactIsWorkspaceOwner(auth)
        : false;
    if (!canManageApiKeys(auth, { contactIsWorkspaceOwner })) {
      return c.json(
        auth.kind === "api_key" ? forbidden() : unauthorized(),
        auth.kind === "api_key" ? 403 : 401,
      );
    }
    const parsed = updateAutoReviewWebhookSettingsSchema.safeParse(
      await c.req.json(),
    );
    if (!parsed.success) {
      return c.json(
        { error: "Invalid auto-review webhook settings", code: "bad_request" },
        400,
      );
    }
    try {
      return c.json(
        await autoReviewWebhookService.updateAutoReviewWebhookSettings(
          auth.workspaceId,
          parsed.data,
        ),
      );
    } catch (error) {
      if (error instanceof autoReviewWebhookService.AutoReviewWebhookSettingsError) {
        return c.json({ error: error.message, code: error.code }, 400);
      }
      throw error;
    }
  });
  app.post("/api/v1/settings/auto-review-webhook/test", async (c) => {
    const auth = getAuth(c);
    const contactIsWorkspaceOwner =
      auth.kind === "api_key" && Boolean(auth.contactId)
        ? await apiKeyService.apiKeyContactIsWorkspaceOwner(auth)
        : false;
    if (!canManageApiKeys(auth, { contactIsWorkspaceOwner })) {
      return c.json(
        auth.kind === "api_key" ? forbidden() : unauthorized(),
        auth.kind === "api_key" ? 403 : 401,
      );
    }
    return c.json(
      await autoReviewWebhookService.sendAutoReviewWebhookTest(
        auth.workspaceId,
      ),
    );
  });
}
