/**
 * Discover Kamal apps + deploy history on Hetzner Cloud hosts via SSH.
 */
import { listServers, type HetznerServer } from "./cloud.ts";
import { findHetznerServer } from "./server-connection.ts";
import { applySavedAppearanceToSites } from "./settings.ts";
import { sshExec } from "./ssh.ts";

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
  readonly status: "success" | "failed";
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

export type DiscoverKamalAppsResult = {
  readonly sites: readonly DiscoveredSite[];
  readonly deployments: readonly DiscoveredDeployment[];
  readonly databases: readonly DiscoveredDatabase[];
  readonly hostsChecked: number;
  readonly hostsWithKamal: number;
  readonly errors: readonly { readonly serverName: string; readonly message: string }[];
};

/** @deprecated Use DiscoverKamalAppsResult */
export type DiscoverSitesResult = DiscoverKamalAppsResult;

type KamalProxyService = {
  readonly name?: string;
  readonly options?: {
    readonly hosts?: readonly string[];
    readonly tls_enabled?: boolean;
  };
  readonly pause_controller?: { readonly state?: number };
};

type RemoteAuditLog = {
  readonly app: string;
  readonly text: string;
};

type RemoteDiscoveryPayload = {
  readonly services?: readonly KamalProxyService[];
  readonly containers?: readonly {
    readonly name: string;
    readonly image: string;
    readonly status: string;
  }[];
  readonly audits?: readonly RemoteAuditLog[];
  readonly databases?: readonly {
    readonly kind: "engine" | "sqlite";
    readonly name: string;
    readonly engine: string;
    readonly engineVersion: string | null;
    readonly image: string | null;
    readonly status: string;
    readonly appName: string | null;
    readonly volume: string | null;
    readonly path: string | null;
    readonly sizeBytes: number | null;
    readonly username: string | null;
    readonly password: string | null;
    readonly databaseName: string | null;
    readonly containerIp: string | null;
    readonly port: number | null;
    readonly containerName?: string | null;
    readonly users: readonly {
      readonly username: string;
      readonly accessLabel: string;
    }[];
    readonly logicalDatabases: readonly {
      readonly name: string;
      readonly sizeBytes: number | null;
    }[];
  }[];
  readonly error?: string;
};

const SITE_ACCENTS = ["#7c5cbf", "#3d9a6a", "#5b8def", "#c4922a", "#c45c5c", "#2f8f8a"] as const;
const MAX_DEPLOYMENTS = 40;

const BOOT_LINE_RE =
  /^\[([^\]]+)\]\s+\[([^\]]*)\]\s+(?:\[web\]\s+)?Booted app version\s+(\S+)\s*$/u;

function accentForKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return SITE_ACCENTS[hash % SITE_ACCENTS.length]!;
}

function initialForDomain(domain: string): string {
  const base = domain.split(".")[0] ?? domain;
  return (base[0] ?? "?").toUpperCase();
}

function shortCommit(version: string): string {
  const clean = version.replace(/_uncommitted_.*$/u, "");
  return clean.slice(0, 7);
}

function parseImage(image: string | null): {
  readonly repository: string | null;
  readonly version: string | null;
  readonly runtime: string;
} {
  if (!image) return { repository: null, version: null, runtime: "Docker" };
  const [repoPart, version = null] = image.split(":");
  const repo = repoPart?.replace(/^ghcr\.io\//, "") ?? null;
  return {
    repository: repo,
    version: version ? shortCommit(version) : null,
    runtime: "Docker",
  };
}

function matchContainer(
  serviceName: string,
  containers: readonly { readonly name: string; readonly image: string; readonly status: string }[],
) {
  const exactPrefix = `${serviceName}-`;
  const matches = containers.filter(
    (container) => container.name === serviceName || container.name.startsWith(exactPrefix),
  );
  return matches[0] ?? null;
}

function deployedLabelFromStatus(status: string | null): string {
  if (!status) return "Deployed via Kamal";
  const upMatch = /^Up\s+(.+)$/i.exec(status.trim());
  if (upMatch) return `Up ${upMatch[1]}`;
  return status;
}

function serviceStatus(service: KamalProxyService, containerStatus: string | null): string {
  if (service.pause_controller?.state && service.pause_controller.state !== 0) return "paused";
  if (containerStatus?.toLowerCase().startsWith("up")) return "running";
  if (containerStatus) return containerStatus.toLowerCase();
  return "unknown";
}

function formatRelativeTime(iso: string, nowMs = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return iso;
  const deltaSec = Math.round((then - nowMs) / 1000);
  const abs = Math.abs(deltaSec);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return rtf.format(deltaSec, "second");
  const deltaMin = Math.round(deltaSec / 60);
  if (Math.abs(deltaMin) < 60) return rtf.format(deltaMin, "minute");
  const deltaHr = Math.round(deltaMin / 60);
  if (Math.abs(deltaHr) < 48) return rtf.format(deltaHr, "hour");
  const deltaDay = Math.round(deltaHr / 24);
  return rtf.format(deltaDay, "day");
}

function appKeyFromService(serviceName: string): string {
  return serviceName.replace(/-web$/u, "");
}

const REMOTE_DISCOVERY_SCRIPT = `
import glob, json, os, subprocess, sys
state_candidates = [
  "/var/lib/docker/volumes/kamal-proxy-config/_data/kamal-proxy.state",
  "/home/deploy/.kamal/proxy/kamal-proxy.state",
]
state_path = next((p for p in state_candidates if os.path.isfile(p)), None)
services = []
if state_path is None:
  try:
    subprocess.check_output(["docker", "inspect", "kamal-proxy"], stderr=subprocess.DEVNULL)
  except Exception:
    print(json.dumps({"error": "kamal-proxy not found", "services": [], "containers": [], "audits": [], "databases": []}))
    sys.exit(0)
else:
  with open(state_path, "r", encoding="utf-8") as handle:
    services = json.load(handle)

containers = []
try:
  out = subprocess.check_output(
    ["docker", "ps", "--format", "{{.Names}}\\t{{.Image}}\\t{{.Status}}"],
    text=True,
  )
  for line in out.splitlines():
    parts = line.split("\\t")
    if len(parts) >= 3 and parts[0] != "kamal-proxy":
      containers.append({"name": parts[0], "image": parts[1], "status": parts[2]})
except Exception:
  pass

audits = []
for path in sorted(glob.glob("/home/deploy/.kamal/*-audit.log")):
  app = os.path.basename(path)[:-len("-audit.log")]
  try:
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
      text = handle.read()
  except Exception:
    continue
  audits.append({"app": app, "text": text[-100000:]})

ENGINE_RULES = [
  ("postgres", "PostgreSQL"),
  ("postgis", "PostgreSQL"),
  ("mysql", "MySQL"),
  ("mariadb", "MariaDB"),
  ("redis", "Redis"),
  ("valkey", "Valkey"),
  ("mongo", "MongoDB"),
  ("memcached", "Memcached"),
]

def engine_for_image(image):
  base = image.split("/")[-1].split(":")[0].lower()
  for hint, label in ENGINE_RULES:
    if hint in base:
      return label
  return None

def app_name_from_container(name):
  if "-web-" in name:
    return name.split("-web-", 1)[0]
  if "-db-" in name:
    return name.split("-db-", 1)[0]
  if "-accessory-" in name:
    return name.split("-accessory-", 1)[0]
  parts = name.rsplit("-", 1)
  return parts[0] if len(parts) == 2 and len(parts[1]) >= 7 else name

def env_map(info):
  out = {}
  for item in info.get("Config", {}).get("Env") or []:
    if "=" in item:
      key, value = item.split("=", 1)
      out[key] = value
  return out

def container_ip(info):
  networks = (info.get("NetworkSettings") or {}).get("Networks") or {}
  for network in networks.values():
    ip = network.get("IPAddress")
    if ip:
      return ip
  return None

def published_port(info, container_port):
  ports = (info.get("NetworkSettings") or {}).get("Ports") or {}
  bindings = ports.get(f"{container_port}/tcp") or []
  if bindings:
    try:
      return int(bindings[0].get("HostPort"))
    except Exception:
      return container_port
  return container_port

def run_exec(name, args):
  try:
    return subprocess.check_output(["docker", "exec", name, *args], text=True, stderr=subprocess.DEVNULL)
  except Exception:
    return ""

def postgres_details(name, envs):
  user = envs.get("POSTGRES_USER") or envs.get("POSTGRESQL_USER") or "postgres"
  password = envs.get("POSTGRES_PASSWORD") or envs.get("POSTGRESQL_PASSWORD")
  dbname = envs.get("POSTGRES_DB") or envs.get("POSTGRESQL_DATABASE") or user
  version = None
  version_out = run_exec(name, ["psql", "-U", user, "-d", dbname, "-tAc", "SHOW server_version"])
  if version_out.strip():
    version = version_out.strip().split(" ")[0]
  users = []
  roles_out = run_exec(name, ["psql", "-U", user, "-d", dbname, "-tAc", "SELECT rolname FROM pg_roles WHERE rolcanlogin = true ORDER BY rolname"])
  for role in roles_out.splitlines():
    role = role.strip()
    if role:
      users.append({"username": role, "accessLabel": "Login role"})
  logical = []
  dbs_out = run_exec(name, ["psql", "-U", user, "-d", dbname, "-tAc", "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"])
  for db in dbs_out.splitlines():
    db = db.strip()
    if db:
      logical.append({"name": db, "sizeBytes": None})
  if not logical and dbname:
    logical.append({"name": dbname, "sizeBytes": None})
  return user, password, dbname, version, users, logical

def mysql_details(name, envs):
  user = envs.get("MYSQL_USER") or envs.get("MARIADB_USER") or "root"
  password = envs.get("MYSQL_PASSWORD") or envs.get("MARIADB_PASSWORD") or envs.get("MYSQL_ROOT_PASSWORD") or envs.get("MARIADB_ROOT_PASSWORD")
  dbname = envs.get("MYSQL_DATABASE") or envs.get("MARIADB_DATABASE") or user
  version = None
  version_out = run_exec(name, ["mysql", f"-u{user}", f"-p{password}" if password else "", "-N", "-e", "SELECT VERSION()"] )
  # mysql CLI with empty -p is awkward; retry without empty flag
  if not version_out.strip() and password:
    version_out = run_exec(name, ["mysql", f"-u{user}", f"-p{password}", "-N", "-e", "SELECT VERSION()"])
  if version_out.strip():
    version = version_out.strip().split("-")[0]
  users = [{"username": user, "accessLabel": "Configured user"}] if user else []
  logical = [{"name": dbname, "sizeBytes": None}] if dbname else []
  return user, password, dbname, version, users, logical

databases = []
seen_sqlite = set()
seen_engines = set()
for container in containers:
  image = container["image"]
  engine = engine_for_image(image)
  try:
    info = json.loads(subprocess.check_output(["docker", "inspect", container["name"]], text=True))[0]
  except Exception:
    info = None

  if engine and container["name"] not in seen_engines and engine in ("PostgreSQL", "MySQL", "MariaDB"):
    seen_engines.add(container["name"])
    envs = env_map(info) if info else {}
    username = password = database_name = engine_version = None
    users = []
    logical = []
    port = 5432 if engine == "PostgreSQL" else 3306
    if engine == "PostgreSQL":
      username, password, database_name, engine_version, users, logical = postgres_details(container["name"], envs)
      port = published_port(info, 5432) if info else 5432
    else:
      username, password, database_name, engine_version, users, logical = mysql_details(container["name"], envs)
      port = published_port(info, 3306) if info else 3306
    databases.append({
      "kind": "engine",
      "name": database_name or container["name"],
      "engine": engine,
      "engineVersion": engine_version,
      "image": image,
      "status": container["status"],
      "appName": app_name_from_container(container["name"]),
      "volume": None,
      "path": None,
      "sizeBytes": None,
      "username": username,
      "password": password,
      "databaseName": database_name,
      "containerIp": container_ip(info) if info else None,
      "port": port,
      "users": users,
      "logicalDatabases": logical,
      "containerName": container["name"],
    })
  elif engine and container["name"] not in seen_engines:
    seen_engines.add(container["name"])
    databases.append({
      "kind": "engine",
      "name": container["name"],
      "engine": engine,
      "engineVersion": None,
      "image": image,
      "status": container["status"],
      "appName": app_name_from_container(container["name"]),
      "volume": None,
      "path": None,
      "sizeBytes": None,
      "username": None,
      "password": None,
      "databaseName": None,
      "containerIp": container_ip(info) if info else None,
      "port": None,
      "users": [],
      "logicalDatabases": [],
      "containerName": container["name"],
    })

  if not info:
    continue
  app_name = app_name_from_container(container["name"])
  for mount in info.get("Mounts") or []:
    src = mount.get("Source")
    volume = mount.get("Name")
    if not src or not os.path.isdir(src):
      continue
    for root, dirs, files in os.walk(src):
      depth = root[len(src):].count(os.sep)
      if depth > 2:
        dirs[:] = []
        continue
      for filename in files:
        low = filename.lower()
        if not (low.endswith(".sqlite") or low.endswith(".sqlite3") or low.endswith(".db")):
          continue
        key = (volume or src, filename)
        if key in seen_sqlite:
          continue
        seen_sqlite.add(key)
        file_path = os.path.join(root, filename)
        try:
          size_bytes = os.path.getsize(file_path)
        except Exception:
          size_bytes = None
        databases.append({
          "kind": "sqlite",
          "name": filename,
          "engine": "SQLite",
          "engineVersion": None,
          "image": image,
          "status": container["status"],
          "appName": app_name,
          "volume": volume,
          "path": file_path,
          "sizeBytes": size_bytes,
          "username": None,
          "password": None,
          "databaseName": filename,
          "containerIp": None,
          "port": None,
          "users": [],
          "logicalDatabases": [{"name": filename, "sizeBytes": size_bytes}],
          "containerName": container["name"],
        })

payload = {"services": services, "containers": containers, "audits": audits, "databases": databases}
if state_path is None:
  payload["error"] = "kamal-proxy.state missing"
print(json.dumps(payload))
`.trim();

async function sshDiscover(ip: string): Promise<RemoteDiscoveryPayload> {
  const stdout = await sshExec(ip, `python3 - <<'PY'\n${REMOTE_DISCOVERY_SCRIPT}\nPY`);
  if (!stdout) {
    return { error: "Empty SSH response" };
  }
  return JSON.parse(stdout) as RemoteDiscoveryPayload;
}

function sitesFromHost(
  server: HetznerServer,
  ip: string,
  payload: RemoteDiscoveryPayload,
): DiscoveredSite[] {
  const services = payload.services ?? [];
  const containers = payload.containers ?? [];
  const sites: DiscoveredSite[] = [];

  for (const service of services) {
    const serviceName = service.name?.trim();
    if (!serviceName) continue;
    const hosts = (service.options?.hosts ?? []).filter((host) => host.trim().length > 0);
    if (hosts.length === 0) continue;

    const container = matchContainer(serviceName, containers);
    const image = container?.image ?? null;
    const parsed = parseImage(image);
    const domain = hosts[0]!;
    const appName = appKeyFromService(serviceName);

    sites.push({
      id: `${server.id}:${serviceName}`,
      service: serviceName,
      domain,
      hosts,
      serverName: server.name,
      serverId: server.id,
      serverIp: ip,
      image,
      repository: parsed.repository ?? appName,
      version: parsed.version,
      runtime: parsed.runtime,
      status: serviceStatus(service, container?.status ?? null),
      tls: service.options?.tls_enabled === true,
      deployedLabel: deployedLabelFromStatus(container?.status ?? null),
      accent: accentForKey(serviceName),
      initial: initialForDomain(domain),
    });
  }

  return sites;
}

function resolveSiteForApp(
  appName: string,
  sites: readonly DiscoveredSite[],
): DiscoveredSite | null {
  const exact = sites.find((site) => appKeyFromService(site.service) === appName);
  if (exact) return exact;
  return (
    sites.find(
      (site) =>
        site.service === appName ||
        site.service.startsWith(`${appName}-`) ||
        appKeyFromService(site.service).startsWith(appName),
    ) ?? null
  );
}

function deploymentsFromHost(
  server: HetznerServer,
  sites: readonly DiscoveredSite[],
  payload: RemoteDiscoveryPayload,
): DiscoveredDeployment[] {
  const deployments: DiscoveredDeployment[] = [];

  for (const audit of payload.audits ?? []) {
    const site = resolveSiteForApp(audit.app, sites);
    const domain = site?.domain ?? `${audit.app}.unknown`;
    const accent = site?.accent ?? accentForKey(audit.app);
    const initial = site?.initial ?? initialForDomain(domain);

    for (const line of audit.text.split("\n")) {
      const match = BOOT_LINE_RE.exec(line.trim());
      if (!match) continue;
      const [, atRaw, actorRaw, versionRaw] = match;
      if (!atRaw || !versionRaw) continue;
      const at = new Date(atRaw).toISOString();
      const actor = actorRaw?.trim() || null;
      const commit = shortCommit(versionRaw);
      const actorLabel = actor ? ` by ${actor}` : "";

      deployments.push({
        id: `${server.id}:${audit.app}:${versionRaw}:${atRaw}`,
        status: "success",
        commit,
        version: versionRaw,
        siteDomain: domain,
        siteAccent: accent,
        siteInitial: initial,
        summary: `Booted app version ${commit}`,
        meta: `Deployed ${formatRelativeTime(at)}${actorLabel} via Kamal`,
        actor,
        appName: audit.app,
        serverName: server.name,
        serverId: server.id,
        at,
      });
    }
  }

  return deployments;
}

function formatBytes(sizeBytes: number | null | undefined): string | null {
  if (sizeBytes == null || !Number.isFinite(sizeBytes) || sizeBytes < 0) return null;
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = sizeBytes / 1024;
  for (const unit of units) {
    if (value < 1024) {
      return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${unit}`;
    }
    value /= 1024;
  }
  return `${Math.round(value)} TB`;
}

function maskSecret(value: string): string {
  return "*".repeat(Math.min(Math.max(value.length, 8), 12));
}

function buildConnectionUrls(input: {
  readonly kind: "engine" | "sqlite";
  readonly engine: string;
  readonly serverIp: string;
  readonly serverName: string;
  readonly username: string | null;
  readonly password: string | null;
  readonly databaseName: string | null;
  readonly containerIp: string | null;
  readonly port: number | null;
  readonly path: string | null;
}): { readonly connectionUrl: string | null; readonly connectionUrlMasked: string | null } {
  const nameParam = encodeURIComponent(input.serverName);
  if (input.kind === "sqlite" && input.path) {
    const url = `sqlite+ssh://root@${input.serverIp}${input.path}?name=${nameParam}`;
    return { connectionUrl: url, connectionUrlMasked: url };
  }

  if (!input.username || !input.databaseName || !input.containerIp || !input.port) {
    return { connectionUrl: null, connectionUrlMasked: null };
  }

  const scheme =
    input.engine === "PostgreSQL"
      ? "postgres+ssh"
      : input.engine === "MySQL" || input.engine === "MariaDB"
        ? "mysql+ssh"
        : null;
  if (!scheme) return { connectionUrl: null, connectionUrlMasked: null };

  const password = input.password ?? "";
  const auth = password
    ? `${encodeURIComponent(input.username)}:${encodeURIComponent(password)}`
    : encodeURIComponent(input.username);
  const authMasked = password
    ? `${encodeURIComponent(input.username)}:${maskSecret(password)}`
    : encodeURIComponent(input.username);
  const base = `${scheme}://root@${input.serverIp}/${auth}@${input.containerIp}:${input.port}/${encodeURIComponent(input.databaseName)}?name=${nameParam}`;
  const masked = `${scheme}://root@${input.serverIp}/${authMasked}@${input.containerIp}:${input.port}/${encodeURIComponent(input.databaseName)}?name=${nameParam}`;
  return { connectionUrl: base, connectionUrlMasked: masked };
}

function databasesFromHost(
  server: HetznerServer,
  ip: string,
  sites: readonly DiscoveredSite[],
  payload: RemoteDiscoveryPayload,
): DiscoveredDatabase[] {
  const databases: DiscoveredDatabase[] = [];

  for (const entry of payload.databases ?? []) {
    const site = entry.appName ? resolveSiteForApp(entry.appName, sites) : null;
    const labelKey = entry.appName ?? entry.name;
    const { connectionUrl, connectionUrlMasked } = buildConnectionUrls({
      kind: entry.kind,
      engine: entry.engine,
      serverIp: ip,
      serverName: server.name,
      username: entry.username,
      password: entry.password,
      databaseName: entry.databaseName ?? entry.name,
      containerIp: entry.containerIp,
      port: entry.port,
      path: entry.path,
    });

    const logicalDatabases =
      (entry.logicalDatabases ?? []).length > 0
        ? entry.logicalDatabases
        : [{ name: entry.name, sizeBytes: entry.sizeBytes }];

    databases.push({
      id: `${server.id}:${entry.kind}:${entry.containerName ?? entry.volume ?? "none"}:${entry.name}`,
      kind: entry.kind,
      name: entry.name,
      engine: entry.engine,
      engineVersion: entry.engineVersion ?? null,
      appName: entry.appName,
      siteDomain: site?.domain ?? null,
      volume: entry.volume,
      path: entry.path,
      sizeLabel: formatBytes(entry.sizeBytes),
      status: deployedLabelFromStatus(entry.status),
      serverName: server.name,
      serverId: server.id,
      serverIp: ip,
      accent: site?.accent ?? accentForKey(labelKey),
      initial: site?.initial ?? initialForDomain(entry.appName ?? entry.name),
      username: entry.username ?? null,
      databaseName: entry.databaseName ?? entry.name,
      containerName: entry.containerName ?? null,
      connectionUrl,
      connectionUrlMasked,
      users: (entry.users ?? []).map((user) => ({
        id: `${server.id}:${entry.name}:${user.username}`,
        username: user.username,
        accessLabel: user.accessLabel,
      })),
      logicalDatabases: logicalDatabases.map((database) => ({
        id: `${server.id}:${entry.name}:db:${database.name}`,
        name: database.name,
        sizeLabel: formatBytes(database.sizeBytes),
      })),
    });
  }

  databases.sort((a, b) => a.name.localeCompare(b.name));
  return databases;
}

export async function discoverKamalApps(
  servers?: readonly HetznerServer[],
): Promise<DiscoverKamalAppsResult> {
  const hostList = servers ?? (await listServers());
  const errors: { serverName: string; message: string }[] = [];
  const sites: DiscoveredSite[] = [];
  const deployments: DiscoveredDeployment[] = [];
  const databases: DiscoveredDatabase[] = [];
  let hostsWithKamal = 0;

  await Promise.all(
    hostList.map(async (server) => {
      const ip = server.public_net.ipv4?.ip;
      if (!ip) {
        errors.push({ serverName: server.name, message: "No public IPv4" });
        return;
      }

      try {
        const payload = await sshDiscover(ip);
        if (
          payload.error &&
          !payload.services?.length &&
          !payload.audits?.length &&
          !payload.databases?.length
        ) {
          errors.push({ serverName: server.name, message: payload.error });
          return;
        }
        const discoveredSites = applySavedAppearanceToSites(sitesFromHost(server, ip, payload));
        if (
          discoveredSites.length > 0 ||
          (payload.audits?.length ?? 0) > 0 ||
          (payload.databases?.length ?? 0) > 0
        ) {
          hostsWithKamal += 1;
        }
        sites.push(...discoveredSites);
        deployments.push(...deploymentsFromHost(server, discoveredSites, payload));
        databases.push(...databasesFromHost(server, ip, discoveredSites, payload));
      } catch (error) {
        errors.push({
          serverName: server.name,
          message: error instanceof Error ? error.message : "SSH discovery failed",
        });
      }
    }),
  );

  sites.sort((a, b) => a.domain.localeCompare(b.domain));
  deployments.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  databases.sort((a, b) => a.name.localeCompare(b.name));

  return {
    sites,
    deployments: deployments.slice(0, MAX_DEPLOYMENTS),
    databases,
    hostsChecked: hostList.length,
    hostsWithKamal,
    errors,
  };
}

/** @deprecated Prefer discoverKamalApps */
export async function discoverKamalSites(
  servers?: readonly HetznerServer[],
): Promise<DiscoverKamalAppsResult> {
  return discoverKamalApps(servers);
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

export type DeleteKamalSiteResult = {
  readonly serverId: string;
  readonly service: string;
  readonly domain: string | null;
  readonly proxyRemoved: boolean;
  readonly containersRemoved: readonly string[];
};

/**
 * Remove a Kamal app from proxy routing and stop/remove its containers.
 * Docker volumes are left in place on purpose.
 */
export async function deleteKamalSite(input: {
  readonly serverId: string;
  readonly service: string;
}): Promise<DeleteKamalSiteResult> {
  const service = input.service.trim();
  if (!service) throw new Error("service is required");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u.test(service)) {
    throw new Error("Invalid service name");
  }

  const server = await findHetznerServer(input.serverId);
  if (!server) throw new Error("Server not found in Hetzner Cloud");
  const ip = server.public_net.ipv4?.ip;
  if (!ip) throw new Error("Server has no public IPv4 address");

  const appKey = appKeyFromService(service);
  const discovery = await sshExec(
    ip,
    [
      "python3 - <<'PY'",
      "import json, subprocess",
      `service = ${JSON.stringify(service)}`,
      `app_key = ${JSON.stringify(appKey)}`,
      "out = subprocess.check_output(['docker','ps','-a','--format','{{.Names}}'], text=True)",
      "names = [line.strip() for line in out.splitlines() if line.strip()]",
      "matched = []",
      "for name in names:",
      "  if name == service or name.startswith(service + '-') or name.startswith(app_key + '-'):",
      "    matched.append(name)",
      "print(json.dumps(matched))",
      "PY",
    ].join("\n"),
    { timeoutMs: 30_000 },
  );

  let containers: string[] = [];
  try {
    const parsed = JSON.parse(discovery) as unknown;
    if (Array.isArray(parsed)) {
      containers = parsed.filter((entry): entry is string => typeof entry === "string");
    }
  } catch {
    containers = [];
  }

  // Never touch kamal-proxy itself.
  containers = containers.filter((name) => name !== "kamal-proxy");

  let proxyRemoved = false;
  try {
    await sshExec(ip, `docker exec kamal-proxy kamal-proxy remove ${shellSingleQuote(service)}`, {
      timeoutMs: 45_000,
    });
    proxyRemoved = true;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    // Already gone is fine.
    if (!/not found|unknown service|no such/iu.test(message)) {
      throw cause instanceof Error ? cause : new Error(message);
    }
    proxyRemoved = true;
  }

  const removed: string[] = [];
  for (const name of containers) {
    try {
      await sshExec(
        ip,
        `docker stop ${shellSingleQuote(name)} >/dev/null 2>&1 || true; docker rm -f ${shellSingleQuote(name)} >/dev/null 2>&1 || true`,
        { timeoutMs: 60_000 },
      );
      removed.push(name);
    } catch {
      // continue removing others
    }
  }

  return {
    serverId: String(server.id),
    service,
    domain: null,
    proxyRemoved,
    containersRemoved: removed,
  };
}
