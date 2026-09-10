/**
 * App domain + TLS management via kamal-proxy (no Cloudflare).
 * Hosts are updated by redeploying the service with the same target and new --host flags.
 */
import { findHetznerServer } from "./server-connection.ts";
import { sshExec } from "./ssh.ts";

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

export type AppDomainsPayload = {
  readonly serverId: string;
  readonly serverName: string;
  readonly serverIp: string;
  readonly service: string;
  readonly hosts: readonly AppDomainEntry[];
  readonly tls: boolean;
  readonly canonicalHost: string | null;
  readonly target: string | null;
  readonly certificate: AppCertificateInfo;
};

type ProxyServiceState = {
  readonly name: string;
  readonly options: {
    readonly hosts: readonly string[];
    readonly path_prefixes?: readonly string[];
    readonly tls_enabled?: boolean;
    readonly tls_certificate_path?: string;
    readonly tls_private_key_path?: string;
    readonly tls_redirect?: boolean;
    readonly canonical_host?: string;
    readonly forward_headers?: boolean;
  };
  readonly target_options?: {
    readonly health_check_config?: {
      readonly path?: string;
      readonly host?: string;
    };
    readonly buffer_requests?: boolean;
    readonly buffer_responses?: boolean;
    readonly forward_headers?: boolean;
  };
  readonly active_targets?: readonly string[];
};

const HOST_RE =
  /^(?=.{1,253}$)(?!-)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/u;

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

function normalizeHost(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, "")
    .replace(/\/.*$/u, "")
    .replace(/\.$/u, "");
}

function assertValidHost(host: string): void {
  if (!HOST_RE.test(host)) {
    throw new Error("Enter a valid domain name (e.g. example.com)");
  }
}

async function readProxyService(ip: string, service: string): Promise<ProxyServiceState> {
  const raw = await sshExec(
    ip,
    [
      "python3 - <<'PY'",
      "import json",
      `service = ${JSON.stringify(service)}`,
      "paths = [",
      "  '/var/lib/docker/volumes/kamal-proxy-config/_data/kamal-proxy.state',",
      "  '/home/deploy/.kamal/proxy/kamal-proxy.state',",
      "]",
      "data = None",
      "for path in paths:",
      "  try:",
      "    with open(path) as handle:",
      "      data = json.load(handle)",
      "    break",
      "  except Exception:",
      "    pass",
      "if data is None:",
      "  print(json.dumps({'error': 'kamal-proxy.state missing'}))",
      "  raise SystemExit(0)",
      "entries = data if isinstance(data, list) else data.get('services') or data.get('Services') or []",
      "match = None",
      "for entry in entries:",
      "  name = entry.get('name') or entry.get('Name')",
      "  if name == service:",
      "    match = entry",
      "    break",
      "if match is None:",
      "  print(json.dumps({'error': f'service {service} not found'}))",
      "else:",
      "  print(json.dumps(match))",
      "PY",
    ].join("\n"),
    { timeoutMs: 25_000 },
  );

  const parsed = JSON.parse(raw.trim()) as ProxyServiceState & { readonly error?: string };
  if (parsed.error) throw new Error(parsed.error);
  if (!parsed.name) throw new Error("Invalid kamal-proxy state");
  return parsed;
}

function certificateFromState(
  state: ProxyServiceState,
  hosts: readonly string[],
): AppCertificateInfo {
  const tls = state.options.tls_enabled === true;
  if (!tls) {
    return {
      provider: "none",
      label: "No certificate",
      hostsLabel: hosts.join(", ") || "—",
      status: "disabled",
    };
  }
  const customCert = (state.options.tls_certificate_path ?? "").trim().length > 0;
  const hostsLabel =
    hosts.length <= 1 ? (hosts[0] ?? "—") : `${hosts[0]} + ${hosts.length - 1} more`;
  return {
    provider: customCert ? "custom" : "lets_encrypt",
    label: customCert ? "Custom certificate" : "Let's Encrypt",
    hostsLabel,
    status: "active",
  };
}

function toPayload(
  serverId: string,
  serverName: string,
  serverIp: string,
  service: string,
  state: ProxyServiceState,
): AppDomainsPayload {
  const hosts = (state.options.hosts ?? [])
    .map((host) => normalizeHost(host))
    .filter((host) => host.length > 0);
  const canonical = (state.options.canonical_host ?? "").trim() || null;
  return {
    serverId,
    serverName,
    serverIp,
    service,
    hosts: hosts.map((host, index) => ({ host, primary: index === 0 })),
    tls: state.options.tls_enabled === true,
    canonicalHost: canonical,
    target: state.active_targets?.[0] ?? null,
    certificate: certificateFromState(state, hosts),
  };
}

async function redeployWithHosts(
  ip: string,
  service: string,
  state: ProxyServiceState,
  hosts: readonly string[],
  options?: {
    readonly canonicalHost?: string | null;
    /** Pass credentials to set site-wide basic auth; null clears (omit flag). */
    readonly basicAuth?: { readonly username: string; readonly password: string } | null;
  },
): Promise<void> {
  const target = state.active_targets?.[0];
  if (!target) throw new Error("Service has no active target to redeploy");
  if (hosts.length === 0) throw new Error("At least one domain is required");

  const healthPath = state.target_options?.health_check_config?.path || "/up";
  const healthHost = state.target_options?.health_check_config?.host || "";
  const tls = state.options.tls_enabled === true;
  const forwardHeaders =
    state.target_options?.forward_headers ?? state.options.forward_headers ?? true;
  const canonical =
    options && "canonicalHost" in options
      ? options.canonicalHost?.trim() || ""
      : (state.options.canonical_host ?? "").trim();

  const parts = [
    "docker exec kamal-proxy kamal-proxy deploy",
    shellSingleQuote(service),
    `--target ${shellSingleQuote(target)}`,
    ...hosts.map((host) => `--host ${shellSingleQuote(host)}`),
    `--health-check-path ${shellSingleQuote(healthPath)}`,
    "--force",
    "--deploy-timeout 15s",
  ];
  if (healthHost) parts.push(`--health-check-host ${shellSingleQuote(healthHost)}`);
  if (tls) parts.push("--tls");
  if (forwardHeaders) parts.push("--forward-headers");
  if (state.target_options?.buffer_requests) parts.push("--buffer-requests");
  if (state.target_options?.buffer_responses) parts.push("--buffer-responses");
  if (canonical) parts.push(`--canonical-host ${shellSingleQuote(canonical)}`);
  if (options && "basicAuth" in options && options.basicAuth) {
    const cred = `${options.basicAuth.username}:${options.basicAuth.password}`;
    parts.push(`--basic-auth ${shellSingleQuote(cred)}`);
  }

  await sshExec(ip, parts.join(" "), { timeoutMs: 90_000 });
}

/**
 * Apply or clear site-wide HTTP basic auth via kamal-proxy deploy.
 * Path-scoped rules are not supported by kamal-proxy; only whole-site credentials apply.
 */
export async function applyAppBasicAuth(input: {
  readonly serverId: string;
  readonly service: string;
  readonly username: string | null;
  readonly password: string | null;
}): Promise<void> {
  const service = input.service.trim();
  if (!service) throw new Error("service is required");
  const { ip } = await resolveServer(input.serverId);
  const state = await readProxyService(ip, service);
  const hosts = (state.options.hosts ?? []).map(normalizeHost).filter(Boolean);
  if (hosts.length === 0) throw new Error("App has no domains to protect");

  const username = input.username?.trim() || null;
  const password = input.password ?? null;
  const basicAuth =
    username && password !== null && password.length > 0 ? { username, password } : null;

  await redeployWithHosts(ip, service, state, hosts, { basicAuth });
}

async function resolveServer(serverId: string): Promise<{
  readonly serverId: string;
  readonly serverName: string;
  readonly ip: string;
}> {
  const server = await findHetznerServer(serverId);
  if (!server) throw new Error("Server not found in Hetzner Cloud");
  const ip = server.public_net.ipv4?.ip;
  if (!ip) throw new Error("Server has no public IPv4 address");
  return { serverId: String(server.id), serverName: server.name, ip };
}

export async function loadAppDomains(
  serverId: string,
  serviceInput: string,
): Promise<AppDomainsPayload> {
  const service = serviceInput.trim();
  if (!service) throw new Error("service is required");
  const { serverId: id, serverName, ip } = await resolveServer(serverId);
  const state = await readProxyService(ip, service);
  return toPayload(id, serverName, ip, service, state);
}

export async function addAppDomain(input: {
  readonly serverId: string;
  readonly service: string;
  readonly host: string;
}): Promise<AppDomainsPayload> {
  const service = input.service.trim();
  const host = normalizeHost(input.host);
  assertValidHost(host);

  const { serverId, serverName, ip } = await resolveServer(input.serverId);
  const state = await readProxyService(ip, service);
  const current = (state.options.hosts ?? []).map(normalizeHost).filter(Boolean);
  if (current.includes(host)) throw new Error("Domain is already attached to this app");

  const next = [...current, host];
  await redeployWithHosts(ip, service, state, next);
  const refreshed = await readProxyService(ip, service);
  return toPayload(serverId, serverName, ip, service, refreshed);
}

export async function removeAppDomain(input: {
  readonly serverId: string;
  readonly service: string;
  readonly host: string;
}): Promise<AppDomainsPayload> {
  const service = input.service.trim();
  const host = normalizeHost(input.host);
  assertValidHost(host);

  const { serverId, serverName, ip } = await resolveServer(input.serverId);
  const state = await readProxyService(ip, service);
  const current = (state.options.hosts ?? []).map(normalizeHost).filter(Boolean);
  if (!current.includes(host)) throw new Error("Domain not found on this app");
  if (current.length <= 1) throw new Error("Cannot remove the last domain");

  const next = current.filter((entry) => entry !== host);
  await redeployWithHosts(ip, service, state, next);
  const refreshed = await readProxyService(ip, service);
  return toPayload(serverId, serverName, ip, service, refreshed);
}

export async function setPrimaryAppDomain(input: {
  readonly serverId: string;
  readonly service: string;
  readonly host: string;
}): Promise<AppDomainsPayload> {
  const service = input.service.trim();
  const host = normalizeHost(input.host);
  assertValidHost(host);

  const { serverId, serverName, ip } = await resolveServer(input.serverId);
  const state = await readProxyService(ip, service);
  const current = (state.options.hosts ?? []).map(normalizeHost).filter(Boolean);
  if (!current.includes(host)) throw new Error("Domain not found on this app");
  if (current[0] === host) {
    return toPayload(serverId, serverName, ip, service, state);
  }

  const next = [host, ...current.filter((entry) => entry !== host)];
  await redeployWithHosts(ip, service, state, next);
  const refreshed = await readProxyService(ip, service);
  return toPayload(serverId, serverName, ip, service, refreshed);
}
