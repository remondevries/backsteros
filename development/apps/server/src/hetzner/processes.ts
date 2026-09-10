/**
 * Background processes (Supervisor) + scheduled jobs (cron) for Observe → Processes.
 * Desired state is stored locally and applied on the Hetzner host over SSH.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { findHetznerServer } from "./server-connection.ts";
import { sshExec } from "./ssh.ts";

export const SCHEDULE_FREQUENCIES = [
  "every_minute",
  "every_hour",
  "every_night",
  "every_week",
  "every_month",
] as const;

export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number];

export const STOP_SIGNALS = ["TERM", "INT", "QUIT", "KILL", "HUP", "USR1", "USR2"] as const;
export type StopSignal = (typeof STOP_SIGNALS)[number];

export type BackgroundProcess = {
  readonly id: string;
  readonly serverId: string;
  /** Kamal service name when scoped to an app; null for server-level. */
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
};

export type BackgroundProcessView = BackgroundProcess & {
  readonly status: "running" | "stopped" | "unknown" | "error";
  readonly statusLabel: string;
};

export type ScheduledJob = {
  readonly id: string;
  readonly serverId: string;
  /** Kamal service name when scoped to an app; null for server-level. */
  readonly service: string | null;
  readonly name: string;
  readonly command: string;
  readonly user: string;
  readonly frequency: ScheduleFrequency;
  readonly cron: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreateBackgroundProcessInput = {
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
};

export type CreateScheduledJobInput = {
  readonly serverId: string;
  readonly service?: string | null;
  readonly name: string;
  readonly command: string;
  readonly user: string;
  readonly frequency: ScheduleFrequency;
};

type ProcessesFile = {
  readonly daemons: BackgroundProcess[];
  readonly jobs: ScheduledJob[];
};

const FREQUENCY_CRON: Record<ScheduleFrequency, string> = {
  every_minute: "* * * * *",
  every_hour: "0 * * * *",
  every_night: "0 0 * * *",
  every_week: "0 0 * * 0",
  every_month: "0 0 1 * *",
};

export const FREQUENCY_LABELS: Record<ScheduleFrequency, string> = {
  every_minute: "Every minute",
  every_hour: "Every hour",
  every_night: "Every night",
  every_week: "Every week",
  every_month: "Every month",
};

function processesFilePath(): string {
  return path.join(os.homedir(), ".config", "backsteros", "server-processes.json");
}

function readFile(): ProcessesFile {
  try {
    const raw = fs.readFileSync(processesFilePath(), "utf8");
    const parsed = JSON.parse(raw) as ProcessesFile;
    const daemons = Array.isArray(parsed.daemons) ? parsed.daemons : [];
    const jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
    return {
      daemons: daemons.map((daemon) => ({
        ...daemon,
        service: typeof daemon.service === "string" ? daemon.service : null,
      })),
      jobs: jobs.map((job) => ({
        ...job,
        service: typeof job.service === "string" ? job.service : null,
      })),
    };
  } catch {
    return { daemons: [], jobs: [] };
  }
}

function normalizeService(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function matchesServiceScope(
  entryService: string | null | undefined,
  filter: string | null | undefined,
): boolean {
  const scoped = normalizeService(entryService ?? null);
  if (filter === undefined) return true;
  const wanted = normalizeService(filter);
  if (wanted == null) return scoped == null;
  return scoped === wanted;
}

function writeFile(file: ProcessesFile): void {
  const dir = path.dirname(processesFilePath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(processesFilePath(), `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

function programName(daemonId: string): string {
  return `backsteros_${daemonId.replaceAll("-", "").slice(0, 16)}`;
}

function cronFileName(jobId: string): string {
  return `backsteros_${jobId.replaceAll("-", "").slice(0, 20)}`;
}

async function resolveServerIp(serverId: string): Promise<{
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

async function writeRemoteFile(ip: string, remotePath: string, content: string): Promise<void> {
  const b64 = Buffer.from(content, "utf8").toString("base64");
  await sshExec(
    ip,
    `mkdir -p $(dirname -- ${shellSingleQuote(remotePath)}) && printf '%s' ${shellSingleQuote(b64)} | base64 -d > ${shellSingleQuote(remotePath)}`,
    { timeoutMs: 30_000 },
  );
}

async function ensureSupervisor(ip: string): Promise<void> {
  const probe = await sshExec(
    ip,
    "command -v supervisorctl >/dev/null && command -v supervisord >/dev/null && echo ok || echo missing",
  );
  if (probe.trim() === "ok") {
    await sshExec(
      ip,
      "(systemctl is-active supervisor >/dev/null 2>&1 || systemctl start supervisor || service supervisor start || true); mkdir -p /etc/supervisor/conf.d /var/log/supervisor",
      { timeoutMs: 30_000 },
    );
    return;
  }

  await sshExec(
    ip,
    [
      "export DEBIAN_FRONTEND=noninteractive",
      "apt-get update -qq",
      "apt-get install -y -qq supervisor",
      "mkdir -p /etc/supervisor/conf.d /var/log/supervisor",
      "systemctl enable supervisor >/dev/null 2>&1 || true",
      "systemctl start supervisor || service supervisor start || supervisord -c /etc/supervisor/supervisord.conf || true",
    ].join(" && "),
    { timeoutMs: 180_000 },
  );
}

function daemonConf(daemon: BackgroundProcess): string {
  const program = programName(daemon.id);
  const directory = daemon.directory.trim() || "/";
  return [
    `[program:${program}]`,
    `command=${daemon.command}`,
    `directory=${directory}`,
    `user=${daemon.user}`,
    `numprocs=${daemon.processes}`,
    `process_name=%(program_name)s_%(process_num)02d`,
    "autostart=true",
    "autorestart=true",
    `startsecs=${daemon.startSeconds}`,
    `stopwaitsecs=${daemon.stopSeconds}`,
    `stopsignal=${daemon.stopSignal}`,
    `stdout_logfile=/var/log/supervisor/${program}.log`,
    "stdout_logfile_maxbytes=10MB",
    "stdout_logfile_backups=3",
    `stderr_logfile=/var/log/supervisor/${program}.err.log`,
    "stderr_logfile_maxbytes=10MB",
    "stderr_logfile_backups=3",
    "redirect_stderr=false",
    "",
  ].join("\n");
}

async function applyDaemon(ip: string, daemon: BackgroundProcess): Promise<void> {
  await ensureSupervisor(ip);
  const program = programName(daemon.id);
  const confPath = `/etc/supervisor/conf.d/${program}.conf`;
  await writeRemoteFile(ip, confPath, daemonConf(daemon));
  await sshExec(
    ip,
    [
      "supervisorctl reread >/dev/null",
      "supervisorctl update >/dev/null",
      `supervisorctl start ${program}:* >/dev/null 2>&1 || supervisorctl restart ${program}:* >/dev/null 2>&1 || true`,
    ].join(" && "),
    { timeoutMs: 45_000 },
  );
}

async function removeDaemonRemote(ip: string, daemonId: string): Promise<void> {
  const program = programName(daemonId);
  const confPath = `/etc/supervisor/conf.d/${program}.conf`;
  await sshExec(
    ip,
    [
      `supervisorctl stop ${program}:* >/dev/null 2>&1 || true`,
      `rm -f ${shellSingleQuote(confPath)}`,
      "supervisorctl reread >/dev/null 2>&1 || true",
      "supervisorctl update >/dev/null 2>&1 || true",
    ].join("; "),
    { timeoutMs: 45_000 },
  );
}

function cronConf(job: ScheduledJob): string {
  const expr = job.cron;
  const logPath = `/var/log/backsteros-cron/${cronFileName(job.id)}.log`;
  return [
    `# backsteros:${job.id} ${job.name.replaceAll("\n", " ")}`,
    "SHELL=/bin/bash",
    "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    `${expr} ${job.user} ${job.command} >> ${logPath} 2>&1`,
    "",
  ].join("\n");
}

async function applyJob(ip: string, job: ScheduledJob): Promise<void> {
  const file = `/etc/cron.d/${cronFileName(job.id)}`;
  await sshExec(ip, "mkdir -p /var/log/backsteros-cron /etc/cron.d", { timeoutMs: 20_000 });
  await writeRemoteFile(ip, file, cronConf(job));
  await sshExec(ip, `chmod 644 ${shellSingleQuote(file)}`, { timeoutMs: 15_000 });
}

async function removeJobRemote(ip: string, jobId: string): Promise<void> {
  const file = `/etc/cron.d/${cronFileName(jobId)}`;
  await sshExec(ip, `rm -f ${shellSingleQuote(file)}`, { timeoutMs: 15_000 });
}

async function readDaemonStatus(
  ip: string,
  daemon: BackgroundProcess,
): Promise<Pick<BackgroundProcessView, "status" | "statusLabel">> {
  const program = programName(daemon.id);
  try {
    const raw = await sshExec(
      ip,
      `supervisorctl status ${program}:* 2>/dev/null || supervisorctl status ${program} 2>/dev/null || true`,
      { timeoutMs: 20_000 },
    );
    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return { status: "unknown", statusLabel: "Unknown" };
    const running = lines.filter((line) => /\bRUNNING\b/u.test(line)).length;
    const fatal = lines.some((line) => /\b(FATAL|BACKOFF|EXITED|STOPPED)\b/u.test(line));
    if (running > 0 && running === lines.length) {
      return { status: "running", statusLabel: "RUNNING" };
    }
    if (running > 0)
      return { status: "running", statusLabel: `${running}/${lines.length} running` };
    if (fatal) return { status: "stopped", statusLabel: "STOPPED" };
    return { status: "unknown", statusLabel: lines[0] ?? "Unknown" };
  } catch {
    return { status: "error", statusLabel: "Unavailable" };
  }
}

export function isScheduleFrequency(value: unknown): value is ScheduleFrequency {
  return typeof value === "string" && (SCHEDULE_FREQUENCIES as readonly string[]).includes(value);
}

export function isStopSignal(value: unknown): value is StopSignal {
  return typeof value === "string" && (STOP_SIGNALS as readonly string[]).includes(value);
}

export async function listServerUsers(serverId: string): Promise<readonly string[]> {
  const { ip } = await resolveServerIp(serverId);
  try {
    const raw = await sshExec(
      ip,
      `getent passwd | awk -F: '($3==0 || $3>=1000) && $1!="nobody" && $1!="sync" && $1!="halt" && $1!="shutdown" {print $1}'`,
      { timeoutMs: 20_000 },
    );
    const users = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const preferred = ["root", "deploy", "www-data", ...users];
    return [...new Set(preferred)];
  } catch {
    return ["root", "deploy", "www-data"];
  }
}

export async function listBackgroundProcesses(
  serverId: string,
  options?: { readonly service?: string | null },
): Promise<readonly BackgroundProcessView[]> {
  const { serverId: id, ip } = await resolveServerIp(serverId);
  const daemons = readFile().daemons.filter(
    (daemon) => daemon.serverId === id && matchesServiceScope(daemon.service, options?.service),
  );
  const views = await Promise.all(
    daemons.map(async (daemon) => {
      const status = await readDaemonStatus(ip, daemon);
      return { ...daemon, ...status };
    }),
  );
  return views.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function createBackgroundProcess(
  input: CreateBackgroundProcessInput,
): Promise<BackgroundProcessView> {
  const { serverId, ip } = await resolveServerIp(input.serverId);
  const name = input.name.trim();
  const command = input.command.trim();
  const user = input.user.trim() || "root";
  if (!name) throw new Error("Name is required");
  if (!command) throw new Error("Command is required");

  const now = new Date().toISOString();
  const daemon: BackgroundProcess = {
    id: randomUUID(),
    serverId,
    service: normalizeService(input.service),
    name,
    command,
    user,
    directory: input.directory?.trim() || "/root",
    processes: Math.max(1, Math.min(32, Math.floor(input.processes ?? 1))),
    startSeconds: Math.max(0, Math.floor(input.startSeconds ?? 1)),
    stopSeconds: Math.max(1, Math.floor(input.stopSeconds ?? 15)),
    stopSignal: input.stopSignal && isStopSignal(input.stopSignal) ? input.stopSignal : "TERM",
    createdAt: now,
    updatedAt: now,
  };

  await applyDaemon(ip, daemon);
  const file = readFile();
  writeFile({ ...file, daemons: [daemon, ...file.daemons] });
  const status = await readDaemonStatus(ip, daemon);
  return { ...daemon, ...status };
}

export async function restartBackgroundProcess(
  serverId: string,
  processId: string,
): Promise<BackgroundProcessView> {
  const { serverId: id, ip } = await resolveServerIp(serverId);
  const file = readFile();
  const daemon = file.daemons.find((entry) => entry.serverId === id && entry.id === processId);
  if (!daemon) throw new Error("Background process not found");
  const program = programName(daemon.id);
  await sshExec(
    ip,
    `supervisorctl restart ${program}:* >/dev/null 2>&1 || supervisorctl restart ${program} >/dev/null 2>&1`,
    { timeoutMs: 45_000 },
  );
  const status = await readDaemonStatus(ip, daemon);
  return { ...daemon, ...status };
}

export async function deleteBackgroundProcess(serverId: string, processId: string): Promise<void> {
  const { serverId: id, ip } = await resolveServerIp(serverId);
  const file = readFile();
  const daemon = file.daemons.find((entry) => entry.serverId === id && entry.id === processId);
  if (!daemon) throw new Error("Background process not found");
  await removeDaemonRemote(ip, daemon.id);
  writeFile({
    ...file,
    daemons: file.daemons.filter((entry) => entry.id !== processId),
  });
}

export async function readBackgroundProcessLog(
  serverId: string,
  processId: string,
  lines = 200,
): Promise<{ readonly lines: readonly string[] }> {
  const { serverId: id, ip } = await resolveServerIp(serverId);
  const daemon = readFile().daemons.find(
    (entry) => entry.serverId === id && entry.id === processId,
  );
  if (!daemon) throw new Error("Background process not found");
  const program = programName(daemon.id);
  const limit = Math.max(20, Math.min(1000, lines));
  const raw = await sshExec(
    ip,
    `tail -n ${limit} /var/log/supervisor/${program}.log /var/log/supervisor/${program}.err.log 2>/dev/null || true`,
    { timeoutMs: 25_000 },
  );
  return {
    lines: raw
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0),
  };
}

export async function listScheduledJobs(
  serverId: string,
  options?: { readonly service?: string | null },
): Promise<readonly ScheduledJob[]> {
  const { serverId: id } = await resolveServerIp(serverId);
  return readFile()
    .jobs.filter((job) => job.serverId === id && matchesServiceScope(job.service, options?.service))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function createScheduledJob(input: CreateScheduledJobInput): Promise<ScheduledJob> {
  const { serverId, ip } = await resolveServerIp(input.serverId);
  const name = input.name.trim();
  const command = input.command.trim();
  const user = input.user.trim() || "root";
  if (!name) throw new Error("Name is required");
  if (!command) throw new Error("Command is required");
  if (!isScheduleFrequency(input.frequency)) throw new Error("Invalid frequency");

  const now = new Date().toISOString();
  const job: ScheduledJob = {
    id: randomUUID(),
    serverId,
    service: normalizeService(input.service),
    name,
    command,
    user,
    frequency: input.frequency,
    cron: FREQUENCY_CRON[input.frequency],
    createdAt: now,
    updatedAt: now,
  };

  await applyJob(ip, job);
  const file = readFile();
  writeFile({ ...file, jobs: [job, ...file.jobs] });
  return job;
}

export async function deleteScheduledJob(serverId: string, jobId: string): Promise<void> {
  const { serverId: id, ip } = await resolveServerIp(serverId);
  const file = readFile();
  const job = file.jobs.find((entry) => entry.serverId === id && entry.id === jobId);
  if (!job) throw new Error("Scheduled job not found");
  await removeJobRemote(ip, job.id);
  writeFile({
    ...file,
    jobs: file.jobs.filter((entry) => entry.id !== jobId),
  });
}
