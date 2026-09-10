/** Browser client for Hetzner Cloud routes on the development server. */

export type HetznerLocation = {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly network_zone: string;
  readonly city: string;
  readonly country: string;
};

export type HetznerServerType = {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly cores: number;
  readonly memory: number;
  readonly disk: number;
  readonly architecture: string;
  readonly prices: readonly {
    readonly location: string;
    readonly price_monthly: { readonly gross: string };
  }[];
};

export type HetznerImage = {
  readonly id: number;
  readonly name: string | null;
  readonly description: string;
  readonly type: string;
  readonly os_flavor: string;
  readonly os_version: string | null;
  readonly architecture: string;
  readonly status: string;
};

export type HetznerSshKey = {
  readonly id: number;
  readonly name: string;
  readonly fingerprint: string;
};

export type HetznerServer = {
  readonly id: number;
  readonly name: string;
  readonly status: string;
  readonly public_net: {
    readonly ipv4: { readonly ip: string } | null;
  };
  readonly server_type: { readonly name: string };
  readonly image: { readonly name: string | null; readonly description: string } | null;
  readonly location?: {
    readonly name: string;
    readonly city: string;
  } | null;
  readonly datacenter?: {
    readonly name: string;
    readonly location: { readonly name: string; readonly city: string };
  } | null;
};

export type HetznerCatalogResponse = {
  readonly ok: boolean;
  readonly configured?: boolean;
  readonly locations?: readonly HetznerLocation[];
  readonly serverTypes?: readonly HetznerServerType[];
  readonly images?: readonly HetznerImage[];
  readonly sshKeys?: readonly HetznerSshKey[];
  readonly error?: string;
};

export type HetznerServersResponse = {
  readonly ok: boolean;
  readonly configured?: boolean;
  readonly servers?: readonly HetznerServer[];
  readonly error?: string;
};

export type CreateHetznerServerInput = {
  readonly name: string;
  readonly server_type: string;
  readonly image: string;
  readonly location: string;
  readonly ssh_keys?: readonly string[];
};

export type CreateHetznerServerResponse = {
  readonly ok: boolean;
  readonly server?: HetznerServer;
  readonly action?: { readonly id: number; readonly status: string };
  readonly rootPassword?: string | null;
  readonly error?: string;
};

export type DiscoveredSite = {
  readonly id: string;
  readonly service: string;
  readonly domain: string;
  readonly hosts: readonly string[];
  readonly serverName: string;
  readonly serverId: number;
  readonly serverIp: string;
  readonly image: string | null;
  readonly repository: string | null;
  readonly version: string | null;
  readonly runtime: string;
  readonly status: string;
  readonly tls: boolean;
  readonly deployedLabel: string;
  readonly accent: string;
  readonly initial: string;
};

export type DiscoveredDeployment = {
  readonly id: string;
  readonly status: "success" | "failed" | "running";
  readonly commit: string | null;
  readonly version: string;
  readonly siteDomain: string;
  readonly siteAccent: string;
  readonly siteInitial: string;
  readonly summary: string;
  readonly meta: string;
  readonly actor: string | null;
  readonly appName: string;
  readonly serverName: string;
  readonly serverId: number;
  readonly at: string;
  /** Branch / tag the deploy came from (Forge-style row). */
  readonly branch?: string | null;
  /** Deploy channel label, e.g. Custom / Component / Kamal. */
  readonly via?: string | null;
  /** Raw deploy log output when available (WordPress jobs). */
  readonly output?: string | null;
  readonly buildOutput?: string | null;
  readonly startedAt?: string | null;
  readonly finishedAt?: string | null;
  readonly durationMs?: number | null;
  readonly buildDurationMs?: number | null;
};

export type DiscoveredDatabase = {
  readonly id: string;
  readonly kind: "engine" | "sqlite";
  readonly name: string;
  readonly engine: string;
  readonly engineVersion: string | null;
  readonly appName: string | null;
  readonly siteDomain: string | null;
  readonly volume: string | null;
  readonly path: string | null;
  readonly sizeLabel: string | null;
  readonly status: string;
  readonly serverName: string;
  readonly serverId: number;
  readonly serverIp: string;
  readonly accent: string;
  readonly initial: string;
  readonly username: string | null;
  readonly databaseName: string | null;
  readonly containerName: string | null;
  readonly connectionUrl: string | null;
  readonly connectionUrlMasked: string | null;
  readonly users: readonly {
    readonly id: string;
    readonly username: string;
    readonly accessLabel: string;
  }[];
  readonly logicalDatabases: readonly {
    readonly id: string;
    readonly name: string;
    readonly sizeLabel: string | null;
  }[];
};

export type HetznerServerBackup = {
  readonly id: string;
  readonly type: "backup" | "snapshot";
  readonly description: string;
  readonly status: string;
  readonly created: string;
  readonly diskSizeGb: number;
  readonly imageSizeGb: number | null;
};

export type HetznerServerBackupsResponse = {
  readonly ok: boolean;
  readonly configured?: boolean;
  readonly serverId?: string;
  readonly serverName?: string;
  readonly backupWindow?: string | null;
  readonly backups?: readonly HetznerServerBackup[];
  readonly error?: string;
};

export type HetznerServerConnectionResponse = {
  readonly ok: boolean;
  readonly configured?: boolean;
  readonly connected?: boolean;
  readonly serverId?: string | null;
  readonly serverName?: string | null;
  readonly hetznerStatus?: string | null;
  readonly publicIp?: string | null;
  readonly error?: string | null;
};

export type HetznerSitesResponse = {
  readonly ok: boolean;
  readonly configured?: boolean;
  readonly sites?: readonly DiscoveredSite[];
  readonly deployments?: readonly DiscoveredDeployment[];
  readonly databases?: readonly DiscoveredDatabase[];
  readonly hostsChecked?: number;
  readonly hostsWithKamal?: number;
  readonly errors?: readonly { readonly serverName: string; readonly message: string }[];
  readonly error?: string;
};

const HETZNER_SITES_CACHE_TTL_MS = 60_000;
let hetznerSitesCache: { readonly at: number; readonly data: HetznerSitesResponse } | null = null;
let hetznerSitesInFlight: Promise<HetznerSitesResponse> | null = null;

export function peekHetznerSitesCache(): HetznerSitesResponse | null {
  if (!hetznerSitesCache) return null;
  if (Date.now() - hetznerSitesCache.at > HETZNER_SITES_CACHE_TTL_MS) return null;
  return hetznerSitesCache.data;
}

export function clearHetznerSitesCache(): void {
  hetznerSitesCache = null;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function fetchHetznerCatalog(): Promise<HetznerCatalogResponse> {
  const response = await fetch("/api/hetzner/catalog");
  return readJson<HetznerCatalogResponse>(response);
}

export async function fetchHetznerServers(): Promise<HetznerServersResponse> {
  const response = await fetch("/api/hetzner/servers");
  return readJson<HetznerServersResponse>(response);
}

export async function fetchHetznerSites(options?: {
  readonly force?: boolean;
}): Promise<HetznerSitesResponse> {
  if (!options?.force) {
    const cached = peekHetznerSitesCache();
    if (cached) return cached;
    if (hetznerSitesInFlight) return hetznerSitesInFlight;
  }

  hetznerSitesInFlight = (async () => {
    const response = await fetch("/api/hetzner/sites");
    const data = await readJson<HetznerSitesResponse>(response);
    if (data.ok !== false) {
      hetznerSitesCache = { at: Date.now(), data };
    }
    return data;
  })();

  try {
    return await hetznerSitesInFlight;
  } finally {
    hetznerSitesInFlight = null;
  }
}

export async function deleteHetznerSite(input: {
  readonly serverId: string;
  readonly service: string;
}): Promise<{
  readonly ok: boolean;
  readonly service?: string;
  readonly containersRemoved?: readonly string[];
  readonly error?: string;
}> {
  const params = new URLSearchParams({
    serverId: input.serverId,
    service: input.service,
  });
  const response = await fetch(`/api/hetzner/sites?${params.toString()}`, {
    method: "DELETE",
  });
  return readJson(response);
}

export type AppDomainEntry = {
  readonly host: string;
  readonly primary: boolean;
};

export type AppCertificateInfo = {
  readonly provider: "lets_encrypt" | "custom" | "none";
  readonly label: string;
  readonly hostsLabel: string;
  readonly status: "active" | "disabled";
};

export type AppDomainsResponse = {
  readonly ok: boolean;
  readonly configured?: boolean;
  readonly serverId?: string;
  readonly serverName?: string;
  readonly serverIp?: string;
  readonly service?: string;
  readonly hosts?: readonly AppDomainEntry[];
  readonly tls?: boolean;
  readonly canonicalHost?: string | null;
  readonly target?: string | null;
  readonly certificate?: AppCertificateInfo;
  readonly error?: string;
};

export async function fetchAppDomains(
  serverId: string,
  service: string,
): Promise<AppDomainsResponse> {
  const params = new URLSearchParams({ serverId, service });
  const response = await fetch(`/api/hetzner/app-domains?${params.toString()}`);
  return readJson(response);
}

export async function addAppDomain(input: {
  readonly serverId: string;
  readonly service: string;
  readonly host: string;
}): Promise<AppDomainsResponse> {
  const response = await fetch("/api/hetzner/app-domains", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, action: "add" }),
  });
  return readJson(response);
}

export async function setPrimaryAppDomain(input: {
  readonly serverId: string;
  readonly service: string;
  readonly host: string;
}): Promise<AppDomainsResponse> {
  const response = await fetch("/api/hetzner/app-domains", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, action: "primary" }),
  });
  return readJson(response);
}

export async function removeAppDomain(input: {
  readonly serverId: string;
  readonly service: string;
  readonly host: string;
}): Promise<AppDomainsResponse> {
  const params = new URLSearchParams({
    serverId: input.serverId,
    service: input.service,
    host: input.host,
  });
  const response = await fetch(`/api/hetzner/app-domains?${params.toString()}`, {
    method: "DELETE",
  });
  return readJson(response);
}

export type AppCommandStatus = "running" | "finished" | "failed";

export type AppCommandRecord = {
  readonly id: string;
  readonly serverId: string;
  readonly service: string;
  readonly command: string;
  readonly directory: string;
  readonly user: string;
  readonly containerName: string | null;
  readonly status: AppCommandStatus;
  readonly exitCode: number | null;
  readonly output: string;
  readonly actorName: string;
  readonly actorInitials: string;
  readonly createdAt: string;
  readonly finishedAt: string | null;
};

export type AppCommandsListResponse = {
  readonly ok: boolean;
  readonly configured?: boolean;
  readonly commands?: readonly AppCommandRecord[];
  readonly command?: AppCommandRecord | null;
  readonly error?: string;
};

export type AppCommandMutationResponse = {
  readonly ok: boolean;
  readonly command?: AppCommandRecord;
  readonly deleted?: boolean;
  readonly error?: string;
};

export async function fetchAppCommands(
  serverId: string,
  service: string,
): Promise<AppCommandsListResponse> {
  const params = new URLSearchParams({ serverId, service });
  const response = await fetch(`/api/hetzner/app-commands?${params.toString()}`);
  return readJson(response);
}

export async function fetchAppCommand(
  serverId: string,
  service: string,
  commandId: string,
): Promise<AppCommandsListResponse> {
  const params = new URLSearchParams({ serverId, service, commandId });
  const response = await fetch(`/api/hetzner/app-commands?${params.toString()}`);
  return readJson(response);
}

export async function runAppCommand(input: {
  readonly serverId: string;
  readonly service: string;
  readonly command: string;
  readonly directory?: string;
  readonly signal?: AbortSignal;
}): Promise<AppCommandMutationResponse> {
  const { signal, ...body } = input;
  const response = await fetch("/api/hetzner/app-commands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  return readJson(response);
}

export async function deleteAppCommand(input: {
  readonly serverId: string;
  readonly service: string;
  readonly commandId: string;
}): Promise<AppCommandMutationResponse> {
  const params = new URLSearchParams({
    serverId: input.serverId,
    service: input.service,
    commandId: input.commandId,
  });
  const response = await fetch(`/api/hetzner/app-commands?${params.toString()}`, {
    method: "DELETE",
  });
  return readJson(response);
}

export type SecurityCredential = {
  readonly id: string;
  readonly username: string;
  readonly password: string;
};

export type AppSecurityRule = {
  readonly id: string;
  readonly serverId: string;
  readonly service: string;
  readonly name: string;
  readonly path: string;
  readonly credentials: readonly SecurityCredential[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type RedirectType = "permanent" | "temporary";

export type AppRedirectRule = {
  readonly id: string;
  readonly serverId: string;
  readonly service: string;
  readonly from: string;
  readonly to: string;
  readonly type: RedirectType;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AppNetworkResponse = {
  readonly ok: boolean;
  readonly configured?: boolean;
  readonly serverId?: string;
  readonly service?: string;
  readonly securityRules?: readonly AppSecurityRule[];
  readonly redirects?: readonly AppRedirectRule[];
  readonly proxyBasicAuthApplied?: boolean;
  readonly proxyBasicAuthNote?: string | null;
  readonly error?: string;
};

export async function fetchAppNetwork(
  serverId: string,
  service: string,
): Promise<AppNetworkResponse> {
  const params = new URLSearchParams({ serverId, service });
  const response = await fetch(`/api/hetzner/app-network?${params.toString()}`);
  return readJson(response);
}

export async function mutateAppNetwork(body: Record<string, unknown>): Promise<AppNetworkResponse> {
  const response = await fetch("/api/hetzner/app-network", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(response);
}

export type AppFramework = "generic" | "wordpress" | "laravel" | "nodejs" | "static" | "docker";

export type AppSiteNote = {
  readonly id: string;
  readonly body: string;
  readonly createdAt: string;
};

export type AppSettingsRecord = {
  readonly serverId: string;
  readonly service: string;
  readonly framework: AppFramework;
  readonly runtimeVersion: string;
  readonly tags: string;
  readonly initial: string;
  readonly accent: string | null;
  readonly avatarDataUrl: string | null;
  readonly notes: readonly AppSiteNote[];
  readonly rootDirectory: string;
  readonly webDirectory: string;
  readonly gitRepository: string;
  readonly gitBranch: string;
  readonly updatedAt: string;
};

export type AppSettingsResponse = {
  readonly ok: boolean;
  readonly configured?: boolean;
  readonly serverId?: string;
  readonly service?: string;
  /** Contract alias — `"wordpress"` when framework is WordPress. */
  readonly runtime?: AppFramework;
  readonly domain?: string;
  readonly image?: string | null;
  readonly detectedRuntime?: string;
  readonly directoryBase?: string;
  readonly settings?: AppSettingsRecord;
  readonly error?: string;
};

export async function fetchAppSettings(
  serverId: string,
  service: string,
): Promise<AppSettingsResponse> {
  const params = new URLSearchParams({ serverId, service });
  const response = await fetch(`/api/hetzner/app-settings?${params.toString()}`);
  return readJson(response);
}

export async function updateAppSettings(
  body: Record<string, unknown>,
): Promise<AppSettingsResponse> {
  const response = await fetch("/api/hetzner/app-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(response);
}

export type DeployAdapter = "kamal" | "script" | "compose" | "wordpress";

export type AppDeploySettings = {
  readonly serverId: string;
  readonly service: string;
  readonly adapter: DeployAdapter;
  readonly deployScript: string;
  readonly injectEnv: boolean;
  readonly hookToken: string;
  readonly healthChecksEnabled: boolean;
  readonly healthCheckPath: string;
  readonly updatedAt: string;
};

export type AppDeployResponse = {
  readonly ok: boolean;
  readonly configured?: boolean;
  readonly serverId?: string;
  readonly service?: string;
  readonly domain?: string;
  readonly directoryBase?: string;
  readonly settings?: AppDeploySettings;
  readonly hookUrl?: string;
  readonly sitePublicKey?: string | null;
  readonly lastDeployAt?: string | null;
  readonly lastDeployStatus?: "success" | "failed" | "running" | null;
  readonly lastDeployOutput?: string | null;
  readonly error?: string;
};

export async function fetchAppDeploy(
  serverId: string,
  service: string,
): Promise<AppDeployResponse> {
  const params = new URLSearchParams({ serverId, service });
  const response = await fetch(`/api/hetzner/app-deploy?${params.toString()}`);
  return readJson(response);
}

export async function updateAppDeploy(body: Record<string, unknown>): Promise<AppDeployResponse> {
  const response = await fetch("/api/hetzner/app-deploy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(response);
}

export type SiteComponentType = "theme" | "platform_plugin" | "client_plugin" | "recipe_mu";

export type SiteComponent = {
  readonly id: string;
  readonly type: SiteComponentType;
  readonly repo: string;
  readonly path: string;
  readonly ref: string;
  readonly autoDeploy: boolean;
  readonly rolloutGroup: string | null;
  readonly lastDeployAt: string | null;
  readonly lastDeployStatus: "success" | "failed" | "running" | "skipped" | null;
  readonly lastDeploySha: string | null;
  readonly updatedAt: string;
};

export type WordpressComponentJob = {
  readonly id: string;
  readonly serverId: string;
  readonly service: string;
  readonly componentId: string;
  readonly componentType: SiteComponentType;
  readonly repo: string;
  readonly path: string;
  readonly ref: string;
  readonly sha: string | null;
  readonly status: "queued" | "running" | "success" | "failed" | "skipped";
  readonly output: string;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
};

export type WordpressComponentsResponse = {
  readonly ok: boolean;
  readonly configured?: boolean;
  readonly serverId?: string;
  readonly service?: string;
  readonly siteRoot?: string;
  readonly webhookToken?: string;
  readonly webhookUrl?: string;
  readonly components?: readonly SiteComponent[];
  readonly jobs?: readonly WordpressComponentJob[];
  readonly error?: string;
};

export async function fetchWordpressComponents(
  serverId: string,
  service: string,
): Promise<WordpressComponentsResponse> {
  const params = new URLSearchParams({ serverId, service });
  const response = await fetch(`/api/hetzner/app-wp-components?${params.toString()}`);
  return readJson(response);
}

export async function mutateWordpressComponents(
  body: Record<string, unknown>,
): Promise<WordpressComponentsResponse> {
  const response = await fetch("/api/hetzner/app-wp-components", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(response);
}

export type AppEnvResponse = {
  readonly ok: boolean;
  readonly configured?: boolean;
  readonly serverId?: string;
  readonly service?: string;
  readonly content?: string;
  readonly remotePath?: string;
  readonly updatedAt?: string | null;
  readonly error?: string;
};

export async function fetchAppEnv(serverId: string, service: string): Promise<AppEnvResponse> {
  const params = new URLSearchParams({ serverId, service });
  const response = await fetch(`/api/hetzner/app-env?${params.toString()}`);
  return readJson(response);
}

export async function updateAppEnv(input: {
  readonly serverId: string;
  readonly service: string;
  readonly content: string;
}): Promise<AppEnvResponse> {
  const response = await fetch("/api/hetzner/app-env", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson(response);
}

export type AppNotificationsSettings = {
  readonly serverId: string;
  readonly service: string;
  readonly failureContactId: string | null;
  readonly failureContactName: string | null;
  readonly deployHookEnabled: boolean;
  readonly deployHookUrl: string;
  readonly updatedAt: string;
};

export type AppNotificationsResponse = {
  readonly ok: boolean;
  readonly configured?: boolean;
  readonly serverId?: string;
  readonly service?: string;
  readonly settings?: AppNotificationsSettings;
  readonly error?: string;
};

export async function fetchAppNotifications(
  serverId: string,
  service: string,
): Promise<AppNotificationsResponse> {
  const params = new URLSearchParams({ serverId, service });
  const response = await fetch(`/api/hetzner/app-notifications?${params.toString()}`);
  return readJson(response);
}

export async function updateAppNotifications(
  body: Record<string, unknown>,
): Promise<AppNotificationsResponse> {
  const response = await fetch("/api/hetzner/app-notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(response);
}

export type AppProjectLink = {
  readonly serverId: string;
  readonly service: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly projectKey: string | null;
  readonly updatedAt: string;
};

export type AppProjectLinkResponse = {
  readonly ok: boolean;
  readonly serverId?: string;
  readonly service?: string;
  readonly link?: AppProjectLink;
  readonly error?: string;
};

export async function fetchAppProjectLink(
  serverId: string,
  service: string,
): Promise<AppProjectLinkResponse> {
  const params = new URLSearchParams({ serverId, service });
  const response = await fetch(`/api/hetzner/app-project-link?${params.toString()}`);
  return readJson(response);
}

export async function updateAppProjectLink(
  body: Record<string, unknown>,
): Promise<AppProjectLinkResponse> {
  const response = await fetch("/api/hetzner/app-project-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(response);
}

export type GithubRefsResponse = {
  readonly ok: boolean;
  readonly repository?: string;
  readonly defaultBranch?: string | null;
  readonly branches?: readonly string[];
  readonly tags?: readonly string[];
  readonly error?: string;
};

export async function fetchGithubRefs(repo: string): Promise<GithubRefsResponse> {
  const params = new URLSearchParams({ repo });
  const response = await fetch(`/api/hetzner/github-refs?${params.toString()}`);
  return readJson(response);
}

export async function fetchHetznerServerConnection(
  serverId: string,
): Promise<HetznerServerConnectionResponse> {
  const params = new URLSearchParams({ serverId });
  const response = await fetch(`/api/hetzner/server-connection?${params.toString()}`);
  return readJson<HetznerServerConnectionResponse>(response);
}

export async function fetchHetznerServerBackups(
  serverId: string,
): Promise<HetznerServerBackupsResponse> {
  const params = new URLSearchParams({ serverId });
  const response = await fetch(`/api/hetzner/server-backups?${params.toString()}`);
  return readJson<HetznerServerBackupsResponse>(response);
}

export type ServerRuntimeResponse = {
  readonly ok: boolean;
  readonly configured?: boolean;
  readonly serverId?: string;
  readonly serverName?: string;
  readonly serverIp?: string;
  readonly docker?: {
    readonly version: string | null;
    readonly containersRunning: number;
    readonly containersTotal: number;
    readonly images: number;
    readonly containers: readonly {
      readonly name: string;
      readonly image: string;
      readonly status: string;
      readonly appName: string | null;
    }[];
  };
  readonly proxy?: {
    readonly present: boolean;
    readonly image: string | null;
    readonly version: string | null;
    readonly status: string | null;
    readonly ports: readonly string[];
    readonly services: readonly {
      readonly name: string;
      readonly hosts: readonly string[];
      readonly tls: boolean;
      readonly paused: boolean;
    }[];
  };
  readonly node?: readonly {
    readonly id: string;
    readonly containerName: string;
    readonly appName: string | null;
    readonly siteDomain: string | null;
    readonly nodeVersion: string;
    readonly npmVersion: string | null;
    readonly image: string;
    readonly status: string;
  }[];
  readonly nginx?: readonly {
    readonly id: string;
    readonly containerName: string;
    readonly appName: string | null;
    readonly siteDomain: string | null;
    readonly nginxVersion: string;
    readonly image: string;
    readonly status: string;
  }[];
  readonly error?: string;
};

export async function fetchHetznerServerRuntime(serverId: string): Promise<ServerRuntimeResponse> {
  const params = new URLSearchParams({ serverId });
  const response = await fetch(`/api/hetzner/server-runtime?${params.toString()}`);
  return readJson<ServerRuntimeResponse>(response);
}

export type ServerMonitorMetric = "cpu_load" | "used_memory" | "used_disk";
export type ServerMonitorOperator = "gte" | "gt" | "lte" | "lt";
export type ServerMonitorNotifyChannel = "support_ticket" | "in_app";

export type ServerMonitor = {
  readonly id: string;
  readonly serverId: string;
  readonly service: string | null;
  readonly metric: ServerMonitorMetric;
  readonly operator: ServerMonitorOperator;
  readonly threshold: number;
  readonly durationMinutes: number;
  readonly notifyChannel: ServerMonitorNotifyChannel;
  readonly notifyContactId: string | null;
  readonly notifyContactName: string | null;
  readonly breachSince?: string | null;
  readonly lastFiredAt?: string | null;
  readonly lastTicketId?: string | null;
  readonly status: "active" | "paused";
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ServerMonitorsResponse = {
  readonly ok: boolean;
  readonly serverId?: string;
  readonly monitors?: readonly ServerMonitor[];
  readonly error?: string;
};

export type CreateServerMonitorInput = {
  readonly serverId: string;
  readonly service?: string | null;
  readonly metric: ServerMonitorMetric;
  readonly operator: ServerMonitorOperator;
  readonly threshold: number;
  readonly durationMinutes: number;
  readonly notifyChannel?: ServerMonitorNotifyChannel;
  readonly notifyContactId: string;
  readonly notifyContactName?: string | null;
};

export type CreateServerMonitorResponse = {
  readonly ok: boolean;
  readonly monitor?: ServerMonitor;
  readonly error?: string;
};

export async function fetchServerMonitors(
  serverId: string,
  options?: { readonly service?: string | null },
): Promise<ServerMonitorsResponse> {
  const params = new URLSearchParams({ serverId });
  if (options && "service" in options) {
    params.set("service", options.service ?? "");
  }
  const response = await fetch(`/api/hetzner/server-monitors?${params.toString()}`);
  return readJson<ServerMonitorsResponse>(response);
}

export async function createServerMonitor(
  input: CreateServerMonitorInput,
): Promise<CreateServerMonitorResponse> {
  const response = await fetch("/api/hetzner/server-monitors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson<CreateServerMonitorResponse>(response);
}

export async function testServerMonitor(input: {
  readonly serverId: string;
  readonly monitorId: string;
}): Promise<{
  readonly ok: boolean;
  readonly ticketId?: string;
  readonly monitor?: ServerMonitor;
  readonly error?: string;
}> {
  const response = await fetch("/api/hetzner/server-monitors/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson(response);
}

export async function deleteServerMonitor(
  serverId: string,
  monitorId: string,
): Promise<{ readonly ok: boolean; readonly error?: string }> {
  const params = new URLSearchParams({ serverId, monitorId });
  const response = await fetch(`/api/hetzner/server-monitors?${params.toString()}`, {
    method: "DELETE",
  });
  return readJson(response);
}

export type ServerLogSource = {
  readonly id: string;
  readonly label: string;
  readonly kind: "file" | "docker" | "journal";
};

export type ServerLogSourcesResponse = {
  readonly ok: boolean;
  readonly configured?: boolean;
  readonly serverId?: string;
  readonly serverName?: string;
  readonly sources?: readonly ServerLogSource[];
  readonly error?: string;
};

export type ServerLogsResponse = {
  readonly ok: boolean;
  readonly configured?: boolean;
  readonly serverId?: string;
  readonly serverName?: string;
  readonly sourceId?: string;
  readonly sourceLabel?: string;
  readonly lines?: readonly string[];
  readonly truncated?: boolean;
  readonly error?: string;
};

export async function fetchServerLogSources(
  serverId: string,
  options?: { readonly service?: string | null },
): Promise<ServerLogSourcesResponse> {
  const params = new URLSearchParams({ serverId });
  if (options && "service" in options) {
    params.set("service", options.service ?? "");
  }
  const response = await fetch(`/api/hetzner/server-log-sources?${params.toString()}`);
  return readJson<ServerLogSourcesResponse>(response);
}

export async function fetchServerLogs(input: {
  readonly serverId: string;
  readonly sourceId: string;
  readonly search?: string;
  readonly lines?: number;
}): Promise<ServerLogsResponse> {
  const params = new URLSearchParams({
    serverId: input.serverId,
    sourceId: input.sourceId,
  });
  if (input.search?.trim()) params.set("search", input.search.trim());
  if (input.lines != null) params.set("lines", String(input.lines));
  const response = await fetch(`/api/hetzner/server-logs?${params.toString()}`);
  return readJson<ServerLogsResponse>(response);
}

export async function wipeServerLogs(input: {
  readonly serverId: string;
  readonly sourceId: string;
}): Promise<{ readonly ok: boolean; readonly wiped?: boolean; readonly error?: string }> {
  const params = new URLSearchParams({
    serverId: input.serverId,
    sourceId: input.sourceId,
  });
  const response = await fetch(`/api/hetzner/server-logs?${params.toString()}`, {
    method: "DELETE",
  });
  return readJson(response);
}

export type ServerActivityItem = {
  readonly id: string;
  readonly title: string;
  readonly command: string;
  readonly status: "running" | "success" | "error";
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly actorName: string;
  readonly actorInitials: string;
  readonly errorMessage: string | null;
};

export type ServerActivityResponse = {
  readonly ok: boolean;
  readonly configured?: boolean;
  readonly serverId?: string;
  readonly serverName?: string;
  readonly items?: readonly ServerActivityItem[];
  readonly error?: string;
};

export async function fetchServerActivity(serverId: string): Promise<ServerActivityResponse> {
  const params = new URLSearchParams({ serverId });
  const response = await fetch(`/api/hetzner/server-activity?${params.toString()}`);
  return readJson<ServerActivityResponse>(response);
}

export type MetricRange = "1h" | "6h" | "24h" | "7d" | "30d";

export type ServerMetricPoint = {
  readonly t: number;
  readonly v: number;
};

export type ServerMetricSeries = {
  readonly id: string;
  readonly label: string;
  readonly unit: "percent" | "mbps";
  readonly color: string;
  readonly current: number | null;
  readonly points: readonly ServerMetricPoint[];
  readonly source: "hetzner" | "guest" | "docker";
};

export type ServerMetricsResponse = {
  readonly ok: boolean;
  readonly configured?: boolean;
  readonly serverId?: string;
  readonly serverName?: string;
  readonly service?: string | null;
  readonly range?: MetricRange;
  readonly start?: string;
  readonly end?: string;
  readonly series?: readonly ServerMetricSeries[];
  readonly error?: string;
};

export async function fetchServerMetrics(
  serverId: string,
  range: MetricRange,
  options?: { readonly service?: string | null },
): Promise<ServerMetricsResponse> {
  const params = new URLSearchParams({ serverId, range });
  if (options && "service" in options) {
    params.set("service", options.service ?? "");
  }
  const response = await fetch(`/api/hetzner/server-metrics?${params.toString()}`);
  return readJson<ServerMetricsResponse>(response);
}

export type ScheduleFrequency =
  | "every_minute"
  | "every_hour"
  | "every_night"
  | "every_week"
  | "every_month";

export type StopSignal = "TERM" | "INT" | "QUIT" | "KILL" | "HUP" | "USR1" | "USR2";

export type BackgroundProcess = {
  readonly id: string;
  readonly serverId: string;
  readonly service: string | null;
  readonly name: string;
  readonly command: string;
  readonly user: string;
  readonly directory: string;
  readonly processes: number;
  readonly startSeconds: number;
  readonly stopSeconds: number;
  readonly stopSignal: StopSignal;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: "running" | "stopped" | "unknown" | "error";
  readonly statusLabel: string;
};

export type ScheduledJob = {
  readonly id: string;
  readonly serverId: string;
  readonly service: string | null;
  readonly name: string;
  readonly command: string;
  readonly user: string;
  readonly frequency: ScheduleFrequency;
  readonly cron: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export async function fetchServerProcessUsers(
  serverId: string,
): Promise<{ readonly ok: boolean; readonly users?: readonly string[]; readonly error?: string }> {
  const params = new URLSearchParams({ serverId });
  const response = await fetch(`/api/hetzner/server-process-users?${params.toString()}`);
  return readJson(response);
}

export async function fetchBackgroundProcesses(
  serverId: string,
  options?: { readonly service?: string | null },
): Promise<{
  readonly ok: boolean;
  readonly processes?: readonly BackgroundProcess[];
  readonly error?: string;
}> {
  const params = new URLSearchParams({ serverId });
  if (options && "service" in options) {
    params.set("service", options.service ?? "");
  }
  const response = await fetch(`/api/hetzner/server-processes?${params.toString()}`);
  return readJson(response);
}

export async function createBackgroundProcess(input: {
  readonly serverId: string;
  readonly service?: string | null;
  readonly name: string;
  readonly command: string;
  readonly user: string;
  readonly directory?: string;
  readonly processes?: number;
  readonly startSeconds?: number;
  readonly stopSeconds?: number;
  readonly stopSignal?: StopSignal;
}): Promise<{
  readonly ok: boolean;
  readonly process?: BackgroundProcess;
  readonly error?: string;
}> {
  const response = await fetch("/api/hetzner/server-processes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson(response);
}

export async function restartBackgroundProcess(
  serverId: string,
  processId: string,
): Promise<{
  readonly ok: boolean;
  readonly process?: BackgroundProcess;
  readonly error?: string;
}> {
  const response = await fetch("/api/hetzner/server-processes/restart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serverId, processId }),
  });
  return readJson(response);
}

export async function deleteBackgroundProcess(
  serverId: string,
  processId: string,
): Promise<{ readonly ok: boolean; readonly error?: string }> {
  const params = new URLSearchParams({ serverId, processId });
  const response = await fetch(`/api/hetzner/server-processes?${params.toString()}`, {
    method: "DELETE",
  });
  return readJson(response);
}

export async function fetchBackgroundProcessLog(
  serverId: string,
  processId: string,
): Promise<{ readonly ok: boolean; readonly lines?: readonly string[]; readonly error?: string }> {
  const params = new URLSearchParams({ serverId, processId });
  const response = await fetch(`/api/hetzner/server-process-log?${params.toString()}`);
  return readJson(response);
}

export async function fetchScheduledJobs(
  serverId: string,
  options?: { readonly service?: string | null },
): Promise<{
  readonly ok: boolean;
  readonly jobs?: readonly ScheduledJob[];
  readonly error?: string;
}> {
  const params = new URLSearchParams({ serverId });
  if (options && "service" in options) {
    params.set("service", options.service ?? "");
  }
  const response = await fetch(`/api/hetzner/server-scheduled-jobs?${params.toString()}`);
  return readJson(response);
}

export async function createScheduledJob(input: {
  readonly serverId: string;
  readonly service?: string | null;
  readonly name: string;
  readonly command: string;
  readonly user: string;
  readonly frequency: ScheduleFrequency;
}): Promise<{ readonly ok: boolean; readonly job?: ScheduledJob; readonly error?: string }> {
  const response = await fetch("/api/hetzner/server-scheduled-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson(response);
}

export async function deleteScheduledJob(
  serverId: string,
  jobId: string,
): Promise<{ readonly ok: boolean; readonly error?: string }> {
  const params = new URLSearchParams({ serverId, jobId });
  const response = await fetch(`/api/hetzner/server-scheduled-jobs?${params.toString()}`, {
    method: "DELETE",
  });
  return readJson(response);
}

export async function createHetznerServer(
  input: CreateHetznerServerInput,
): Promise<CreateHetznerServerResponse> {
  const response = await fetch("/api/hetzner/servers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson<CreateHetznerServerResponse>(response);
}

export function monthlyPriceLabel(
  serverType: HetznerServerType,
  locationName: string,
): string | null {
  const price = serverType.prices.find((entry) => entry.location === locationName);
  if (!price) return null;
  const gross = Number(price.price_monthly.gross);
  if (!Number.isFinite(gross)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(gross);
}
