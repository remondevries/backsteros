/**
 * App shell commands (Forge-style): run inside the Kamal app container over SSH.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { findHetznerServer } from "./server-connection.ts";
import { normalizeServiceScope } from "./service-scope.ts";
import { sshExec } from "./ssh.ts";

const COMMAND_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 200_000;
const MAX_HISTORY = 100;

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

type CommandsFile = {
  readonly commands: AppCommandRecord[];
};

function commandsFilePath(): string {
  return path.join(os.homedir(), ".config", "backsteros", "app-commands.json");
}

function readFile(): CommandsFile {
  try {
    const raw = fs.readFileSync(commandsFilePath(), "utf8");
    const parsed = JSON.parse(raw) as CommandsFile;
    if (!parsed || !Array.isArray(parsed.commands)) return { commands: [] };
    return { commands: parsed.commands };
  } catch {
    return { commands: [] };
  }
}

function writeFile(data: CommandsFile): void {
  const filePath = commandsFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function truncateOutput(value: string): string {
  if (value.length <= MAX_OUTPUT_CHARS) return value;
  return `${value.slice(0, MAX_OUTPUT_CHARS)}\n\n… truncated …`;
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

async function resolveAppContainer(
  ip: string,
  service: string,
): Promise<{ readonly containerName: string; readonly workdir: string }> {
  const raw = await sshExec(
    ip,
    [
      "python3 - <<'PY'",
      "import json, subprocess",
      `service = ${JSON.stringify(service)}`,
      "app_key = service[:-4] if service.endswith('-web') else service",
      "out = subprocess.check_output(['docker','ps','--format','{{.Names}}'], text=True, stderr=subprocess.DEVNULL)",
      "names = [line.strip() for line in out.splitlines() if line.strip()]",
      "match = None",
      "for name in names:",
      "  if name == service or name.startswith(service + '-') or name == app_key or name.startswith(app_key + '-'):",
      "    match = name",
      "    break",
      "if not match:",
      "  print(json.dumps({'error': 'No running container found for this app'}))",
      "  raise SystemExit(0)",
      "inspect = json.loads(subprocess.check_output(['docker','inspect', match], text=True))[0]",
      "workdir = (inspect.get('Config') or {}).get('WorkingDir') or '/'",
      "print(json.dumps({'containerName': match, 'workdir': workdir}))",
      "PY",
    ].join("\n"),
    { timeoutMs: 30_000 },
  );
  const parsed = JSON.parse(raw.trim()) as {
    readonly error?: string;
    readonly containerName?: string;
    readonly workdir?: string;
  };
  if (parsed.error) throw new Error(parsed.error);
  if (!parsed.containerName) throw new Error("No running container found for this app");
  return {
    containerName: parsed.containerName,
    workdir: parsed.workdir?.trim() || "/",
  };
}

function assertSafeCommand(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) throw new Error("Command is required");
  if (trimmed.length > 4000) throw new Error("Command is too long");
  return trimmed;
}

export async function listAppCommands(
  serverId: string,
  serviceInput: string,
): Promise<readonly AppCommandRecord[]> {
  const service = normalizeServiceScope(serviceInput);
  if (!service) throw new Error("service is required");
  const { serverId: id } = await resolveServer(serverId);
  return readFile()
    .commands.filter((entry) => entry.serverId === id && entry.service === service)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function getAppCommand(
  serverId: string,
  serviceInput: string,
  commandId: string,
): Promise<AppCommandRecord> {
  const service = normalizeServiceScope(serviceInput);
  if (!service) throw new Error("service is required");
  const { serverId: id } = await resolveServer(serverId);
  const found = readFile().commands.find(
    (entry) => entry.serverId === id && entry.service === service && entry.id === commandId,
  );
  if (!found) throw new Error("Command not found");
  return found;
}

export async function runAppCommand(input: {
  readonly serverId: string;
  readonly service: string;
  readonly command: string;
  readonly directory?: string;
  readonly actorName?: string;
  readonly actorInitials?: string;
}): Promise<AppCommandRecord> {
  const service = normalizeServiceScope(input.service);
  if (!service) throw new Error("service is required");
  const command = assertSafeCommand(input.command);
  const { serverId, ip } = await resolveServer(input.serverId);
  const container = await resolveAppContainer(ip, service);
  const directory = (input.directory?.trim() || container.workdir || "/").replace(/\0/gu, "");
  const actorName = input.actorName?.trim() || "Remon de Vries";
  const actorInitials = input.actorInitials?.trim() || "RV";
  const now = new Date().toISOString();
  const pending: AppCommandRecord = {
    id: randomUUID(),
    serverId,
    service,
    command,
    directory,
    user: "container",
    containerName: container.containerName,
    status: "running",
    exitCode: null,
    output: "",
    actorName,
    actorInitials,
    createdAt: now,
    finishedAt: null,
  };

  const file = readFile();
  writeFile({ commands: [pending, ...file.commands].slice(0, MAX_HISTORY) });

  // Encode remote runner: docker exec with captured exit code + combined stdout/stderr.
  const remote = [
    "python3 - <<'PY'",
    "import json, subprocess",
    `container = ${JSON.stringify(container.containerName)}`,
    `directory = ${JSON.stringify(directory)}`,
    `command = ${JSON.stringify(command)}`,
    "proc = subprocess.run(",
    "  ['docker', 'exec', '-w', directory, container, 'bash', '-lc', command],",
    "  capture_output=True,",
    "  text=True,",
    `  timeout=${Math.floor(COMMAND_TIMEOUT_MS / 1000)},`,
    ")",
    "out = (proc.stdout or '') + (proc.stderr or '')",
    "print(json.dumps({'exitCode': proc.returncode, 'output': out}))",
    "PY",
  ].join("\n");

  let exitCode = 1;
  let output = "";
  try {
    const raw = await sshExec(ip, remote, {
      timeoutMs: COMMAND_TIMEOUT_MS + 15_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const parsed = JSON.parse(raw.trim()) as {
      readonly exitCode?: number;
      readonly output?: string;
    };
    exitCode = typeof parsed.exitCode === "number" ? parsed.exitCode : 1;
    output = truncateOutput(parsed.output ?? "");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    // Prefer captured payload if present after timeout/failure noise.
    const jsonMatch = /\{[\s\S]*"exitCode"[\s\S]*\}/u.exec(message);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as {
          readonly exitCode?: number;
          readonly output?: string;
        };
        exitCode = typeof parsed.exitCode === "number" ? parsed.exitCode : 1;
        output = truncateOutput(parsed.output ?? message);
      } catch {
        output = truncateOutput(message);
        exitCode = 1;
      }
    } else {
      output = truncateOutput(message);
      exitCode = 1;
    }
  }

  const finished: AppCommandRecord = {
    ...pending,
    status: exitCode === 0 ? "finished" : "failed",
    exitCode,
    output,
    finishedAt: new Date().toISOString(),
  };

  const latest = readFile();
  writeFile({
    commands: latest.commands
      .map((entry) => (entry.id === finished.id ? finished : entry))
      .slice(0, MAX_HISTORY),
  });
  return finished;
}

export async function deleteAppCommand(
  serverId: string,
  serviceInput: string,
  commandId: string,
): Promise<boolean> {
  const service = normalizeServiceScope(serviceInput);
  if (!service) throw new Error("service is required");
  const { serverId: id } = await resolveServer(serverId);
  const current = readFile();
  const next = current.commands.filter(
    (entry) => !(entry.serverId === id && entry.service === service && entry.id === commandId),
  );
  if (next.length === current.commands.length) return false;
  writeFile({ commands: next });
  return true;
}
