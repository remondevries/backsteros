import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { loadServerActivity } from "./activity.ts";
import {
  createServer,
  getServer,
  HetznerCloudError,
  isHetznerCloudConfigured,
  listServerBackupImages,
  listServers,
  loadHetznerCatalog,
  type CreateServerInput,
} from "./cloud.ts";
import { discoverKamalApps, deleteKamalSite } from "./kamal-sites.ts";
import { addAppDomain, loadAppDomains, removeAppDomain, setPrimaryAppDomain } from "./domains.ts";
import { deleteAppCommand, getAppCommand, listAppCommands, runAppCommand } from "./commands.ts";
import {
  createRedirectRule,
  createSecurityRule,
  deleteRedirectRule,
  deleteSecurityRule,
  loadAppNetwork,
  updateRedirectRule,
  updateSecurityRule,
} from "./network.ts";
import {
  addAppSettingNote,
  deleteAppSettingNote,
  loadAppSettings,
  updateAppSettings,
  type AppFramework,
} from "./settings.ts";
import { loadAppDeploySettings, triggerAppDeploy, updateAppDeploySettings } from "./deploy.ts";
import { loadAppEnv, updateAppEnv } from "./env.ts";
import { loadAppNotifications, updateAppNotifications } from "./notifications.ts";
import { loadAppProjectLink, updateAppProjectLink } from "./app-project-link.ts";
import { listGithubRepoRefs } from "./github-refs.ts";
import {
  deleteWordpressComponent,
  handleWordpressDeployWebhook,
  loadWordpressComponents,
  rotateWordpressWebhookToken,
  seedOvWordpressComponents,
  triggerWordpressComponentDeploy,
  updateWordpressSiteRoot,
  upsertWordpressComponent,
  isSiteComponentType,
} from "./wordpress-components.ts";
import { fetchServerLogs, listServerLogSources, wipeServerLogs } from "./logs.ts";
import { isMetricRange, loadAppMetrics, loadServerMetrics } from "./metrics.ts";
import {
  createServerMonitor,
  deleteServerMonitor,
  fireMonitorSupportTicket,
  isMonitorMetric,
  isMonitorOperator,
  listServerMonitors,
} from "./monitors.ts";
import {
  createBackgroundProcess,
  createScheduledJob,
  deleteBackgroundProcess,
  deleteScheduledJob,
  isScheduleFrequency,
  isStopSignal,
  listBackgroundProcesses,
  listScheduledJobs,
  listServerUsers,
  readBackgroundProcessLog,
  restartBackgroundProcess,
} from "./processes.ts";
import { discoverServerRuntime } from "./runtime.ts";
import { checkServerConnection } from "./server-connection.ts";

const HETZNER_CATALOG_PATH = "/api/hetzner/catalog";
const HETZNER_SERVERS_PATH = "/api/hetzner/servers";
const HETZNER_SITES_PATH = "/api/hetzner/sites";
const HETZNER_APP_DOMAINS_PATH = "/api/hetzner/app-domains";
const HETZNER_APP_COMMANDS_PATH = "/api/hetzner/app-commands";
const HETZNER_APP_NETWORK_PATH = "/api/hetzner/app-network";
const HETZNER_APP_SETTINGS_PATH = "/api/hetzner/app-settings";
const HETZNER_APP_DEPLOY_PATH = "/api/hetzner/app-deploy";
const HETZNER_APP_DEPLOY_HOOK_PATH = "/api/hetzner/app-deploy-hook";
const HETZNER_APP_ENV_PATH = "/api/hetzner/app-env";
const HETZNER_APP_NOTIFICATIONS_PATH = "/api/hetzner/app-notifications";
const HETZNER_APP_PROJECT_LINK_PATH = "/api/hetzner/app-project-link";
const HETZNER_GITHUB_REFS_PATH = "/api/hetzner/github-refs";
const HETZNER_APP_WP_COMPONENTS_PATH = "/api/hetzner/app-wp-components";
const HETZNER_WORDPRESS_DEPLOY_WEBHOOK_PATH = "/api/hetzner/wordpress-deploy-webhook";
const HETZNER_SERVER_CONNECTION_PATH = "/api/hetzner/server-connection";
const HETZNER_SERVER_BACKUPS_PATH = "/api/hetzner/server-backups";
const HETZNER_SERVER_RUNTIME_PATH = "/api/hetzner/server-runtime";
const HETZNER_SERVER_MONITORS_PATH = "/api/hetzner/server-monitors";
const HETZNER_SERVER_LOG_SOURCES_PATH = "/api/hetzner/server-log-sources";
const HETZNER_SERVER_LOGS_PATH = "/api/hetzner/server-logs";
const HETZNER_SERVER_ACTIVITY_PATH = "/api/hetzner/server-activity";
const HETZNER_SERVER_METRICS_PATH = "/api/hetzner/server-metrics";
const HETZNER_SERVER_PROCESSES_PATH = "/api/hetzner/server-processes";
const HETZNER_SERVER_PROCESS_USERS_PATH = "/api/hetzner/server-process-users";
const HETZNER_SERVER_SCHEDULED_JOBS_PATH = "/api/hetzner/server-scheduled-jobs";

function jsonError(message: string, status: number) {
  return HttpServerResponse.jsonUnsafe({ ok: false, error: message }, { status });
}

function mapHetznerError(error: unknown) {
  if (error instanceof HetznerCloudError) {
    return jsonError(error.message, error.status >= 400 && error.status < 600 ? error.status : 502);
  }
  const message = error instanceof Error ? error.message : "Hetzner Cloud request failed";
  return jsonError(message, 502);
}

export const hetznerCatalogRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_CATALOG_PATH,
  Effect.gen(function* () {
    if (!isHetznerCloudConfigured()) {
      return HttpServerResponse.jsonUnsafe({
        ok: true,
        configured: false,
        locations: [],
        serverTypes: [],
        images: [],
        sshKeys: [],
      });
    }

    const catalog = yield* Effect.tryPromise({
      try: () => loadHetznerCatalog(),
      catch: (cause) => cause,
    });

    return HttpServerResponse.jsonUnsafe({ ok: true, ...catalog });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerListServersRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_SERVERS_PATH,
  Effect.gen(function* () {
    if (!isHetznerCloudConfigured()) {
      return HttpServerResponse.jsonUnsafe({ ok: true, configured: false, servers: [] });
    }

    const servers = yield* Effect.tryPromise({
      try: () => listServers(),
      catch: (cause) => cause,
    });

    return HttpServerResponse.jsonUnsafe({ ok: true, configured: true, servers });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

function parseCreateServerBody(body: unknown): CreateServerInput | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  if (
    typeof raw.name !== "string" ||
    typeof raw.server_type !== "string" ||
    typeof raw.image !== "string" ||
    typeof raw.location !== "string"
  ) {
    return null;
  }
  const sshKeys = Array.isArray(raw.ssh_keys)
    ? raw.ssh_keys.filter(
        (value): value is string => typeof value === "string" && value.trim() !== "",
      )
    : undefined;
  return {
    name: raw.name,
    server_type: raw.server_type,
    image: raw.image,
    location: raw.location,
    ...(sshKeys?.length ? { ssh_keys: sshKeys } : {}),
    start_after_create: raw.start_after_create !== false,
  };
}

export const hetznerCreateServerRouteLayer = HttpRouter.add(
  "POST",
  HETZNER_SERVERS_PATH,
  Effect.gen(function* () {
    if (!isHetznerCloudConfigured()) {
      return jsonError(
        "Hetzner Cloud is not configured. Set HCLOUD_TOKEN or ~/.config/secrets/hetzner.env",
        503,
      );
    }

    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    const input = parseCreateServerBody(bodyJson);
    if (!input) {
      return jsonError("Expected name, server_type, image, and location in the request body", 400);
    }

    const result = yield* Effect.tryPromise({
      try: () => createServer(input),
      catch: (cause) => cause,
    });

    return HttpServerResponse.jsonUnsafe({
      ok: true,
      server: result.server,
      action: result.action,
      // Only returned once by Hetzner — surface it so the UI can show/copy.
      rootPassword: result.root_password,
    });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerServerConnectionRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_SERVER_CONNECTION_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    if (!serverId) {
      return jsonError("Missing serverId query parameter", 400);
    }

    if (!isHetznerCloudConfigured()) {
      return HttpServerResponse.jsonUnsafe({
        ok: true,
        configured: false,
        connected: false,
        serverId: null,
        serverName: null,
        error: "Hetzner Cloud is not configured",
      });
    }

    const result = yield* Effect.tryPromise({
      try: () => checkServerConnection(serverId),
      catch: (cause) => cause,
    });

    return HttpServerResponse.jsonUnsafe({
      ok: true,
      configured: true,
      ...result,
    });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerSitesRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_SITES_PATH,
  Effect.gen(function* () {
    if (!isHetznerCloudConfigured()) {
      return HttpServerResponse.jsonUnsafe({
        ok: true,
        configured: false,
        sites: [],
        deployments: [],
        databases: [],
        hostsChecked: 0,
        hostsWithKamal: 0,
        errors: [],
      });
    }

    const discovery = yield* Effect.tryPromise({
      try: () => discoverKamalApps(),
      catch: (cause) => cause,
    });

    return HttpServerResponse.jsonUnsafe({
      ok: true,
      configured: true,
      ...discovery,
    });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerDeleteSiteRouteLayer = HttpRouter.add(
  "DELETE",
  HETZNER_SITES_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const service = url.value.searchParams.get("service")?.trim() ?? "";
    if (!serverId) return jsonError("Missing serverId query parameter", 400);
    if (!service) return jsonError("Missing service query parameter", 400);

    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }

    const result = yield* Effect.tryPromise({
      try: () => deleteKamalSite({ serverId, service }),
      catch: (cause) => cause,
    });

    return HttpServerResponse.jsonUnsafe({ ok: true, ...result });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerListAppDomainsRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_APP_DOMAINS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const service = url.value.searchParams.get("service")?.trim() ?? "";
    if (!serverId) return jsonError("Missing serverId query parameter", 400);
    if (!service) return jsonError("Missing service query parameter", 400);
    if (!isHetznerCloudConfigured()) {
      return HttpServerResponse.jsonUnsafe({
        ok: true,
        configured: false,
        hosts: [],
        error: "Hetzner Cloud is not configured",
      });
    }
    const domains = yield* Effect.tryPromise({
      try: () => loadAppDomains(serverId, service),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, configured: true, ...domains });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerAddAppDomainRouteLayer = HttpRouter.add(
  "POST",
  HETZNER_APP_DOMAINS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return jsonError("Expected JSON body", 400);
    }
    const body = bodyJson as Record<string, unknown>;
    const serverId = typeof body.serverId === "string" ? body.serverId.trim() : "";
    const service = typeof body.service === "string" ? body.service.trim() : "";
    const host = typeof body.host === "string" ? body.host : "";
    const action = typeof body.action === "string" ? body.action.trim() : "add";
    if (!serverId || !service) return jsonError("serverId and service are required", 400);
    if (!host) return jsonError("host is required", 400);

    const domains = yield* Effect.tryPromise({
      try: () => {
        if (action === "primary") {
          return setPrimaryAppDomain({ serverId, service, host });
        }
        return addAppDomain({ serverId, service, host });
      },
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, ...domains }, { status: 201 });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerRemoveAppDomainRouteLayer = HttpRouter.add(
  "DELETE",
  HETZNER_APP_DOMAINS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const service = url.value.searchParams.get("service")?.trim() ?? "";
    const host = url.value.searchParams.get("host")?.trim() ?? "";
    if (!serverId || !service || !host) {
      return jsonError("serverId, service, and host are required", 400);
    }
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const domains = yield* Effect.tryPromise({
      try: () => removeAppDomain({ serverId, service, host }),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, ...domains });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerListAppCommandsRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_APP_COMMANDS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const service = url.value.searchParams.get("service")?.trim() ?? "";
    const commandId = url.value.searchParams.get("commandId")?.trim() ?? "";
    if (!serverId || !service) return jsonError("serverId and service are required", 400);
    if (!isHetznerCloudConfigured()) {
      return HttpServerResponse.jsonUnsafe({
        ok: true,
        configured: false,
        commands: [],
      });
    }
    if (commandId) {
      const command = yield* Effect.tryPromise({
        try: () => getAppCommand(serverId, service, commandId),
        catch: (cause) => cause,
      });
      return HttpServerResponse.jsonUnsafe({ ok: true, configured: true, command });
    }
    const commands = yield* Effect.tryPromise({
      try: () => listAppCommands(serverId, service),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, configured: true, commands });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerRunAppCommandRouteLayer = HttpRouter.add(
  "POST",
  HETZNER_APP_COMMANDS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return jsonError("Expected JSON body", 400);
    }
    const body = bodyJson as Record<string, unknown>;
    const serverId = typeof body.serverId === "string" ? body.serverId.trim() : "";
    const service = typeof body.service === "string" ? body.service.trim() : "";
    const command = typeof body.command === "string" ? body.command : "";
    const directory = typeof body.directory === "string" ? body.directory : undefined;
    if (!serverId || !service) return jsonError("serverId and service are required", 400);

    const created = yield* Effect.tryPromise({
      try: () =>
        runAppCommand({
          serverId,
          service,
          command,
          ...(directory !== undefined ? { directory } : {}),
        }),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, command: created }, { status: 201 });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerDeleteAppCommandRouteLayer = HttpRouter.add(
  "DELETE",
  HETZNER_APP_COMMANDS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const service = url.value.searchParams.get("service")?.trim() ?? "";
    const commandId = url.value.searchParams.get("commandId")?.trim() ?? "";
    if (!serverId || !service || !commandId) {
      return jsonError("serverId, service, and commandId are required", 400);
    }
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const deleted = yield* Effect.tryPromise({
      try: () => deleteAppCommand(serverId, service, commandId),
      catch: (cause) => cause,
    });
    if (!deleted) return jsonError("Command not found", 404);
    return HttpServerResponse.jsonUnsafe({ ok: true, deleted: true });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerListAppNetworkRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_APP_NETWORK_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const service = url.value.searchParams.get("service")?.trim() ?? "";
    if (!serverId || !service) return jsonError("serverId and service are required", 400);
    if (!isHetznerCloudConfigured()) {
      return HttpServerResponse.jsonUnsafe({
        ok: true,
        configured: false,
        securityRules: [],
        redirects: [],
      });
    }
    const network = yield* Effect.tryPromise({
      try: () => loadAppNetwork(serverId, service),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, configured: true, ...network });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerMutateAppNetworkRouteLayer = HttpRouter.add(
  "POST",
  HETZNER_APP_NETWORK_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return jsonError("Expected JSON body", 400);
    }
    const body = bodyJson as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action.trim() : "";
    const serverId = typeof body.serverId === "string" ? body.serverId.trim() : "";
    const service = typeof body.service === "string" ? body.service.trim() : "";
    if (!serverId || !service) return jsonError("serverId and service are required", 400);

    const network = yield* Effect.tryPromise({
      try: async () => {
        if (action === "create_security") {
          const credentials = Array.isArray(body.credentials) ? body.credentials : [];
          return createSecurityRule({
            serverId,
            service,
            name: typeof body.name === "string" ? body.name : "",
            path: typeof body.path === "string" ? body.path : "",
            credentials: credentials.map((entry) => {
              const row = entry as Record<string, unknown>;
              return {
                username: typeof row.username === "string" ? row.username : "",
                password: typeof row.password === "string" ? row.password : "",
              };
            }),
          });
        }
        if (action === "update_security") {
          const ruleId = typeof body.ruleId === "string" ? body.ruleId.trim() : "";
          if (!ruleId) throw new Error("ruleId is required");
          const credentials = Array.isArray(body.credentials) ? body.credentials : [];
          return updateSecurityRule({
            serverId,
            service,
            ruleId,
            name: typeof body.name === "string" ? body.name : "",
            path: typeof body.path === "string" ? body.path : "",
            credentials: credentials.map((entry) => {
              const row = entry as Record<string, unknown>;
              return {
                ...(typeof row.id === "string" ? { id: row.id } : {}),
                username: typeof row.username === "string" ? row.username : "",
                password: typeof row.password === "string" ? row.password : "",
              };
            }),
          });
        }
        if (action === "delete_security") {
          const ruleId = typeof body.ruleId === "string" ? body.ruleId.trim() : "";
          if (!ruleId) throw new Error("ruleId is required");
          return deleteSecurityRule({ serverId, service, ruleId });
        }
        if (action === "create_redirect") {
          const type = body.type === "temporary" ? "temporary" : "permanent";
          return createRedirectRule({
            serverId,
            service,
            from: typeof body.from === "string" ? body.from : "",
            to: typeof body.to === "string" ? body.to : "",
            type,
          });
        }
        if (action === "update_redirect") {
          const ruleId = typeof body.ruleId === "string" ? body.ruleId.trim() : "";
          if (!ruleId) throw new Error("ruleId is required");
          const type = body.type === "temporary" ? "temporary" : "permanent";
          return updateRedirectRule({
            serverId,
            service,
            ruleId,
            from: typeof body.from === "string" ? body.from : "",
            to: typeof body.to === "string" ? body.to : "",
            type,
          });
        }
        if (action === "delete_redirect") {
          const ruleId = typeof body.ruleId === "string" ? body.ruleId.trim() : "";
          if (!ruleId) throw new Error("ruleId is required");
          return deleteRedirectRule({ serverId, service, ruleId });
        }
        throw new Error(
          "action must be create_security, update_security, delete_security, create_redirect, update_redirect, or delete_redirect",
        );
      },
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, ...network });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerListAppSettingsRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_APP_SETTINGS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const service = url.value.searchParams.get("service")?.trim() ?? "";
    if (!serverId || !service) return jsonError("serverId and service are required", 400);
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const settings = yield* Effect.tryPromise({
      try: () => loadAppSettings(serverId, service),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, configured: true, ...settings });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerUpdateAppSettingsRouteLayer = HttpRouter.add(
  "POST",
  HETZNER_APP_SETTINGS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return jsonError("Expected JSON body", 400);
    }
    const body = bodyJson as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action.trim() : "update";
    const serverId = typeof body.serverId === "string" ? body.serverId.trim() : "";
    const service = typeof body.service === "string" ? body.service.trim() : "";
    if (!serverId || !service) return jsonError("serverId and service are required", 400);

    const settings = yield* Effect.tryPromise({
      try: async () => {
        if (action === "add_note") {
          return addAppSettingNote({
            serverId,
            service,
            body: typeof body.body === "string" ? body.body : "",
          });
        }
        if (action === "delete_note") {
          const noteId = typeof body.noteId === "string" ? body.noteId.trim() : "";
          if (!noteId) throw new Error("noteId is required");
          return deleteAppSettingNote({ serverId, service, noteId });
        }
        return updateAppSettings({
          serverId,
          service,
          ...(typeof body.framework === "string"
            ? { framework: body.framework as AppFramework }
            : {}),
          ...(typeof body.runtimeVersion === "string"
            ? { runtimeVersion: body.runtimeVersion }
            : {}),
          ...(typeof body.tags === "string" ? { tags: body.tags } : {}),
          ...(typeof body.initial === "string" ? { initial: body.initial } : {}),
          ...(body.accent === null || typeof body.accent === "string"
            ? { accent: body.accent as string | null }
            : {}),
          ...(body.avatarDataUrl === null || typeof body.avatarDataUrl === "string"
            ? { avatarDataUrl: body.avatarDataUrl as string | null }
            : {}),
          ...(typeof body.rootDirectory === "string" ? { rootDirectory: body.rootDirectory } : {}),
          ...(typeof body.webDirectory === "string" ? { webDirectory: body.webDirectory } : {}),
          ...(typeof body.gitRepository === "string" ? { gitRepository: body.gitRepository } : {}),
          ...(typeof body.gitBranch === "string" ? { gitBranch: body.gitBranch } : {}),
        });
      },
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, ...settings });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerListAppDeployRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_APP_DEPLOY_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const service = url.value.searchParams.get("service")?.trim() ?? "";
    if (!serverId || !service) return jsonError("serverId and service are required", 400);
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const deploy = yield* Effect.tryPromise({
      try: () => loadAppDeploySettings(serverId, service),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, configured: true, ...deploy });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerUpdateAppDeployRouteLayer = HttpRouter.add(
  "POST",
  HETZNER_APP_DEPLOY_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return jsonError("Expected JSON body", 400);
    }
    const body = bodyJson as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action.trim() : "update";
    const serverId = typeof body.serverId === "string" ? body.serverId.trim() : "";
    const service = typeof body.service === "string" ? body.service.trim() : "";
    if (!serverId || !service) return jsonError("serverId and service are required", 400);

    const deploy = yield* Effect.tryPromise({
      try: async () => {
        if (action === "trigger") {
          return triggerAppDeploy({
            serverId,
            service,
            ...(typeof body.branch === "string" ? { branch: body.branch } : {}),
          });
        }
        return updateAppDeploySettings({
          serverId,
          service,
          ...(typeof body.adapter === "string"
            ? { adapter: body.adapter as "kamal" | "script" | "compose" | "wordpress" }
            : {}),
          ...(typeof body.deployScript === "string" ? { deployScript: body.deployScript } : {}),
          ...(typeof body.injectEnv === "boolean" ? { injectEnv: body.injectEnv } : {}),
          ...(typeof body.healthChecksEnabled === "boolean"
            ? { healthChecksEnabled: body.healthChecksEnabled }
            : {}),
          ...(typeof body.healthCheckPath === "string"
            ? { healthCheckPath: body.healthCheckPath }
            : {}),
          ...(body.rotateHookToken === true ? { rotateHookToken: true } : {}),
        });
      },
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, ...deploy });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerAppDeployHookRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_APP_DEPLOY_HOOK_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const service = url.value.searchParams.get("service")?.trim() ?? "";
    const token = url.value.searchParams.get("token")?.trim() ?? "";
    const branch = url.value.searchParams.get("branch")?.trim() || undefined;
    if (!serverId || !service || !token) {
      return jsonError("serverId, service, and token are required", 400);
    }
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const deploy = yield* Effect.tryPromise({
      try: () =>
        triggerAppDeploy({
          serverId,
          service,
          token,
          ...(branch ? { branch } : {}),
        }),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({
      ok: true,
      status: deploy.lastDeployStatus,
      finishedAt: deploy.lastDeployAt,
    });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerAppDeployHookPostRouteLayer = HttpRouter.add(
  "POST",
  HETZNER_APP_DEPLOY_HOOK_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const service = url.value.searchParams.get("service")?.trim() ?? "";
    const token = url.value.searchParams.get("token")?.trim() ?? "";
    const branch = url.value.searchParams.get("branch")?.trim() || undefined;
    if (!serverId || !service || !token) {
      return jsonError("serverId, service, and token are required", 400);
    }
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const deploy = yield* Effect.tryPromise({
      try: () =>
        triggerAppDeploy({
          serverId,
          service,
          token,
          ...(branch ? { branch } : {}),
        }),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({
      ok: true,
      status: deploy.lastDeployStatus,
      finishedAt: deploy.lastDeployAt,
    });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerListAppEnvRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_APP_ENV_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const service = url.value.searchParams.get("service")?.trim() ?? "";
    if (!serverId || !service) return jsonError("serverId and service are required", 400);
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const env = yield* Effect.tryPromise({
      try: () => loadAppEnv(serverId, service),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, configured: true, ...env });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerUpdateAppEnvRouteLayer = HttpRouter.add(
  "POST",
  HETZNER_APP_ENV_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return jsonError("Expected JSON body", 400);
    }
    const body = bodyJson as Record<string, unknown>;
    const serverId = typeof body.serverId === "string" ? body.serverId.trim() : "";
    const service = typeof body.service === "string" ? body.service.trim() : "";
    const content = typeof body.content === "string" ? body.content : "";
    if (!serverId || !service) return jsonError("serverId and service are required", 400);
    const env = yield* Effect.tryPromise({
      try: () => updateAppEnv({ serverId, service, content }),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, ...env });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerListAppNotificationsRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_APP_NOTIFICATIONS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const service = url.value.searchParams.get("service")?.trim() ?? "";
    if (!serverId || !service) return jsonError("serverId and service are required", 400);
    const payload = yield* Effect.tryPromise({
      try: () => loadAppNotifications(serverId, service),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, configured: true, ...payload });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerUpdateAppNotificationsRouteLayer = HttpRouter.add(
  "POST",
  HETZNER_APP_NOTIFICATIONS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return jsonError("Expected JSON body", 400);
    }
    const body = bodyJson as Record<string, unknown>;
    const serverId = typeof body.serverId === "string" ? body.serverId.trim() : "";
    const service = typeof body.service === "string" ? body.service.trim() : "";
    if (!serverId || !service) return jsonError("serverId and service are required", 400);

    const payload = yield* Effect.tryPromise({
      try: () =>
        updateAppNotifications({
          serverId,
          service,
          ...(body.failureContactId === null || typeof body.failureContactId === "string"
            ? { failureContactId: body.failureContactId as string | null }
            : {}),
          ...(body.failureContactName === null || typeof body.failureContactName === "string"
            ? { failureContactName: body.failureContactName as string | null }
            : {}),
          ...(typeof body.deployHookEnabled === "boolean"
            ? { deployHookEnabled: body.deployHookEnabled }
            : {}),
          ...(typeof body.deployHookUrl === "string" ? { deployHookUrl: body.deployHookUrl } : {}),
        }),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, ...payload });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerListAppProjectLinkRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_APP_PROJECT_LINK_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const service = url.value.searchParams.get("service")?.trim() ?? "";
    if (!serverId || !service) return jsonError("serverId and service are required", 400);
    const payload = yield* Effect.tryPromise({
      try: () => loadAppProjectLink(serverId, service),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, ...payload });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerUpdateAppProjectLinkRouteLayer = HttpRouter.add(
  "POST",
  HETZNER_APP_PROJECT_LINK_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return jsonError("Expected JSON body", 400);
    }
    const body = bodyJson as Record<string, unknown>;
    const serverId = typeof body.serverId === "string" ? body.serverId.trim() : "";
    const service = typeof body.service === "string" ? body.service.trim() : "";
    if (!serverId || !service) return jsonError("serverId and service are required", 400);

    const payload = yield* Effect.tryPromise({
      try: () =>
        updateAppProjectLink({
          serverId,
          service,
          ...(body.projectId === null || typeof body.projectId === "string"
            ? { projectId: body.projectId as string | null }
            : {}),
          ...(body.projectName === null || typeof body.projectName === "string"
            ? { projectName: body.projectName as string | null }
            : {}),
          ...(body.projectKey === null || typeof body.projectKey === "string"
            ? { projectKey: body.projectKey as string | null }
            : {}),
        }),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, ...payload });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerGithubRefsRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_GITHUB_REFS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const repo = url.value.searchParams.get("repo")?.trim() ?? "";
    if (!repo) return jsonError("repo is required (owner/name)", 400);
    const refs = yield* Effect.tryPromise({
      try: () => listGithubRepoRefs(repo),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, ...refs });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerListWordpressComponentsRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_APP_WP_COMPONENTS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const service = url.value.searchParams.get("service")?.trim() ?? "";
    if (!serverId || !service) return jsonError("serverId and service are required", 400);
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const payload = yield* Effect.tryPromise({
      try: () => loadWordpressComponents(serverId, service),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, configured: true, ...payload });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerMutateWordpressComponentsRouteLayer = HttpRouter.add(
  "POST",
  HETZNER_APP_WP_COMPONENTS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return jsonError("Expected JSON body", 400);
    }
    const body = bodyJson as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action.trim() : "upsert";
    const serverId = typeof body.serverId === "string" ? body.serverId.trim() : "";
    const service = typeof body.service === "string" ? body.service.trim() : "";
    if (!serverId || !service) return jsonError("serverId and service are required", 400);

    const payload = yield* Effect.tryPromise({
      try: async () => {
        if (action === "delete") {
          const componentId = typeof body.componentId === "string" ? body.componentId.trim() : "";
          if (!componentId) throw new Error("componentId is required");
          return deleteWordpressComponent({ serverId, service, componentId });
        }
        if (action === "seed_ov") {
          return seedOvWordpressComponents({
            serverId,
            service,
            replace: body.replace === true,
          });
        }
        if (action === "set_site_root") {
          const siteRoot = typeof body.siteRoot === "string" ? body.siteRoot : "";
          return updateWordpressSiteRoot({ serverId, service, siteRoot });
        }
        if (action === "rotate_webhook") {
          return rotateWordpressWebhookToken({ serverId, service });
        }
        if (action === "deploy") {
          const componentId = typeof body.componentId === "string" ? body.componentId.trim() : "";
          if (!componentId) throw new Error("componentId is required");
          return triggerWordpressComponentDeploy({ serverId, service, componentId });
        }
        if (!isSiteComponentType(body.type)) throw new Error("Invalid component type");
        const repo = typeof body.repo === "string" ? body.repo : "";
        const pathValue = typeof body.path === "string" ? body.path : "";
        const ref = typeof body.ref === "string" ? body.ref : "main";
        return upsertWordpressComponent({
          serverId,
          service,
          ...(typeof body.id === "string" && body.id.trim() ? { id: body.id.trim() } : {}),
          type: body.type,
          repo,
          path: pathValue,
          ref,
          autoDeploy: body.autoDeploy !== false,
          ...(typeof body.rolloutGroup === "string" || body.rolloutGroup === null
            ? { rolloutGroup: body.rolloutGroup as string | null }
            : {}),
        });
      },
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, ...payload });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerWordpressDeployWebhookRouteLayer = HttpRouter.add(
  "POST",
  HETZNER_WORDPRESS_DEPLOY_WEBHOOK_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const token = url.value.searchParams.get("token")?.trim() ?? "";
    if (!token) return jsonError("token query parameter is required", 400);
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    const result = yield* Effect.tryPromise({
      try: () => handleWordpressDeployWebhook({ token, body: bodyJson }),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe(result);
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerServerBackupsRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_SERVER_BACKUPS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    if (!serverId) {
      return jsonError("Missing serverId query parameter", 400);
    }

    if (!isHetznerCloudConfigured()) {
      return HttpServerResponse.jsonUnsafe({
        ok: true,
        configured: false,
        backups: [],
        backupWindow: null,
        error: "Hetzner Cloud is not configured",
      });
    }

    const result = yield* Effect.tryPromise({
      try: async () => {
        const server = await getServer(serverId);
        const images = await listServerBackupImages(server.id);
        return {
          serverId: String(server.id),
          serverName: server.name,
          backupWindow: server.backup_window ?? null,
          backups: images.map((image) => ({
            id: String(image.id),
            type: image.type,
            description: image.description,
            status: image.status,
            created: image.created,
            diskSizeGb: image.disk_size,
            imageSizeGb: image.image_size,
          })),
        };
      },
      catch: (cause) => cause,
    });

    return HttpServerResponse.jsonUnsafe({
      ok: true,
      configured: true,
      ...result,
    });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerServerRuntimeRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_SERVER_RUNTIME_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    if (!serverId) {
      return jsonError("Missing serverId query parameter", 400);
    }

    if (!isHetznerCloudConfigured()) {
      return HttpServerResponse.jsonUnsafe({
        ok: true,
        configured: false,
        error: "Hetzner Cloud is not configured",
      });
    }

    const runtime = yield* Effect.tryPromise({
      try: () => discoverServerRuntime(serverId),
      catch: (cause) => cause,
    });

    return HttpServerResponse.jsonUnsafe({
      ok: true,
      configured: true,
      ...runtime,
    });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerListMonitorsRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_SERVER_MONITORS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    if (!serverId) {
      return jsonError("Missing serverId query parameter", 400);
    }

    // Forge-style: omit/empty `service` → server-level; set `service` → app-scoped.
    const service = url.value.searchParams.has("service")
      ? url.value.searchParams.get("service")
      : null;

    return HttpServerResponse.jsonUnsafe({
      ok: true,
      serverId,
      monitors: listServerMonitors(serverId, { service }),
    });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerCreateMonitorRouteLayer = HttpRouter.add(
  "POST",
  HETZNER_SERVER_MONITORS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return jsonError("Expected JSON body", 400);
    }

    const raw = bodyJson as Record<string, unknown>;
    const serverId = typeof raw.serverId === "string" ? raw.serverId.trim() : "";
    const service = typeof raw.service === "string" ? raw.service : null;
    if (!serverId) return jsonError("Missing serverId", 400);
    if (!isMonitorMetric(raw.metric)) return jsonError("Invalid metric", 400);
    if (!isMonitorOperator(raw.operator)) return jsonError("Invalid operator", 400);

    const threshold = typeof raw.threshold === "number" ? raw.threshold : Number(raw.threshold);
    const durationMinutes =
      typeof raw.durationMinutes === "number" ? raw.durationMinutes : Number(raw.durationMinutes);
    if (!Number.isFinite(threshold) || threshold < 0) {
      return jsonError("Invalid threshold", 400);
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
      return jsonError("durationMinutes must be at least 1", 400);
    }

    const notifyContactId =
      typeof raw.notifyContactId === "string" ? raw.notifyContactId.trim() : "";
    const notifyContactName =
      typeof raw.notifyContactName === "string" ? raw.notifyContactName.trim() : null;
    if (!notifyContactId) {
      return jsonError("notifyContactId is required (BacksterOS contact for support tickets)", 400);
    }

    const monitor = createServerMonitor({
      serverId,
      service,
      metric: raw.metric,
      operator: raw.operator,
      threshold,
      durationMinutes: Math.round(durationMinutes),
      notifyChannel: "support_ticket",
      notifyContactId,
      notifyContactName,
    });

    return HttpServerResponse.jsonUnsafe({ ok: true, monitor });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerTestMonitorRouteLayer = HttpRouter.add(
  "POST",
  `${HETZNER_SERVER_MONITORS_PATH}/test`,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return jsonError("Expected JSON body", 400);
    }
    const raw = bodyJson as Record<string, unknown>;
    const serverId = typeof raw.serverId === "string" ? raw.serverId.trim() : "";
    const monitorId = typeof raw.monitorId === "string" ? raw.monitorId.trim() : "";
    if (!serverId || !monitorId) return jsonError("serverId and monitorId are required", 400);

    const monitor = listServerMonitors(serverId).find((entry) => entry.id === monitorId);
    if (!monitor) return jsonError("Monitor not found", 404);

    const result = yield* Effect.tryPromise({
      try: () =>
        fireMonitorSupportTicket({
          monitor,
          value: monitor.threshold,
          force: true,
        }),
      catch: (cause) => cause,
    });
    if (!result.ok) return jsonError(result.error ?? "Failed to create support ticket", 502);
    return HttpServerResponse.jsonUnsafe({
      ok: true,
      ticketId: result.ticketId,
      monitor: result.monitor,
    });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerDeleteMonitorRouteLayer = HttpRouter.add(
  "DELETE",
  HETZNER_SERVER_MONITORS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const monitorId = url.value.searchParams.get("monitorId")?.trim() ?? "";
    if (!serverId || !monitorId) {
      return jsonError("Missing serverId or monitorId query parameter", 400);
    }

    const deleted = deleteServerMonitor(serverId, monitorId);
    if (!deleted) return jsonError("Monitor not found", 404);
    return HttpServerResponse.jsonUnsafe({ ok: true, deleted: true });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerLogSourcesRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_SERVER_LOG_SOURCES_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    if (!serverId) {
      return jsonError("Missing serverId query parameter", 400);
    }

    if (!isHetznerCloudConfigured()) {
      return HttpServerResponse.jsonUnsafe({
        ok: true,
        configured: false,
        sources: [],
        error: "Hetzner Cloud is not configured",
      });
    }

    const service = url.value.searchParams.has("service")
      ? url.value.searchParams.get("service")
      : null;

    const result = yield* Effect.tryPromise({
      try: () => listServerLogSources(serverId, { service }),
      catch: (cause) => cause,
    });

    return HttpServerResponse.jsonUnsafe({
      ok: true,
      configured: true,
      ...result,
    });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerLogsRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_SERVER_LOGS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const sourceId = url.value.searchParams.get("sourceId")?.trim() ?? "";
    const search = url.value.searchParams.get("search")?.trim() ?? "";
    const linesRaw = url.value.searchParams.get("lines");
    const lines = linesRaw ? Number(linesRaw) : 250;
    if (!serverId) return jsonError("Missing serverId query parameter", 400);
    if (!sourceId) return jsonError("Missing sourceId query parameter", 400);

    if (!isHetznerCloudConfigured()) {
      return HttpServerResponse.jsonUnsafe({
        ok: true,
        configured: false,
        lines: [],
        error: "Hetzner Cloud is not configured",
      });
    }

    const result = yield* Effect.tryPromise({
      try: () =>
        fetchServerLogs({
          serverId,
          sourceId,
          search,
          lines: Number.isFinite(lines) ? lines : 250,
        }),
      catch: (cause) => cause,
    });

    return HttpServerResponse.jsonUnsafe({
      ok: true,
      configured: true,
      ...result,
    });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerServerMetricsRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_SERVER_METRICS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    if (!serverId) {
      return jsonError("Missing serverId query parameter", 400);
    }

    const rangeRaw = url.value.searchParams.get("range")?.trim() || "24h";
    if (!isMetricRange(rangeRaw)) {
      return jsonError("Invalid range. Use 1h, 6h, 24h, 7d, or 30d", 400);
    }

    if (!isHetznerCloudConfigured()) {
      return HttpServerResponse.jsonUnsafe({
        ok: true,
        configured: false,
        series: [],
        error: "Hetzner Cloud is not configured",
      });
    }

    const service = url.value.searchParams.has("service")
      ? url.value.searchParams.get("service")?.trim() || null
      : null;

    const metrics = yield* Effect.tryPromise({
      try: () =>
        service
          ? loadAppMetrics(serverId, service, rangeRaw)
          : loadServerMetrics(serverId, rangeRaw),
      catch: (cause) => cause,
    });

    return HttpServerResponse.jsonUnsafe({
      ok: true,
      configured: true,
      ...metrics,
    });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerProcessUsersRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_SERVER_PROCESS_USERS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    if (!serverId) return jsonError("Missing serverId query parameter", 400);
    if (!isHetznerCloudConfigured()) {
      return HttpServerResponse.jsonUnsafe({
        ok: true,
        configured: false,
        users: ["root"],
      });
    }
    const users = yield* Effect.tryPromise({
      try: () => listServerUsers(serverId),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, configured: true, users });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerListProcessesRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_SERVER_PROCESSES_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    if (!serverId) return jsonError("Missing serverId query parameter", 400);
    if (!isHetznerCloudConfigured()) {
      return HttpServerResponse.jsonUnsafe({
        ok: true,
        configured: false,
        processes: [],
      });
    }
    // Forge-style: omit or empty `service` → server-level only; set `service` → app-scoped.
    const service = url.value.searchParams.has("service")
      ? url.value.searchParams.get("service")
      : null;
    const processes = yield* Effect.tryPromise({
      try: () => listBackgroundProcesses(serverId, { service }),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, configured: true, processes });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerCreateProcessRouteLayer = HttpRouter.add(
  "POST",
  HETZNER_SERVER_PROCESSES_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return jsonError("Expected JSON body", 400);
    }
    const body = bodyJson as Record<string, unknown>;
    const serverId = typeof body.serverId === "string" ? body.serverId.trim() : "";
    const service = typeof body.service === "string" ? body.service : null;
    const name = typeof body.name === "string" ? body.name : "";
    const command = typeof body.command === "string" ? body.command : "";
    const user = typeof body.user === "string" ? body.user : "root";
    const directory = typeof body.directory === "string" ? body.directory : undefined;
    const processes =
      typeof body.processes === "number"
        ? body.processes
        : typeof body.processes === "string"
          ? Number(body.processes)
          : 1;
    const startSeconds =
      typeof body.startSeconds === "number"
        ? body.startSeconds
        : typeof body.startSeconds === "string"
          ? Number(body.startSeconds)
          : 1;
    const stopSeconds =
      typeof body.stopSeconds === "number"
        ? body.stopSeconds
        : typeof body.stopSeconds === "string"
          ? Number(body.stopSeconds)
          : 15;
    const stopSignal =
      typeof body.stopSignal === "string" && isStopSignal(body.stopSignal)
        ? body.stopSignal
        : "TERM";

    if (!serverId) return jsonError("serverId is required", 400);

    const created = yield* Effect.tryPromise({
      try: () =>
        createBackgroundProcess({
          serverId,
          service,
          name,
          command,
          user,
          ...(directory !== undefined ? { directory } : {}),
          processes,
          startSeconds,
          stopSeconds,
          stopSignal,
        }),
      catch: (cause) => cause,
    });

    return HttpServerResponse.jsonUnsafe({ ok: true, process: created }, { status: 201 });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerRestartProcessRouteLayer = HttpRouter.add(
  "POST",
  "/api/hetzner/server-processes/restart",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return jsonError("Expected JSON body", 400);
    }
    const body = bodyJson as Record<string, unknown>;
    const serverId = typeof body.serverId === "string" ? body.serverId.trim() : "";
    const processId = typeof body.processId === "string" ? body.processId.trim() : "";
    if (!serverId || !processId) return jsonError("serverId and processId are required", 400);
    const process = yield* Effect.tryPromise({
      try: () => restartBackgroundProcess(serverId, processId),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, process });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerProcessLogRouteLayer = HttpRouter.add(
  "GET",
  "/api/hetzner/server-process-log",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const processId = url.value.searchParams.get("processId")?.trim() ?? "";
    if (!serverId || !processId) return jsonError("serverId and processId are required", 400);
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const result = yield* Effect.tryPromise({
      try: () => readBackgroundProcessLog(serverId, processId),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, ...result });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerDeleteProcessRouteLayer = HttpRouter.add(
  "DELETE",
  HETZNER_SERVER_PROCESSES_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const processId = url.value.searchParams.get("processId")?.trim() ?? "";
    if (!serverId || !processId) return jsonError("serverId and processId are required", 400);
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    yield* Effect.tryPromise({
      try: () => deleteBackgroundProcess(serverId, processId),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, deleted: true });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerListScheduledJobsRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_SERVER_SCHEDULED_JOBS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    if (!serverId) return jsonError("Missing serverId query parameter", 400);
    if (!isHetznerCloudConfigured()) {
      return HttpServerResponse.jsonUnsafe({
        ok: true,
        configured: false,
        jobs: [],
      });
    }
    const service = url.value.searchParams.has("service")
      ? url.value.searchParams.get("service")
      : null;
    const jobs = yield* Effect.tryPromise({
      try: () => listScheduledJobs(serverId, { service }),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, configured: true, jobs });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerCreateScheduledJobRouteLayer = HttpRouter.add(
  "POST",
  HETZNER_SERVER_SCHEDULED_JOBS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return jsonError("Expected JSON body", 400);
    }
    const body = bodyJson as Record<string, unknown>;
    const serverId = typeof body.serverId === "string" ? body.serverId.trim() : "";
    const service = typeof body.service === "string" ? body.service : null;
    const name = typeof body.name === "string" ? body.name : "";
    const command = typeof body.command === "string" ? body.command : "";
    const user = typeof body.user === "string" ? body.user : "root";
    const frequency = body.frequency;
    if (!serverId) return jsonError("serverId is required", 400);
    if (!isScheduleFrequency(frequency)) return jsonError("Invalid frequency", 400);

    const job = yield* Effect.tryPromise({
      try: () =>
        createScheduledJob({
          serverId,
          service,
          name,
          command,
          user,
          frequency,
        }),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, job }, { status: 201 });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerDeleteScheduledJobRouteLayer = HttpRouter.add(
  "DELETE",
  HETZNER_SERVER_SCHEDULED_JOBS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const jobId = url.value.searchParams.get("jobId")?.trim() ?? "";
    if (!serverId || !jobId) return jsonError("serverId and jobId are required", 400);
    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }
    yield* Effect.tryPromise({
      try: () => deleteScheduledJob(serverId, jobId),
      catch: (cause) => cause,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, deleted: true });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerServerActivityRouteLayer = HttpRouter.add(
  "GET",
  HETZNER_SERVER_ACTIVITY_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    if (!serverId) {
      return jsonError("Missing serverId query parameter", 400);
    }

    if (!isHetznerCloudConfigured()) {
      return HttpServerResponse.jsonUnsafe({
        ok: true,
        configured: false,
        items: [],
        error: "Hetzner Cloud is not configured",
      });
    }

    const activity = yield* Effect.tryPromise({
      try: () => loadServerActivity(serverId),
      catch: (cause) => cause,
    });

    return HttpServerResponse.jsonUnsafe({
      ok: true,
      configured: true,
      ...activity,
    });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerWipeLogsRouteLayer = HttpRouter.add(
  "DELETE",
  HETZNER_SERVER_LOGS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const serverId = url.value.searchParams.get("serverId")?.trim() ?? "";
    const sourceId = url.value.searchParams.get("sourceId")?.trim() ?? "";
    if (!serverId) return jsonError("Missing serverId query parameter", 400);
    if (!sourceId) return jsonError("Missing sourceId query parameter", 400);

    if (!isHetznerCloudConfigured()) {
      return jsonError("Hetzner Cloud is not configured", 503);
    }

    const result = yield* Effect.tryPromise({
      try: () => wipeServerLogs({ serverId, sourceId }),
      catch: (cause) => cause,
    });

    return HttpServerResponse.jsonUnsafe({
      ok: true,
      ...result,
    });
  }).pipe(Effect.catch((cause) => Effect.succeed(mapHetznerError(cause)))),
);

export const hetznerRouteLayer = Layer.mergeAll(
  hetznerCatalogRouteLayer,
  hetznerListServersRouteLayer,
  hetznerCreateServerRouteLayer,
  hetznerServerConnectionRouteLayer,
  hetznerSitesRouteLayer,
  hetznerDeleteSiteRouteLayer,
  hetznerListAppDomainsRouteLayer,
  hetznerAddAppDomainRouteLayer,
  hetznerRemoveAppDomainRouteLayer,
  hetznerListAppCommandsRouteLayer,
  hetznerRunAppCommandRouteLayer,
  hetznerDeleteAppCommandRouteLayer,
  hetznerListAppNetworkRouteLayer,
  hetznerMutateAppNetworkRouteLayer,
  hetznerListAppSettingsRouteLayer,
  hetznerUpdateAppSettingsRouteLayer,
  hetznerListAppDeployRouteLayer,
  hetznerUpdateAppDeployRouteLayer,
  hetznerAppDeployHookRouteLayer,
  hetznerAppDeployHookPostRouteLayer,
  hetznerListAppEnvRouteLayer,
  hetznerUpdateAppEnvRouteLayer,
  hetznerListAppNotificationsRouteLayer,
  hetznerUpdateAppNotificationsRouteLayer,
  hetznerListAppProjectLinkRouteLayer,
  hetznerUpdateAppProjectLinkRouteLayer,
  hetznerGithubRefsRouteLayer,
  hetznerListWordpressComponentsRouteLayer,
  hetznerMutateWordpressComponentsRouteLayer,
  hetznerWordpressDeployWebhookRouteLayer,
  hetznerServerBackupsRouteLayer,
  hetznerServerRuntimeRouteLayer,
  hetznerListMonitorsRouteLayer,
  hetznerCreateMonitorRouteLayer,
  hetznerTestMonitorRouteLayer,
  hetznerDeleteMonitorRouteLayer,
  hetznerLogSourcesRouteLayer,
  hetznerLogsRouteLayer,
  hetznerWipeLogsRouteLayer,
  hetznerServerActivityRouteLayer,
  hetznerServerMetricsRouteLayer,
  hetznerProcessUsersRouteLayer,
  hetznerListProcessesRouteLayer,
  hetznerCreateProcessRouteLayer,
  hetznerRestartProcessRouteLayer,
  hetznerProcessLogRouteLayer,
  hetznerDeleteProcessRouteLayer,
  hetznerListScheduledJobsRouteLayer,
  hetznerCreateScheduledJobRouteLayer,
  hetznerDeleteScheduledJobRouteLayer,
);
