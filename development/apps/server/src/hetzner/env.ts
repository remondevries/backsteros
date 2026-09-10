/**
 * App environment (.env) storage for Settings → Environment.
 * Persisted in the control plane and mirrored to the host for deploy scripts.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { findHetznerServer } from "./server-connection.ts";
import { normalizeServiceScope } from "./service-scope.ts";
import { sshExec } from "./ssh.ts";

export type AppEnvPayload = {
  readonly serverId: string;
  readonly service: string;
  readonly content: string;
  readonly remotePath: string;
  readonly updatedAt: string | null;
};

type EnvFile = {
  readonly entries: Array<{
    readonly serverId: string;
    readonly service: string;
    readonly content: string;
    readonly updatedAt: string;
  }>;
};

function envFilePath(): string {
  return path.join(os.homedir(), ".config", "backsteros", "app-env.json");
}

function readFile(): EnvFile {
  try {
    const raw = fs.readFileSync(envFilePath(), "utf8");
    const parsed = JSON.parse(raw) as EnvFile;
    if (!parsed || !Array.isArray(parsed.entries)) return { entries: [] };
    return { entries: parsed.entries };
  } catch {
    return { entries: [] };
  }
}

function writeFile(data: EnvFile): void {
  const filePath = envFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function remoteEnvPath(service: string): string {
  const safe = service.replace(/[^a-zA-Z0-9._-]/gu, "_");
  return `/home/deploy/.backsteros/env/${safe}.env`;
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

async function readRemoteEnv(ip: string, remotePath: string): Promise<string | null> {
  try {
    const raw = await sshExec(
      ip,
      [
        "python3 - <<'PY'",
        "from pathlib import Path",
        `path = Path(${JSON.stringify(remotePath)})`,
        "print(path.read_text() if path.is_file() else '')",
        "PY",
      ].join("\n"),
      { timeoutMs: 20_000 },
    );
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

async function writeRemoteEnv(ip: string, remotePath: string, content: string): Promise<void> {
  const remote = [
    "python3 - <<'PY'",
    "from pathlib import Path",
    `path = Path(${JSON.stringify(remotePath)})`,
    `content = ${JSON.stringify(content)}`,
    "path.parent.mkdir(parents=True, exist_ok=True)",
    "path.write_text(content if content.endswith('\\n') or content == '' else content + '\\n')",
    "print('ok')",
    "PY",
  ].join("\n");
  await sshExec(ip, remote, { timeoutMs: 30_000 });
}

export async function loadAppEnv(
  serverIdInput: string,
  serviceInput: string,
): Promise<AppEnvPayload> {
  const service = normalizeServiceScope(serviceInput);
  if (!service) throw new Error("service is required");
  const { serverId, ip } = await resolveServer(serverIdInput);
  const remotePath = remoteEnvPath(service);
  const file = readFile();
  const stored = file.entries.find(
    (entry) => entry.serverId === serverId && entry.service === service,
  );

  let content = stored?.content ?? "";
  let updatedAt = stored?.updatedAt ?? null;

  if (!stored) {
    const remote = await readRemoteEnv(ip, remotePath);
    if (remote != null && remote.length > 0) {
      content = remote;
      updatedAt = new Date().toISOString();
      writeFile({
        entries: [{ serverId, service, content, updatedAt }, ...file.entries],
      });
    }
  }

  return { serverId, service, content, remotePath, updatedAt };
}

export async function updateAppEnv(input: {
  readonly serverId: string;
  readonly service: string;
  readonly content: string;
}): Promise<AppEnvPayload> {
  const service = normalizeServiceScope(input.service);
  if (!service) throw new Error("service is required");
  if (input.content.length > 500_000) throw new Error("Environment file is too large");
  const { serverId, ip } = await resolveServer(input.serverId);
  const remotePath = remoteEnvPath(service);
  const content = input.content.replace(/\r\n/gu, "\n");
  const updatedAt = new Date().toISOString();

  await writeRemoteEnv(ip, remotePath, content);

  const file = readFile();
  const without = file.entries.filter(
    (entry) => !(entry.serverId === serverId && entry.service === service),
  );
  writeFile({
    entries: [{ serverId, service, content, updatedAt }, ...without],
  });

  return { serverId, service, content, remotePath, updatedAt };
}
