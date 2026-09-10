/**
 * Forge-style app deployment settings (Option B).
 * Shared contract for Kamal + future WordPress/Compose sites:
 * deploy script on host, hook token, health check, site public key.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadAppDomains } from "./domains.ts";
import { findHetznerServer } from "./server-connection.ts";
import { normalizeServiceScope } from "./service-scope.ts";
import { sshExec } from "./ssh.ts";
import { notifyAppDeployOutcome } from "./notifications.ts";

export const DEPLOY_ADAPTERS = ["kamal", "script", "compose", "wordpress"] as const;
export type DeployAdapter = (typeof DEPLOY_ADAPTERS)[number];

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

export type AppDeployPayload = {
  readonly serverId: string;
  readonly service: string;
  readonly domain: string;
  readonly directoryBase: string;
  readonly settings: AppDeploySettings;
  readonly hookUrl: string;
  readonly sitePublicKey: string | null;
  readonly lastDeployAt: string | null;
  readonly lastDeployStatus: "success" | "failed" | "running" | null;
  readonly lastDeployOutput: string | null;
};

type DeployRunRecord = {
  readonly id: string;
  readonly serverId: string;
  readonly service: string;
  readonly status: "success" | "failed" | "running";
  readonly output: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
};

type DeployFile = {
  readonly settings: AppDeploySettings[];
  readonly runs: DeployRunRecord[];
};

const DEPLOY_TIMEOUT_MS = 10 * 60 * 1000;

function deployFilePath(): string {
  return path.join(os.homedir(), ".config", "backsteros", "app-deploy.json");
}

function readFile(): DeployFile {
  try {
    const raw = fs.readFileSync(deployFilePath(), "utf8");
    const parsed = JSON.parse(raw) as DeployFile;
    return {
      settings: Array.isArray(parsed.settings) ? parsed.settings : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
    };
  } catch {
    return { settings: [], runs: [] };
  }
}

function writeFile(data: DeployFile): void {
  const filePath = deployFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function newHookToken(): string {
  return randomBytes(24).toString("base64url");
}

function isAdapter(value: unknown): value is DeployAdapter {
  return typeof value === "string" && (DEPLOY_ADAPTERS as readonly string[]).includes(value);
}

function defaultKamalScript(input: {
  readonly service: string;
  readonly domain: string;
  readonly directoryBase: string;
}): string {
  const siteRoot = input.directoryBase || "/app";
  return `#!/bin/sh
set -eu

# BacksterOS deploy adapter: kamal
# Runs on the app host over SSH. Customize freely for WordPress/Compose later.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

SITE_ROOT=${JSON.stringify(siteRoot)}
SERVICE=${JSON.stringify(input.service)}
DOMAIN=${JSON.stringify(input.domain)}
BRANCH="\${BACKSTEROS_SITE_BRANCH:-main}"

echo "==> Deploy \${SERVICE} (\${DOMAIN}) branch=\${BRANCH}"
echo "==> Site root \${SITE_ROOT}"

# Prefer restarting matching containers after an external image publish.
# For git-based / compose sites, replace this block with pull + rebuild steps.
MATCHES="$(docker ps --format '{{.Names}}' | grep -E "^(\${SERVICE}|$(echo "\${SERVICE}" | sed 's/-web$//'))" || true)"
if [ -z "\${MATCHES}" ]; then
  echo "No running containers matched \${SERVICE}" >&2
  exit 1
fi

echo "\${MATCHES}" | while read -r name; do
  echo "==> Restart \${name}"
  docker restart "\${name}" >/dev/null
done

echo "==> Deploy finished"
`;
}

async function resolveServer(serverId: string): Promise<{
  readonly serverId: string;
  readonly ip: string;
}> {
  const server = await findHetznerServer(serverId);
  if (!server) throw new Error("Server not found in Hetzner Cloud");
  const ip = server.public_net.ipv4?.ip;
  if (!ip) throw new Error("Server has no public IPv4 address");
  return { serverId: String(server.id), ip };
}

async function resolveDirectoryBase(ip: string, service: string): Promise<string> {
  try {
    const raw = await sshExec(
      ip,
      [
        "python3 - <<'PY'",
        "import json, subprocess",
        `service = ${JSON.stringify(service)}`,
        "app_key = service[:-4] if service.endswith('-web') else service",
        "out = subprocess.check_output(['docker','ps','--format','{{.Names}}'], text=True, stderr=subprocess.DEVNULL)",
        "match = None",
        "for name in out.splitlines():",
        "  name = name.strip()",
        "  if name == service or name.startswith(service + '-') or name == app_key or name.startswith(app_key + '-'):",
        "    match = name",
        "    break",
        "if not match:",
        "  print(json.dumps({'workdir': '/app'}))",
        "  raise SystemExit(0)",
        "inspect = json.loads(subprocess.check_output(['docker', 'inspect', match], text=True))[0]",
        "workdir = (inspect.get('Config') or {}).get('WorkingDir') or '/app'",
        "print(json.dumps({'workdir': workdir}))",
        "PY",
      ].join("\n"),
      { timeoutMs: 25_000 },
    );
    const parsed = JSON.parse(raw.trim()) as { readonly workdir?: string };
    return parsed.workdir?.trim() || "/app";
  } catch {
    return "/app";
  }
}

async function fetchSitePublicKey(ip: string): Promise<string | null> {
  try {
    const raw = await sshExec(
      ip,
      [
        "python3 - <<'PY'",
        "from pathlib import Path",
        "candidates = [",
        "  Path.home() / '.ssh' / 'id_ed25519.pub',",
        "  Path.home() / '.ssh' / 'id_rsa.pub',",
        "  Path('/home/deploy/.ssh/id_ed25519.pub'),",
        "  Path('/home/deploy/.ssh/id_rsa.pub'),",
        "  Path('/root/.ssh/id_ed25519.pub'),",
        "  Path('/root/.ssh/id_rsa.pub'),",
        "]",
        "for path in candidates:",
        "  try:",
        "    text = path.read_text().strip()",
        "    if text:",
        "      print(text)",
        "      raise SystemExit(0)",
        "  except Exception:",
        "    pass",
        "print('')",
        "PY",
      ].join("\n"),
      { timeoutMs: 20_000 },
    );
    const key = raw.trim();
    return key || null;
  } catch {
    return null;
  }
}

function hookBaseUrl(): string {
  const fromEnv = process.env.BACKSTEROS_DEPLOY_HOOK_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/u, "");
  return "https://deploy.backsteros.com";
}

function buildHookUrl(serverId: string, service: string, token: string): string {
  const params = new URLSearchParams({ serverId, service, token });
  return `${hookBaseUrl()}/api/hetzner/app-deploy-hook?${params.toString()}`;
}

function ensureSettings(input: {
  readonly serverId: string;
  readonly service: string;
  readonly domain: string;
  readonly directoryBase: string;
  readonly existing?: AppDeploySettings;
}): AppDeploySettings {
  if (input.existing) return input.existing;
  const now = new Date().toISOString();
  return {
    serverId: input.serverId,
    service: input.service,
    adapter: "kamal",
    deployScript: defaultKamalScript({
      service: input.service,
      domain: input.domain,
      directoryBase: input.directoryBase,
    }),
    injectEnv: true,
    hookToken: newHookToken(),
    healthChecksEnabled: false,
    healthCheckPath: "/up",
    updatedAt: now,
  };
}

function latestRun(
  runs: readonly DeployRunRecord[],
  serverId: string,
  service: string,
): DeployRunRecord | null {
  return (
    runs
      .filter((run) => run.serverId === serverId && run.service === service)
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0] ?? null
  );
}

export async function loadAppDeploySettings(
  serverIdInput: string,
  serviceInput: string,
): Promise<AppDeployPayload> {
  const service = normalizeServiceScope(serviceInput);
  if (!service) throw new Error("service is required");
  const { serverId, ip } = await resolveServer(serverIdInput);
  const domains = await loadAppDomains(serverId, service);
  const domain = domains.canonicalHost || domains.hosts[0]?.host || service;
  const directoryBase = await resolveDirectoryBase(ip, service);
  const file = readFile();
  const existing = file.settings.find(
    (entry) => entry.serverId === serverId && entry.service === service,
  );
  const settings = ensureSettings({
    serverId,
    service,
    domain,
    directoryBase,
    ...(existing ? { existing } : {}),
  });
  if (!existing) {
    writeFile({
      settings: [settings, ...file.settings],
      runs: file.runs,
    });
  }
  const run = latestRun(file.runs, serverId, service);
  const sitePublicKey = await fetchSitePublicKey(ip);
  return {
    serverId,
    service,
    domain,
    directoryBase,
    settings,
    hookUrl: buildHookUrl(serverId, service, settings.hookToken),
    sitePublicKey,
    lastDeployAt: run?.finishedAt ?? run?.startedAt ?? null,
    lastDeployStatus: run?.status ?? null,
    lastDeployOutput: run?.output ?? null,
  };
}

export async function updateAppDeploySettings(input: {
  readonly serverId: string;
  readonly service: string;
  readonly adapter?: DeployAdapter;
  readonly deployScript?: string;
  readonly injectEnv?: boolean;
  readonly healthChecksEnabled?: boolean;
  readonly healthCheckPath?: string;
  readonly rotateHookToken?: boolean;
}): Promise<AppDeployPayload> {
  const current = await loadAppDeploySettings(input.serverId, input.service);
  const prev = current.settings;
  if (input.adapter !== undefined && !isAdapter(input.adapter)) {
    throw new Error("Invalid deploy adapter");
  }
  const next: AppDeploySettings = {
    ...prev,
    adapter: input.adapter ?? prev.adapter,
    deployScript: input.deployScript !== undefined ? input.deployScript : prev.deployScript,
    injectEnv: input.injectEnv ?? prev.injectEnv,
    healthChecksEnabled: input.healthChecksEnabled ?? prev.healthChecksEnabled,
    healthCheckPath:
      input.healthCheckPath !== undefined
        ? input.healthCheckPath.trim() || "/up"
        : prev.healthCheckPath,
    hookToken: input.rotateHookToken ? newHookToken() : prev.hookToken,
    updatedAt: new Date().toISOString(),
  };
  if (!next.deployScript.trim()) throw new Error("Deploy script is required");

  const file = readFile();
  const without = file.settings.filter(
    (entry) => !(entry.serverId === next.serverId && entry.service === next.service),
  );
  writeFile({ settings: [next, ...without], runs: file.runs });

  return {
    ...current,
    settings: next,
    hookUrl: buildHookUrl(next.serverId, next.service, next.hookToken),
  };
}

export async function triggerAppDeploy(input: {
  readonly serverId: string;
  readonly service: string;
  readonly token?: string;
  readonly branch?: string;
}): Promise<AppDeployPayload> {
  const current = await loadAppDeploySettings(input.serverId, input.service);
  if (input.token && input.token !== current.settings.hookToken) {
    throw new Error("Invalid deploy hook token");
  }

  const { ip } = await resolveServer(current.serverId);
  const startedAt = new Date().toISOString();
  const runId = randomBytes(8).toString("hex");
  const pending: DeployRunRecord = {
    id: runId,
    serverId: current.serverId,
    service: current.service,
    status: "running",
    output: "",
    startedAt,
    finishedAt: null,
  };
  const file = readFile();
  writeFile({
    settings: file.settings,
    runs: [pending, ...file.runs].slice(0, 50),
  });

  const branch = input.branch?.trim() || "main";
  const remote = [
    "python3 - <<'PY'",
    "import json, os, subprocess, tempfile, textwrap",
    `script = ${JSON.stringify(current.settings.deployScript)}`,
    `inject_env = ${current.settings.injectEnv ? "True" : "False"}`,
    `branch = ${JSON.stringify(branch)}`,
    `service = ${JSON.stringify(current.service)}`,
    `domain = ${JSON.stringify(current.domain)}`,
    "env = os.environ.copy()",
    "env['BACKSTEROS_SITE_BRANCH'] = branch",
    "env['BACKSTEROS_SERVICE'] = service",
    "env['BACKSTEROS_DOMAIN'] = domain",
    "if not inject_env:",
    "  # Keep only a small safe set when injectEnv is off.",
    "  keep = {'PATH','HOME','USER','LANG','BACKSTEROS_SITE_BRANCH','BACKSTEROS_SERVICE','BACKSTEROS_DOMAIN'}",
    "  env = {k: v for k, v in env.items() if k in keep}",
    "with tempfile.NamedTemporaryFile('w', delete=False, suffix='.sh') as handle:",
    "  handle.write(script if script.endswith('\\n') else script + '\\n')",
    "  path = handle.name",
    "try:",
    "  proc = subprocess.run(['bash', path], capture_output=True, text=True, env=env, timeout=600)",
    "  out = (proc.stdout or '') + (proc.stderr or '')",
    "  print(json.dumps({'exitCode': proc.returncode, 'output': out[-180000:]}))",
    "except subprocess.TimeoutExpired as exc:",
    "  out = ((exc.stdout or '') if isinstance(exc.stdout, str) else '') + ((exc.stderr or '') if isinstance(exc.stderr, str) else '')",
    "  print(json.dumps({'exitCode': 124, 'output': (out or 'Deploy timed out after 10 minutes')[-180000:]}))",
    "finally:",
    "  try: os.unlink(path)",
    "  except Exception: pass",
    "PY",
  ].join("\n");

  let exitCode = 1;
  let output = "";
  try {
    const raw = await sshExec(ip, remote, {
      timeoutMs: DEPLOY_TIMEOUT_MS + 15_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const parsed = JSON.parse(raw.trim()) as {
      readonly exitCode?: number;
      readonly output?: string;
    };
    exitCode = typeof parsed.exitCode === "number" ? parsed.exitCode : 1;
    output = parsed.output ?? "";
  } catch (cause) {
    output = cause instanceof Error ? cause.message : String(cause);
    exitCode = 1;
  }

  if (exitCode === 0 && current.settings.healthChecksEnabled) {
    const healthPath = current.settings.healthCheckPath.startsWith("/")
      ? current.settings.healthCheckPath
      : `/${current.settings.healthCheckPath}`;
    const healthUrl = `https://${current.domain}${healthPath}`;
    try {
      const healthRaw = await sshExec(
        ip,
        `curl -fsS -o /dev/null -w '%{http_code}' --max-time 20 ${JSON.stringify(healthUrl)} || true`,
        { timeoutMs: 30_000 },
      );
      const code = healthRaw.trim();
      output += `\n==> Health check ${healthUrl} -> ${code || "failed"}`;
      if (!/^(200|201|204)$/u.test(code)) {
        exitCode = 1;
      }
    } catch (cause) {
      output += `\n==> Health check failed: ${cause instanceof Error ? cause.message : String(cause)}`;
      exitCode = 1;
    }
  }

  const finished: DeployRunRecord = {
    ...pending,
    status: exitCode === 0 ? "success" : "failed",
    output,
    finishedAt: new Date().toISOString(),
  };
  const latest = readFile();
  writeFile({
    settings: latest.settings,
    runs: [finished, ...latest.runs.filter((run) => run.id !== finished.id)].slice(0, 50),
  });

  void notifyAppDeployOutcome({
    serverId: current.serverId,
    service: current.service,
    domain: current.domain,
    status: finished.status,
    output: finished.output,
    finishedAt: finished.finishedAt,
  }).catch(() => undefined);

  return {
    ...current,
    lastDeployAt: finished.finishedAt,
    lastDeployStatus: finished.status,
    lastDeployOutput: finished.output,
  };
}
