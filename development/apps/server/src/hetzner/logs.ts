/**
 * Discover and read server log sources over SSH.
 */
import { findHetznerServer } from "./server-connection.ts";
import { containerMatchesService, normalizeServiceScope } from "./service-scope.ts";
import { sshExec } from "./ssh.ts";

export type ServerLogSource = {
  readonly id: string;
  readonly label: string;
  readonly kind: "file" | "docker" | "journal";
};

export type ServerLogFetchResult = {
  readonly serverId: string;
  readonly serverName: string;
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly lines: readonly string[];
  readonly truncated: boolean;
};

type RemoteSourcesPayload = {
  readonly sources?: readonly {
    readonly id: string;
    readonly label: string;
    readonly kind: "file" | "docker" | "journal";
  }[];
  readonly error?: string;
};

const REMOTE_SOURCES_SCRIPT = `
import json, os, subprocess

sources = []

def add(source_id, label, kind):
  sources.append({"id": source_id, "label": label, "kind": kind})

if os.path.isfile("/var/log/auth.log"):
  add("file:auth", "SSH Auth", "file")
if os.path.isfile("/var/log/syslog"):
  add("file:syslog", "Syslog", "file")
unattended = "/var/log/unattended-upgrades/unattended-upgrades.log"
if os.path.isfile(unattended):
  add("file:unattended", "Unattended Upgrades", "file")

try:
  subprocess.check_output(["docker", "inspect", "kamal-proxy"], stderr=subprocess.DEVNULL)
  add("docker:kamal-proxy", "Kamal Proxy", "docker")
except Exception:
  pass

try:
  out = subprocess.check_output(
    ["docker", "ps", "--format", "{{.Names}}\\t{{.Image}}"],
    text=True,
    stderr=subprocess.DEVNULL,
  )
except Exception:
  out = ""

for line in out.splitlines():
  parts = line.split("\\t")
  if len(parts) < 1:
    continue
  name = parts[0]
  if name == "kamal-proxy":
    continue
  label = name
  if "-web-" in name:
    label = name.split("-web-", 1)[0]
  elif name.endswith("-db-1"):
    label = name
  add(f"docker:{name}", label, "docker")

print(json.dumps({"sources": sources}))
`.trim();

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function filePathForSource(sourceId: string): string | null {
  switch (sourceId) {
    case "file:auth":
      return "/var/log/auth.log";
    case "file:syslog":
      return "/var/log/syslog";
    case "file:unattended":
      return "/var/log/unattended-upgrades/unattended-upgrades.log";
    default:
      return null;
  }
}

function dockerNameForSource(sourceId: string): string | null {
  if (!sourceId.startsWith("docker:")) return null;
  return sourceId.slice("docker:".length);
}

function buildFetchCommand(sourceId: string, search: string, lines: number): string {
  const safeLines = Math.min(Math.max(Math.round(lines), 50), 2000);
  const needle = search.trim();
  const grepPart = needle
    ? ` | grep -F -- ${shellQuote(needle)} | tail -n ${safeLines}`
    : ` | tail -n ${safeLines}`;

  const filePath = filePathForSource(sourceId);
  if (filePath) {
    return `echo '=== Beginning of log file ==='; tail -n ${Math.max(safeLines * 4, 400)} ${shellQuote(filePath)}${grepPart}`;
  }

  const dockerName = dockerNameForSource(sourceId);
  if (dockerName) {
    const fetchCount = needle ? Math.max(safeLines * 8, 800) : safeLines;
    return `echo '=== Beginning of log file ==='; docker logs --tail ${fetchCount} ${shellQuote(dockerName)} 2>&1${
      needle ? ` | grep -F -- ${shellQuote(needle)} | tail -n ${safeLines}` : ""
    }`;
  }

  throw new Error(`Unknown log source: ${sourceId}`);
}

function filterSourcesForService(
  sources: readonly ServerLogSource[],
  service: string | null,
): readonly ServerLogSource[] {
  if (!service) return sources;
  return sources.filter((source) => {
    if (source.kind !== "docker") return false;
    const name = dockerNameForSource(source.id);
    return name != null && containerMatchesService(name, service);
  });
}

export async function listServerLogSources(
  serverId: string,
  options?: { readonly service?: string | null },
): Promise<{
  readonly serverId: string;
  readonly serverName: string;
  readonly sources: readonly ServerLogSource[];
}> {
  const server = await findHetznerServer(serverId);
  if (!server) throw new Error("Server not found in Hetzner Cloud");
  const ip = server.public_net.ipv4?.ip;
  if (!ip) throw new Error("Server has no public IPv4 address");

  const stdout = await sshExec(ip, `python3 - <<'PY'\n${REMOTE_SOURCES_SCRIPT}\nPY`);
  if (!stdout) throw new Error("Empty SSH log-sources response");
  const payload = JSON.parse(stdout) as RemoteSourcesPayload;
  if (payload.error) throw new Error(payload.error);

  return {
    serverId: String(server.id),
    serverName: server.name,
    sources: filterSourcesForService(
      payload.sources ?? [],
      normalizeServiceScope(options?.service),
    ),
  };
}

function labelForSourceId(sourceId: string): string {
  if (sourceId === "file:auth") return "SSH Auth";
  if (sourceId === "file:syslog") return "Syslog";
  if (sourceId === "file:unattended") return "Unattended Upgrades";
  if (sourceId === "docker:kamal-proxy") return "Kamal Proxy";
  if (sourceId.startsWith("docker:")) {
    const name = sourceId.slice("docker:".length);
    return name.includes("-web-") ? name.split("-web-")[0]! : name;
  }
  return sourceId;
}

export async function fetchServerLogs(input: {
  readonly serverId: string;
  readonly sourceId: string;
  readonly search?: string;
  readonly lines?: number;
}): Promise<ServerLogFetchResult> {
  const server = await findHetznerServer(input.serverId);
  if (!server) throw new Error("Server not found in Hetzner Cloud");
  const ip = server.public_net.ipv4?.ip;
  if (!ip) throw new Error("Server has no public IPv4 address");

  const sourceId = input.sourceId.trim();
  if (!sourceId) throw new Error("Missing sourceId");

  const command = buildFetchCommand(sourceId, input.search ?? "", input.lines ?? 250);
  const stdout = await sshExec(ip, command, { timeoutMs: 45_000, maxBuffer: 8 * 1024 * 1024 });
  const rawLines = stdout.length > 0 ? stdout.split("\n") : [];

  return {
    serverId: String(server.id),
    serverName: server.name,
    sourceId,
    sourceLabel: labelForSourceId(sourceId),
    lines: rawLines,
    truncated: rawLines.length >= (input.lines ?? 250),
  };
}

function buildWipeCommand(sourceId: string): string {
  const filePath = filePathForSource(sourceId);
  if (filePath) {
    return `truncate -s 0 ${shellQuote(filePath)}`;
  }

  const dockerName = dockerNameForSource(sourceId);
  if (dockerName) {
    return `LOG_PATH=$(docker inspect --format='{{.LogPath}}' ${shellQuote(dockerName)}) && truncate -s 0 "$LOG_PATH"`;
  }

  throw new Error(`Unknown log source: ${sourceId}`);
}

export async function wipeServerLogs(input: {
  readonly serverId: string;
  readonly sourceId: string;
}): Promise<{ readonly serverId: string; readonly sourceId: string; readonly wiped: true }> {
  const server = await findHetznerServer(input.serverId);
  if (!server) throw new Error("Server not found in Hetzner Cloud");
  const ip = server.public_net.ipv4?.ip;
  if (!ip) throw new Error("Server has no public IPv4 address");

  const sourceId = input.sourceId.trim();
  if (!sourceId) throw new Error("Missing sourceId");

  await sshExec(ip, buildWipeCommand(sourceId), { timeoutMs: 20_000 });
  return {
    serverId: String(server.id),
    sourceId,
    wiped: true,
  };
}
