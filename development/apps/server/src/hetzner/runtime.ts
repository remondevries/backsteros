/**
 * Discover Docker / Kamal Proxy / Node / Nginx runtimes on a Hetzner host via SSH.
 */
import { findHetznerServer } from "./server-connection.ts";
import { sshExec } from "./ssh.ts";

export type DiscoveredRuntimeContainer = {
  readonly name: string;
  readonly image: string;
  readonly status: string;
  readonly appName: string | null;
};

export type DiscoveredNodeRuntime = {
  readonly id: string;
  readonly containerName: string;
  readonly appName: string | null;
  readonly siteDomain: string | null;
  readonly nodeVersion: string;
  readonly npmVersion: string | null;
  readonly image: string;
  readonly status: string;
};

export type DiscoveredNginxRuntime = {
  readonly id: string;
  readonly containerName: string;
  readonly appName: string | null;
  readonly siteDomain: string | null;
  readonly nginxVersion: string;
  readonly image: string;
  readonly status: string;
};

export type DiscoveredProxyService = {
  readonly name: string;
  readonly hosts: readonly string[];
  readonly tls: boolean;
  readonly paused: boolean;
};

export type ServerRuntimeDiscovery = {
  readonly serverId: string;
  readonly serverName: string;
  readonly serverIp: string;
  readonly docker: {
    readonly version: string | null;
    readonly containersRunning: number;
    readonly containersTotal: number;
    readonly images: number;
    readonly containers: readonly DiscoveredRuntimeContainer[];
  };
  readonly proxy: {
    readonly present: boolean;
    readonly image: string | null;
    readonly version: string | null;
    readonly status: string | null;
    readonly ports: readonly string[];
    readonly services: readonly DiscoveredProxyService[];
  };
  readonly node: readonly DiscoveredNodeRuntime[];
  readonly nginx: readonly DiscoveredNginxRuntime[];
};

type RemoteRuntimePayload = {
  readonly dockerVersion?: string | null;
  readonly containersRunning?: number;
  readonly containersTotal?: number;
  readonly images?: number;
  readonly containers?: readonly {
    readonly name: string;
    readonly image: string;
    readonly status: string;
  }[];
  readonly proxy?: {
    readonly present: boolean;
    readonly image: string | null;
    readonly status: string | null;
    readonly ports: readonly string[];
    readonly services: readonly {
      readonly name?: string;
      readonly options?: {
        readonly hosts?: readonly string[];
        readonly tls_enabled?: boolean;
      };
      readonly pause_controller?: { readonly state?: number };
    }[];
  };
  readonly node?: readonly {
    readonly containerName: string;
    readonly image: string;
    readonly status: string;
    readonly nodeVersion: string;
    readonly npmVersion: string | null;
  }[];
  readonly nginx?: readonly {
    readonly containerName: string;
    readonly image: string;
    readonly status: string;
    readonly nginxVersion: string;
  }[];
  readonly error?: string;
};

const REMOTE_RUNTIME_SCRIPT = `
import json, os, re, subprocess

def run(cmd):
  try:
    return subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL).strip()
  except Exception:
    return ""

docker_version = run(["docker", "version", "--format", "{{.Server.Version}}"]) or None
ps = run(["docker", "ps", "-a", "--format", "{{.Names}}\\t{{.Image}}\\t{{.Status}}"])
containers = []
running = 0
for line in ps.splitlines():
  parts = line.split("\\t")
  if len(parts) < 3:
    continue
  name, image, status = parts[0], parts[1], parts[2]
  containers.append({"name": name, "image": image, "status": status})
  if status.lower().startswith("up"):
    running += 1

images_out = run(["docker", "images", "-q"])
images = len([line for line in images_out.splitlines() if line.strip()])

proxy = {"present": False, "image": None, "status": None, "ports": [], "services": []}
try:
  inspect = json.loads(subprocess.check_output(["docker", "inspect", "kamal-proxy"], text=True))[0]
  proxy["present"] = True
  proxy["image"] = (inspect.get("Config") or {}).get("Image")
  proxy["status"] = (inspect.get("State") or {}).get("Status")
  ports = []
  for key, bindings in ((inspect.get("NetworkSettings") or {}).get("Ports") or {}).items():
    if not bindings:
      ports.append(key)
      continue
    for binding in bindings:
      host = binding.get("HostIp") or "0.0.0.0"
      ports.append(f"{host}:{binding.get('HostPort')}->{key}")
  proxy["ports"] = ports
except Exception:
  pass

state_candidates = [
  "/var/lib/docker/volumes/kamal-proxy-config/_data/kamal-proxy.state",
  "/home/deploy/.kamal/proxy/kamal-proxy.state",
]
state_path = next((p for p in state_candidates if os.path.isfile(p)), None)
if state_path:
  try:
    with open(state_path, "r", encoding="utf-8") as handle:
      proxy["services"] = json.load(handle)
  except Exception:
    pass

def app_name_from_container(name):
  if name == "kamal-proxy":
    return None
  if "-web-" in name:
    return name.split("-web-", 1)[0]
  if "-db-" in name:
    return name.split("-db-", 1)[0]
  parts = name.rsplit("-", 1)
  return parts[0] if len(parts) == 2 and len(parts[1]) >= 7 else name

node_runtimes = []
nginx_runtimes = []
for container in containers:
  name = container["name"]
  if name in ("kamal-proxy",) or not container["status"].lower().startswith("up"):
    continue
  if "postgres" in container["image"].lower() or name.endswith("-db-1") or "-db-" in name:
    continue

  node_v = run(["docker", "exec", name, "node", "-v"])
  npm_v = run(["docker", "exec", name, "npm", "-v"]) if node_v else ""
  if node_v:
    node_runtimes.append({
      "containerName": name,
      "image": container["image"],
      "status": container["status"],
      "nodeVersion": node_v.lstrip("v"),
      "npmVersion": npm_v or None,
      "appName": app_name_from_container(name),
    })

  nginx_out = ""
  try:
    nginx_out = subprocess.check_output(
      ["docker", "exec", name, "nginx", "-v"],
      text=True,
      stderr=subprocess.STDOUT,
    ).strip()
  except Exception as exc:
    nginx_out = str(getattr(exc, "output", "") or "")
  match = re.search(r"nginx/(?:version:\\s*)?([0-9.]+)", nginx_out, re.I)
  if not match:
    match = re.search(r"([0-9]+\\.[0-9]+(?:\\.[0-9]+)?)", nginx_out)
  if match:
    nginx_runtimes.append({
      "containerName": name,
      "image": container["image"],
      "status": container["status"],
      "nginxVersion": match.group(1),
      "appName": app_name_from_container(name),
    })

print(json.dumps({
  "dockerVersion": docker_version,
  "containersRunning": running,
  "containersTotal": len(containers),
  "images": images,
  "containers": containers,
  "proxy": proxy,
  "node": node_runtimes,
  "nginx": nginx_runtimes,
}))
`.trim();

function proxyVersionFromImage(image: string | null): string | null {
  if (!image) return null;
  const match = /:v?([0-9][0-9A-Za-z._-]*)\s*$/u.exec(image);
  return match?.[1] ?? null;
}

function domainFromHosts(hosts: readonly string[]): string | null {
  return hosts.find((host) => host.trim().length > 0) ?? null;
}

export async function discoverServerRuntime(serverId: string): Promise<ServerRuntimeDiscovery> {
  const server = await findHetznerServer(serverId);
  if (!server) {
    throw new Error("Server not found in Hetzner Cloud");
  }
  const ip = server.public_net.ipv4?.ip;
  if (!ip) {
    throw new Error("Server has no public IPv4 address");
  }

  const stdout = await sshExec(ip, `python3 - <<'PY'\n${REMOTE_RUNTIME_SCRIPT}\nPY`, {
    timeoutMs: 45_000,
  });
  if (!stdout) {
    throw new Error("Empty SSH runtime response");
  }

  const payload = JSON.parse(stdout) as RemoteRuntimePayload;
  if (payload.error) {
    throw new Error(payload.error);
  }

  const proxyServices = (payload.proxy?.services ?? [])
    .map((service) => {
      const name = service.name?.trim();
      if (!name) return null;
      const hosts = (service.options?.hosts ?? []).filter((host) => host.trim().length > 0);
      return {
        name,
        hosts,
        tls: service.options?.tls_enabled === true,
        paused: Boolean(service.pause_controller?.state && service.pause_controller.state !== 0),
      } satisfies DiscoveredProxyService;
    })
    .filter((service): service is DiscoveredProxyService => service != null);

  const hostByApp = new Map<string, string>();
  for (const service of proxyServices) {
    const domain = domainFromHosts(service.hosts);
    if (!domain) continue;
    hostByApp.set(service.name, domain);
    hostByApp.set(service.name.replace(/-web$/u, ""), domain);
  }

  return {
    serverId: String(server.id),
    serverName: server.name,
    serverIp: ip,
    docker: {
      version: payload.dockerVersion ?? null,
      containersRunning: payload.containersRunning ?? 0,
      containersTotal: payload.containersTotal ?? 0,
      images: payload.images ?? 0,
      containers: (payload.containers ?? []).map((container) => ({
        name: container.name,
        image: container.image,
        status: container.status,
        appName:
          container.name === "kamal-proxy"
            ? null
            : container.name.includes("-web-")
              ? (container.name.split("-web-")[0] ?? null)
              : null,
      })),
    },
    proxy: {
      present: payload.proxy?.present ?? false,
      image: payload.proxy?.image ?? null,
      version: proxyVersionFromImage(payload.proxy?.image ?? null),
      status: payload.proxy?.status ?? null,
      ports: payload.proxy?.ports ?? [],
      services: proxyServices,
    },
    node: (payload.node ?? []).map((entry) => ({
      id: `${server.id}:node:${entry.containerName}`,
      containerName: entry.containerName,
      appName: entry.appName,
      siteDomain:
        (entry.appName ? hostByApp.get(entry.appName) : null) ??
        (entry.appName ? hostByApp.get(`${entry.appName}-web`) : null) ??
        null,
      nodeVersion: entry.nodeVersion,
      npmVersion: entry.npmVersion,
      image: entry.image,
      status: entry.status,
    })),
    nginx: (payload.nginx ?? []).map((entry) => ({
      id: `${server.id}:nginx:${entry.containerName}`,
      containerName: entry.containerName,
      appName: entry.appName,
      siteDomain:
        (entry.appName ? hostByApp.get(entry.appName) : null) ??
        (entry.appName ? hostByApp.get(`${entry.appName}-web`) : null) ??
        null,
      nginxVersion: entry.nginxVersion,
      image: entry.image,
      status: entry.status,
    })),
  };
}
