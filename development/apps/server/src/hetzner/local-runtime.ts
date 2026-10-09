// @effect-diagnostics nodeBuiltinImport:off globalFetch:off globalFetchInEffect:off globalDate:off preferSchemaOverJson:off globalTimers:off unknownInEffectCatch:off anyUnknownInErrorContext:off catchToOrElseSucceed:off globalRandom:off
/**
 * Local Mac Docker/OrbStack runtime overview for BacksterDEV ops.
 *
 * Durable attachments at ~/.config/backsteros/local-runtime.json, keyed by
 * BacksterOS project id. Containers are matched to a project via:
 *  1. Explicit composeProjectName / composeFile on an attachment
 *  2. Compose label working_dir related to the project's localWorkingDirectory
 *
 * Do not match on directory basename alone — many projects live in a folder
 * named "Codebase", which would collide with compose project name "codebase".
 *
 * Prefer the Docker CLI (OrbStack-compatible) — no extra daemon.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { assertSafeProjectId } from "./project-secrets.ts";
import { getLocalProject, listLocalProjects } from "./local-projects.ts";

export type RuntimeAttachmentKind = "compose" | "command";

export type RuntimeAttachment = {
  readonly id: string;
  readonly kind: RuntimeAttachmentKind;
  readonly label: string;
  /** Absolute or project-relative compose file path (compose kind). */
  readonly composeFile: string | null;
  /** Override for com.docker.compose.project matching / `docker compose -p`. */
  readonly composeProjectName: string | null;
  /** Shell start command (command kind), run in cwd. */
  readonly startCommand: string | null;
  /** Shell stop command (command kind). */
  readonly stopCommand: string | null;
  /** Working directory override (defaults to project's localWorkingDirectory). */
  readonly cwd: string | null;
};

export type LocalContainer = {
  readonly id: string;
  readonly name: string;
  readonly image: string;
  readonly status: string;
  readonly state: "running" | "exited" | "created" | "paused" | "restarting" | "other";
  readonly composeProject: string | null;
  readonly composeService: string | null;
  readonly composeWorkingDir: string | null;
  readonly composeConfigFiles: string | null;
  readonly ports: string;
  readonly matchedBy: readonly string[];
};

export type LocalRuntimeOverview = {
  readonly projectId: string;
  readonly dockerAvailable: boolean;
  readonly dockerError: string | null;
  readonly dockerEngine: string | null;
  readonly localWorkingDirectory: string | null;
  readonly attachments: readonly RuntimeAttachment[];
  readonly containers: readonly LocalContainer[];
  readonly unmatchedRunningCount: number;
  readonly suggestedComposeFiles: readonly string[];
  readonly composeFile: string | null;
  readonly composeSource: "attachment" | "auto" | null;
  readonly canStart: boolean;
  readonly canStop: boolean;
};

type RuntimeStoreFile = {
  readonly attachmentsByProject: Record<string, RuntimeAttachment[]>;
};

const COMPOSE_BASENAMES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
] as const;

function storePath(): string {
  return path.join(os.homedir(), ".config", "backsteros", "local-runtime.json");
}

function readStore(): RuntimeStoreFile {
  try {
    const raw = fs.readFileSync(storePath(), "utf8");
    const parsed = JSON.parse(raw) as RuntimeStoreFile;
    if (!parsed || typeof parsed !== "object" || !parsed.attachmentsByProject) {
      return { attachmentsByProject: {} };
    }
    const attachmentsByProject: Record<string, RuntimeAttachment[]> = {};
    for (const [projectId, rows] of Object.entries(parsed.attachmentsByProject)) {
      if (!Array.isArray(rows)) continue;
      attachmentsByProject[projectId] = rows
        .map(normalizeAttachment)
        .filter(Boolean) as RuntimeAttachment[];
    }
    return { attachmentsByProject };
  } catch {
    return { attachmentsByProject: {} };
  }
}

function writeStore(data: RuntimeStoreFile): void {
  const filePath = storePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function newAttachmentId(): string {
  return `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeAttachment(
  raw: Partial<RuntimeAttachment> | null | undefined,
): RuntimeAttachment | null {
  if (!raw || typeof raw !== "object") return null;
  const kind = raw.kind === "command" ? "command" : raw.kind === "compose" ? "compose" : null;
  if (!kind) return null;
  const label =
    typeof raw.label === "string" && raw.label.trim()
      ? raw.label.trim().slice(0, 80)
      : kind === "compose"
        ? "Compose"
        : "Command";
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : newAttachmentId(),
    kind,
    label,
    composeFile:
      typeof raw.composeFile === "string" && raw.composeFile.trim() ? raw.composeFile.trim() : null,
    composeProjectName:
      typeof raw.composeProjectName === "string" && raw.composeProjectName.trim()
        ? normalizeComposeProjectName(raw.composeProjectName.trim())
        : null,
    startCommand:
      typeof raw.startCommand === "string" && raw.startCommand.trim()
        ? raw.startCommand.trim()
        : null,
    stopCommand:
      typeof raw.stopCommand === "string" && raw.stopCommand.trim() ? raw.stopCommand.trim() : null,
    cwd: typeof raw.cwd === "string" && raw.cwd.trim() ? raw.cwd.trim() : null,
  };
}

/** Compose project names: lowercase letters, digits, dashes, underscores. */
export function normalizeComposeProjectName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "")
    .replace(/^[^a-z0-9]+/, "")
    .slice(0, 64);
}

export function composeProjectNameFromDir(dirPath: string): string {
  return normalizeComposeProjectName(path.basename(path.resolve(dirPath))) || "project";
}

function resolveExistingPath(candidate: string): string | null {
  try {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) return resolved;
  } catch {
    /* ignore */
  }
  return null;
}

function resolveAttachmentCwd(
  attachment: RuntimeAttachment,
  projectCwd: string | null,
): string | null {
  if (attachment.cwd) {
    return resolveExistingPath(attachment.cwd) ?? path.resolve(attachment.cwd);
  }
  if (projectCwd) return path.resolve(projectCwd);
  return null;
}

function resolveComposeFilePath(
  attachment: RuntimeAttachment,
  projectCwd: string | null,
): string | null {
  if (!attachment.composeFile) return null;
  const raw = attachment.composeFile;
  if (path.isAbsolute(raw)) return path.resolve(raw);
  const bases = [attachment.cwd, projectCwd].filter(Boolean) as string[];
  for (const base of bases) {
    return path.resolve(base, raw);
  }
  return path.resolve(raw);
}

function resolveComposeFile(
  attachment: RuntimeAttachment,
  projectCwd: string | null,
): string | null {
  const resolved = resolveComposeFilePath(attachment, projectCwd);
  if (!resolved) return null;
  return resolveExistingPath(resolved);
}

/** True when a and b are the same path, or one is an ancestor of the other. */
export function pathsRelated(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  let left: string;
  let right: string;
  try {
    left = path.resolve(a);
    right = path.resolve(b);
  } catch {
    return false;
  }
  if (left === right) return true;
  const sep = path.sep;
  return left.startsWith(right + sep) || right.startsWith(left + sep);
}

function discoverComposeFilesNear(cwd: string | null): string[] {
  if (!cwd) return [];
  const roots = [path.resolve(cwd)];
  const parent = path.dirname(roots[0]!);
  if (parent && parent !== roots[0]) roots.push(parent);
  const found: string[] = [];
  for (const root of roots) {
    for (const name of COMPOSE_BASENAMES) {
      const candidate = path.join(root, name);
      if (fs.existsSync(candidate) && !found.includes(candidate)) found.push(candidate);
    }
  }
  return found;
}

async function runCommand(
  command: string,
  args: readonly string[],
  options: { readonly cwd?: string; readonly shell?: boolean; readonly timeoutMs?: number } = {},
): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  return await new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: process.env,
      shell: options.shell ?? false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
      if (stdout.length > 500_000) stdout = stdout.slice(-250_000);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function parseContainerState(status: string): LocalContainer["state"] {
  const lower = status.toLowerCase();
  if (lower.startsWith("up") || lower.includes("running")) return "running";
  if (lower.startsWith("exited") || lower.includes("dead")) return "exited";
  if (lower.startsWith("created")) return "created";
  if (lower.startsWith("paused")) return "paused";
  if (lower.includes("restarting")) return "restarting";
  return "other";
}

type DockerPsRow = {
  readonly ID?: string;
  readonly Names?: string;
  readonly Image?: string;
  readonly Status?: string;
  readonly Ports?: string;
  readonly Labels?: string;
};

function parseLabelMap(labels: string | undefined): Record<string, string> {
  if (!labels) return {};
  const out: Record<string, string> = {};
  for (const part of labels.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

async function probeDocker(): Promise<{
  readonly available: boolean;
  readonly engine: string | null;
  readonly error: string | null;
}> {
  try {
    const result = await runCommand(
      "docker",
      ["info", "--format", "{{.Name}} {{.ServerVersion}}"],
      {
        timeoutMs: 8_000,
      },
    );
    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout).trim().slice(0, 240);
      return {
        available: false,
        engine: null,
        error: detail || "Docker CLI returned an error (is OrbStack / Docker Desktop running?)",
      };
    }
    return {
      available: true,
      engine: result.stdout.trim() || "docker",
      error: null,
    };
  } catch (cause) {
    const message =
      cause instanceof Error && (cause as NodeJS.ErrnoException).code === "ENOENT"
        ? "Docker CLI not found on PATH. Install OrbStack or Docker Desktop."
        : cause instanceof Error
          ? cause.message
          : "Failed to reach Docker";
    return { available: false, engine: null, error: message };
  }
}

async function listAllContainers(): Promise<readonly LocalContainer[]> {
  const format =
    '{"ID":{{json .ID}},"Names":{{json .Names}},"Image":{{json .Image}},"Status":{{json .Status}},"Ports":{{json .Ports}},"Labels":{{json .Labels}}}';
  const result = await runCommand("docker", ["ps", "-a", "--format", format], {
    timeoutMs: 15_000,
  });
  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout).trim().slice(0, 300) || "docker ps failed");
  }
  const lines = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const containers: LocalContainer[] = [];
  for (const line of lines) {
    let row: DockerPsRow;
    try {
      row = JSON.parse(line) as DockerPsRow;
    } catch {
      continue;
    }
    const labels = parseLabelMap(row.Labels);
    const name = (row.Names ?? "").split(",")[0]?.trim() || (row.ID ?? "").slice(0, 12);
    const status = row.Status ?? "";
    containers.push({
      id: row.ID ?? name,
      name,
      image: row.Image ?? "",
      status,
      state: parseContainerState(status),
      composeProject: labels["com.docker.compose.project"] ?? null,
      composeService: labels["com.docker.compose.service"] ?? null,
      composeWorkingDir: labels["com.docker.compose.project.working_dir"] ?? null,
      composeConfigFiles: labels["com.docker.compose.project.config_files"] ?? null,
      ports: row.Ports ?? "",
      matchedBy: [],
    });
  }
  return containers;
}

export function matchReasonsForContainer(
  container: Omit<LocalContainer, "matchedBy">,
  projectCwd: string | null,
  attachments: readonly RuntimeAttachment[],
  autoComposeFiles: readonly string[] = [],
): string[] {
  const reasons: string[] = [];

  for (const attachment of attachments) {
    if (attachment.kind !== "compose") continue;
    if (
      attachment.composeProjectName &&
      container.composeProject &&
      attachment.composeProjectName === container.composeProject
    ) {
      reasons.push(`attachment:${attachment.id}:project`);
    }
    const composeFilePath = resolveComposeFilePath(attachment, projectCwd);
    if (composeFilePath && container.composeConfigFiles) {
      const files = container.composeConfigFiles.split(",").map((entry) => entry.trim());
      if (files.some((file) => path.resolve(file) === path.resolve(composeFilePath))) {
        reasons.push(`attachment:${attachment.id}:file`);
      }
    }
    const attachmentCwd = resolveAttachmentCwd(attachment, projectCwd);
    if (attachmentCwd && pathsRelated(container.composeWorkingDir, attachmentCwd)) {
      reasons.push(`attachment:${attachment.id}:cwd`);
    }
  }

  if (projectCwd && pathsRelated(container.composeWorkingDir, projectCwd)) {
    reasons.push("working-dir");
  }

  for (const composeFile of autoComposeFiles) {
    const resolved = path.resolve(composeFile);
    if (container.composeConfigFiles) {
      const files = container.composeConfigFiles.split(",").map((entry) => entry.trim());
      if (files.some((file) => path.resolve(file) === resolved)) {
        reasons.push("auto-compose-file");
      }
    }
    if (pathsRelated(container.composeWorkingDir, path.dirname(resolved))) {
      reasons.push("auto-compose-cwd");
    }
  }

  return [...new Set(reasons)];
}

export type ProjectRuntimeStack = {
  readonly composeFile: string | null;
  readonly composeProjectName: string | null;
  readonly composeSource: "attachment" | "auto" | null;
  readonly composeAttachment: RuntimeAttachment | null;
  readonly commandAttachment: RuntimeAttachment | null;
  readonly suggestedComposeFiles: readonly string[];
  readonly canStart: boolean;
  readonly canStop: boolean;
};

/**
 * Resolve how to start/stop a project's local stack:
 * explicit compose attachment → auto-discovered compose near cwd → command attachment.
 */
export function resolveProjectRuntimeStack(
  projectCwd: string | null,
  attachments: readonly RuntimeAttachment[],
): ProjectRuntimeStack {
  const suggestedComposeFiles = discoverComposeFilesNear(projectCwd);
  const composeAttachment = attachments.find((entry) => entry.kind === "compose") ?? null;
  const commandAttachment = attachments.find((entry) => entry.kind === "command") ?? null;

  if (composeAttachment) {
    const composeFile = resolveComposeFile(composeAttachment, projectCwd);
    return {
      composeFile,
      composeProjectName: composeAttachment.composeProjectName,
      composeSource: composeFile ? "attachment" : null,
      composeAttachment,
      commandAttachment,
      suggestedComposeFiles,
      canStart: Boolean(composeFile) || Boolean(commandAttachment?.startCommand),
      canStop: Boolean(composeFile) || Boolean(commandAttachment?.stopCommand),
    };
  }

  const autoCompose = suggestedComposeFiles[0] ?? null;
  if (autoCompose) {
    return {
      composeFile: autoCompose,
      composeProjectName: null,
      composeSource: "auto",
      composeAttachment: null,
      commandAttachment,
      suggestedComposeFiles,
      canStart: true,
      canStop: true,
    };
  }

  return {
    composeFile: null,
    composeProjectName: null,
    composeSource: null,
    composeAttachment: null,
    commandAttachment,
    suggestedComposeFiles,
    canStart: Boolean(commandAttachment?.startCommand),
    canStop: Boolean(commandAttachment?.stopCommand),
  };
}

async function runComposeFile(
  composeFile: string,
  composeProjectName: string | null,
  action: "up" | "stop",
  label: string,
): Promise<RuntimeActionResult> {
  const cwd = path.dirname(composeFile);
  const args = ["compose", "-f", composeFile];
  if (composeProjectName) args.push("-p", composeProjectName);
  if (action === "up") args.push("up", "-d");
  else args.push("stop");
  try {
    const result = await runCommand("docker", args, { cwd, timeoutMs: 180_000 });
    if (result.code !== 0) {
      return {
        ok: false,
        message:
          (result.stderr || result.stdout).trim().slice(0, 500) ||
          `docker compose ${action} failed`,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    }
    return {
      ok: true,
      message: action === "up" ? `Started ${label}` : `Stopped ${label}`,
      stdout: result.stdout.trim().slice(0, 500),
    };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : `docker compose ${action} failed`,
    };
  }
}

export function listRuntimeAttachments(projectIdInput: string): readonly RuntimeAttachment[] {
  const projectId = assertSafeProjectId(projectIdInput);
  return readStore().attachmentsByProject[projectId] ?? [];
}

export function setRuntimeAttachments(
  projectIdInput: string,
  attachmentsInput: readonly Partial<RuntimeAttachment>[],
): readonly RuntimeAttachment[] {
  const projectId = assertSafeProjectId(projectIdInput);
  const attachments = attachmentsInput
    .map(normalizeAttachment)
    .filter((entry): entry is RuntimeAttachment => entry != null)
    .slice(0, 20);
  const store = readStore();
  writeStore({
    attachmentsByProject: {
      ...store.attachmentsByProject,
      [projectId]: [...attachments],
    },
  });
  return attachments;
}

export async function getLocalRuntimeOverview(
  projectIdInput: string,
): Promise<LocalRuntimeOverview> {
  const projectId = assertSafeProjectId(projectIdInput);
  const project = getLocalProject(projectId);
  const projectCwd = project?.localWorkingDirectory ?? null;
  const attachments = listRuntimeAttachments(projectId);
  const stack = resolveProjectRuntimeStack(projectCwd, attachments);
  const probe = await probeDocker();
  const autoComposeFiles = stack.composeFile ? [stack.composeFile] : stack.suggestedComposeFiles;

  if (!probe.available) {
    return {
      projectId,
      dockerAvailable: false,
      dockerError: probe.error,
      dockerEngine: null,
      localWorkingDirectory: projectCwd,
      attachments,
      containers: [],
      unmatchedRunningCount: 0,
      suggestedComposeFiles: stack.suggestedComposeFiles,
      composeFile: stack.composeFile,
      composeSource: stack.composeSource,
      canStart: stack.canStart,
      canStop: stack.canStop,
    };
  }

  let all: readonly LocalContainer[] = [];
  try {
    all = await listAllContainers();
  } catch (cause) {
    return {
      projectId,
      dockerAvailable: false,
      dockerError: cause instanceof Error ? cause.message : "Failed to list containers",
      dockerEngine: probe.engine,
      localWorkingDirectory: projectCwd,
      attachments,
      containers: [],
      unmatchedRunningCount: 0,
      suggestedComposeFiles: stack.suggestedComposeFiles,
      composeFile: stack.composeFile,
      composeSource: stack.composeSource,
      canStart: stack.canStart,
      canStop: stack.canStop,
    };
  }

  const matched: LocalContainer[] = [];
  let unmatchedRunningCount = 0;
  for (const container of all) {
    const matchedBy = matchReasonsForContainer(
      container,
      projectCwd,
      attachments,
      autoComposeFiles,
    );
    if (matchedBy.length > 0) {
      matched.push({ ...container, matchedBy });
    } else if (container.state === "running") {
      unmatchedRunningCount += 1;
    }
  }

  matched.sort((a, b) => {
    const ar = a.state === "running" ? 0 : 1;
    const br = b.state === "running" ? 0 : 1;
    if (ar !== br) return ar - br;
    return a.name.localeCompare(b.name);
  });

  return {
    projectId,
    dockerAvailable: true,
    dockerError: null,
    dockerEngine: probe.engine,
    localWorkingDirectory: projectCwd,
    attachments,
    containers: matched,
    unmatchedRunningCount,
    suggestedComposeFiles: stack.suggestedComposeFiles,
    composeFile: stack.composeFile,
    composeSource: stack.composeSource,
    canStart: stack.canStart || matched.some((entry) => entry.state !== "running"),
    canStop: stack.canStop || matched.some((entry) => entry.state === "running"),
  };
}

export type DashboardRuntimeProjectRef = {
  readonly projectId: string;
  readonly key: string | null;
  readonly name: string;
  readonly accent: string;
  readonly initial: string;
  readonly icon: string | null;
};

export type DashboardRuntimeContainer = LocalContainer & {
  readonly projects: readonly DashboardRuntimeProjectRef[];
};

export type DashboardRuntimeProject = {
  readonly projectId: string;
  readonly key: string | null;
  readonly name: string;
  readonly accent: string;
  readonly initial: string;
  readonly icon: string | null;
  readonly localWorkingDirectory: string | null;
  readonly composeFile: string | null;
  readonly composeSource: "attachment" | "auto" | null;
  readonly attachments: readonly RuntimeAttachment[];
  readonly containers: readonly LocalContainer[];
  readonly runningCount: number;
  readonly stoppedCount: number;
  readonly canStart: boolean;
  readonly canStop: boolean;
};

export type LocalRuntimeDashboard = {
  readonly dockerAvailable: boolean;
  readonly dockerError: string | null;
  readonly dockerEngine: string | null;
  /** Every local codebase project — including ones with nothing running. */
  readonly projects: readonly DashboardRuntimeProject[];
  /** Running containers that don't match any project. */
  readonly unmatchedRunning: readonly LocalContainer[];
  /** Flattened matched containers (compat / debugging). */
  readonly containers: readonly DashboardRuntimeContainer[];
  readonly runningCount: number;
  readonly projectCount: number;
  readonly activeProjectCount: number;
};

/**
 * Dashboard: one row per local BacksterOS codebase project, with auto-discovered
 * compose (or attachments) for Start/Stop even when nothing is running yet.
 */
export async function getLocalRuntimeDashboard(): Promise<LocalRuntimeDashboard> {
  const projects = listLocalProjects();
  const emptyProjects = (): DashboardRuntimeProject[] =>
    projects.map((project) => {
      const attachments = listRuntimeAttachments(project.projectId);
      const stack = resolveProjectRuntimeStack(project.localWorkingDirectory, attachments);
      return {
        projectId: project.projectId,
        key: project.key,
        name: project.name,
        accent: project.accent,
        initial: project.initial,
        icon: project.icon,
        localWorkingDirectory: project.localWorkingDirectory,
        composeFile: stack.composeFile,
        composeSource: stack.composeSource,
        attachments,
        containers: [],
        runningCount: 0,
        stoppedCount: 0,
        canStart: stack.canStart,
        canStop: false,
      };
    });

  const probe = await probeDocker();
  if (!probe.available) {
    return {
      dockerAvailable: false,
      dockerError: probe.error,
      dockerEngine: null,
      projects: emptyProjects(),
      unmatchedRunning: [],
      containers: [],
      runningCount: 0,
      projectCount: projects.length,
      activeProjectCount: 0,
    };
  }

  let all: readonly LocalContainer[] = [];
  try {
    all = await listAllContainers();
  } catch (cause) {
    return {
      dockerAvailable: false,
      dockerError: cause instanceof Error ? cause.message : "Failed to list containers",
      dockerEngine: probe.engine,
      projects: emptyProjects(),
      unmatchedRunning: [],
      containers: [],
      runningCount: 0,
      projectCount: projects.length,
      activeProjectCount: 0,
    };
  }

  const dashboardProjects: DashboardRuntimeProject[] = [];
  const flatContainers: DashboardRuntimeContainer[] = [];
  const claimedRunningIds = new Set<string>();

  for (const project of projects) {
    const attachments = listRuntimeAttachments(project.projectId);
    const stack = resolveProjectRuntimeStack(project.localWorkingDirectory, attachments);
    const autoComposeFiles = stack.composeFile ? [stack.composeFile] : stack.suggestedComposeFiles;
    const matched: LocalContainer[] = [];

    for (const container of all) {
      const matchedBy = matchReasonsForContainer(
        container,
        project.localWorkingDirectory,
        attachments,
        autoComposeFiles,
      );
      if (matchedBy.length === 0) continue;
      matched.push({ ...container, matchedBy });
      if (container.state === "running") claimedRunningIds.add(container.id);
      flatContainers.push({
        ...container,
        matchedBy,
        projects: [
          {
            projectId: project.projectId,
            key: project.key,
            name: project.name,
            accent: project.accent,
            initial: project.initial,
            icon: project.icon,
          },
        ],
      });
    }

    matched.sort((a, b) => {
      const ar = a.state === "running" ? 0 : 1;
      const br = b.state === "running" ? 0 : 1;
      if (ar !== br) return ar - br;
      return a.name.localeCompare(b.name);
    });

    const runningCount = matched.filter((entry) => entry.state === "running").length;
    const stoppedCount = matched.length - runningCount;

    dashboardProjects.push({
      projectId: project.projectId,
      key: project.key,
      name: project.name,
      accent: project.accent,
      initial: project.initial,
      icon: project.icon,
      localWorkingDirectory: project.localWorkingDirectory,
      composeFile: stack.composeFile,
      composeSource: stack.composeSource,
      attachments,
      containers: matched,
      runningCount,
      stoppedCount,
      canStart: stack.canStart || stoppedCount > 0,
      canStop: runningCount > 0 || stack.canStop,
    });
  }

  dashboardProjects.sort((a, b) => {
    if (a.runningCount !== b.runningCount) return b.runningCount - a.runningCount;
    const ak = (a.key ?? a.name).toLowerCase();
    const bk = (b.key ?? b.name).toLowerCase();
    return ak.localeCompare(bk);
  });

  const unmatchedRunning = all.filter(
    (container) => container.state === "running" && !claimedRunningIds.has(container.id),
  );

  return {
    dockerAvailable: true,
    dockerError: null,
    dockerEngine: probe.engine,
    projects: dashboardProjects,
    unmatchedRunning,
    containers: flatContainers,
    runningCount:
      dashboardProjects.reduce((sum, project) => sum + project.runningCount, 0) +
      unmatchedRunning.length,
    projectCount: dashboardProjects.length,
    activeProjectCount: dashboardProjects.filter((project) => project.runningCount > 0).length,
  };
}

export async function startProjectRuntime(projectIdInput: string): Promise<RuntimeActionResult> {
  const projectId = assertSafeProjectId(projectIdInput);
  const project = getLocalProject(projectId);
  if (!project) return { ok: false, message: "Local project not found" };
  const attachments = listRuntimeAttachments(projectId);
  const stack = resolveProjectRuntimeStack(project.localWorkingDirectory, attachments);
  const label = project.key ?? project.name;

  if (stack.composeAttachment) {
    return startRuntimeAttachment(projectId, stack.composeAttachment.id);
  }
  if (stack.composeFile) {
    return runComposeFile(stack.composeFile, stack.composeProjectName, "up", label);
  }
  if (stack.commandAttachment) {
    return startRuntimeAttachment(projectId, stack.commandAttachment.id);
  }

  // Fallback: start any matched stopped containers.
  const overview = await getLocalRuntimeOverview(projectId);
  const stopped = overview.containers
    .filter((entry) => entry.state !== "running")
    .map((entry) => entry.name);
  if (stopped.length > 0) return startLocalContainers(stopped);

  return {
    ok: false,
    message:
      "No compose file or start command for this project. Add docker-compose.yml near the working directory, or attach a service under Development.",
  };
}

export async function stopProjectRuntime(projectIdInput: string): Promise<RuntimeActionResult> {
  const projectId = assertSafeProjectId(projectIdInput);
  const project = getLocalProject(projectId);
  if (!project) return { ok: false, message: "Local project not found" };
  const attachments = listRuntimeAttachments(projectId);
  const stack = resolveProjectRuntimeStack(project.localWorkingDirectory, attachments);
  const label = project.key ?? project.name;

  if (stack.composeAttachment) {
    return stopRuntimeAttachment(projectId, stack.composeAttachment.id);
  }
  if (stack.composeFile) {
    const composeResult = await runComposeFile(
      stack.composeFile,
      stack.composeProjectName,
      "stop",
      label,
    );
    if (composeResult.ok) return composeResult;
  }
  if (stack.commandAttachment?.stopCommand) {
    return stopRuntimeAttachment(projectId, stack.commandAttachment.id);
  }

  const overview = await getLocalRuntimeOverview(projectId);
  const running = overview.containers
    .filter((entry) => entry.state === "running")
    .map((entry) => entry.name);
  if (running.length > 0) return stopLocalContainers(running);

  return { ok: false, message: "Nothing running for this project" };
}

function assertSafeContainerRef(value: string): string {
  const ref = value.trim();
  if (!ref || ref.length > 128) throw new Error("container ref is required");
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(ref)) {
    throw new Error("Invalid container name or id");
  }
  return ref;
}

export type RuntimeActionResult = {
  readonly ok: boolean;
  readonly message: string;
  readonly stdout?: string;
  readonly stderr?: string;
};

export async function startLocalContainer(containerRef: string): Promise<RuntimeActionResult> {
  return startLocalContainers([containerRef]);
}

export async function stopLocalContainer(containerRef: string): Promise<RuntimeActionResult> {
  return stopLocalContainers([containerRef]);
}

export async function startLocalContainers(
  containerRefs: readonly string[],
): Promise<RuntimeActionResult> {
  const refs = [...new Set(containerRefs.map(assertSafeContainerRef))];
  if (refs.length === 0) return { ok: false, message: "No containers to start" };
  try {
    const result = await runCommand("docker", ["start", ...refs], {
      timeoutMs: Math.min(180_000, 30_000 + refs.length * 15_000),
    });
    if (result.code !== 0) {
      return {
        ok: false,
        message: (result.stderr || result.stdout).trim().slice(0, 400) || "docker start failed",
        stdout: result.stdout,
        stderr: result.stderr,
      };
    }
    return {
      ok: true,
      message: refs.length === 1 ? `Started ${refs[0]}` : `Started ${refs.length} containers`,
      stdout: result.stdout.trim(),
    };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : "docker start failed",
    };
  }
}

export async function stopLocalContainers(
  containerRefs: readonly string[],
): Promise<RuntimeActionResult> {
  const refs = [...new Set(containerRefs.map(assertSafeContainerRef))];
  if (refs.length === 0) return { ok: false, message: "No containers to stop" };
  try {
    const result = await runCommand("docker", ["stop", ...refs], {
      timeoutMs: Math.min(240_000, 45_000 + refs.length * 20_000),
    });
    if (result.code !== 0) {
      return {
        ok: false,
        message: (result.stderr || result.stdout).trim().slice(0, 400) || "docker stop failed",
        stdout: result.stdout,
        stderr: result.stderr,
      };
    }
    return {
      ok: true,
      message: refs.length === 1 ? `Stopped ${refs[0]}` : `Stopped ${refs.length} containers`,
      stdout: result.stdout.trim(),
    };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : "docker stop failed",
    };
  }
}

async function runAttachmentCompose(
  attachment: RuntimeAttachment,
  projectCwd: string | null,
  action: "up" | "stop",
): Promise<RuntimeActionResult> {
  const composeFile = resolveComposeFile(attachment, projectCwd);
  if (!composeFile) {
    return {
      ok: false,
      message:
        "Compose file not found. Set an absolute path or a path relative to the project cwd.",
    };
  }
  const cwd = path.dirname(composeFile);
  const args = ["compose", "-f", composeFile];
  if (attachment.composeProjectName) {
    args.push("-p", attachment.composeProjectName);
  }
  if (action === "up") {
    args.push("up", "-d");
  } else {
    args.push("stop");
  }
  try {
    const result = await runCommand("docker", args, { cwd, timeoutMs: 180_000 });
    if (result.code !== 0) {
      return {
        ok: false,
        message:
          (result.stderr || result.stdout).trim().slice(0, 500) ||
          `docker compose ${action} failed`,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    }
    return {
      ok: true,
      message: action === "up" ? `Started ${attachment.label}` : `Stopped ${attachment.label}`,
      stdout: result.stdout.trim().slice(0, 500),
    };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : `docker compose ${action} failed`,
    };
  }
}

async function runAttachmentCommand(
  attachment: RuntimeAttachment,
  projectCwd: string | null,
  action: "start" | "stop",
): Promise<RuntimeActionResult> {
  const command = action === "start" ? attachment.startCommand : attachment.stopCommand;
  if (!command) {
    return {
      ok: false,
      message: action === "start" ? "No start command configured" : "No stop command configured",
    };
  }
  const cwd = resolveAttachmentCwd(attachment, projectCwd);
  try {
    const result = await runCommand(command, [], {
      ...(cwd ? { cwd } : {}),
      shell: true,
      timeoutMs: 120_000,
    });
    if (result.code !== 0) {
      return {
        ok: false,
        message: (result.stderr || result.stdout).trim().slice(0, 500) || "Command failed",
        stdout: result.stdout,
        stderr: result.stderr,
      };
    }
    return {
      ok: true,
      message:
        action === "start"
          ? `Ran start for ${attachment.label}`
          : `Ran stop for ${attachment.label}`,
      stdout: result.stdout.trim().slice(0, 500),
    };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : "Command failed",
    };
  }
}

export async function startRuntimeAttachment(
  projectIdInput: string,
  attachmentId: string,
): Promise<RuntimeActionResult> {
  const projectId = assertSafeProjectId(projectIdInput);
  const project = getLocalProject(projectId);
  const attachment = listRuntimeAttachments(projectId).find((entry) => entry.id === attachmentId);
  if (!attachment) return { ok: false, message: "Attachment not found" };
  if (attachment.kind === "compose") {
    return runAttachmentCompose(attachment, project?.localWorkingDirectory ?? null, "up");
  }
  return runAttachmentCommand(attachment, project?.localWorkingDirectory ?? null, "start");
}

export async function stopRuntimeAttachment(
  projectIdInput: string,
  attachmentId: string,
): Promise<RuntimeActionResult> {
  const projectId = assertSafeProjectId(projectIdInput);
  const project = getLocalProject(projectId);
  const attachment = listRuntimeAttachments(projectId).find((entry) => entry.id === attachmentId);
  if (!attachment) return { ok: false, message: "Attachment not found" };
  if (attachment.kind === "compose") {
    return runAttachmentCompose(attachment, project?.localWorkingDirectory ?? null, "stop");
  }
  return runAttachmentCommand(attachment, project?.localWorkingDirectory ?? null, "stop");
}
