/**
 * Resolve BacksterOS tasks/projects for the localhost control API.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  backsterosStatusForControlSession,
  canAutoPromoteBacksterosTaskStatus,
} from "@t3tools/shared/backsterosTaskAutoPromote";

export { backsterosStatusForControlSession, canAutoPromoteBacksterosTaskStatus };

const DEFAULT_BACKSTEROS_API_URL = "https://api.local.backsteros.com";
const DISPLAY_ID_RE = /^([A-Za-z0-9]{2,3})-(\d+)$/;

/** Fail fast when local-core (or any BacksterOS API) stalls — e.g. hung GET /projects/{id}. */
export const BACKSTEROS_FETCH_TIMEOUT_MS = 10_000;

export type BacksterosControlTask = {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly description: string | null;
  readonly status: string;
  readonly projectId: string | null;
  /** OS-106: development | production | local */
  readonly executionLocation: string | null;
  readonly executionLocationLockedAt: string | null;
};

export type BacksterosControlProject = {
  readonly id: string;
  readonly key: string | null;
  readonly name: string;
  readonly localWorkingDirectory: string | null;
  readonly developmentLocation: string | null;
  readonly productionLocation: string | null;
  readonly localLocation: string | null;
};

export class BacksterosTimeoutError extends Error {
  readonly code = "backsteros_timeout" as const;
  readonly pathname: string;

  constructor(pathname: string, cause?: unknown) {
    super(`BacksterOS ${pathname} timed out after ${BACKSTEROS_FETCH_TIMEOUT_MS}ms`);
    this.name = "BacksterosTimeoutError";
    this.pathname = pathname;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

function isAbortTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
  if (name === "TimeoutError" || name === "AbortError") return true;
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return code === "ABORT_ERR";
}

function readCliEnvValue(key: "BACKSTEROS_API_KEY" | "BACKSTEROS_API_URL"): string {
  try {
    const filePath = path.join(os.homedir(), ".config", "backsteros", "cli.env");
    if (!fs.existsSync(filePath)) return "";
    const text = fs.readFileSync(filePath, "utf8");
    const match = new RegExp(`^(?:export\\s+)?${key}=(.+)$`, "m").exec(text);
    return match?.[1]?.trim().replace(/^['"]|['"]$/g, "") || "";
  } catch {
    return "";
  }
}

export function resolveBacksterosControlApiOrigin(): string {
  const fromEnv = process.env.BACKSTEROS_API_URL?.trim() || "";
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const fromCli = readCliEnvValue("BACKSTEROS_API_URL");
  if (fromCli) return fromCli.replace(/\/$/, "");
  return DEFAULT_BACKSTEROS_API_URL;
}

export function resolveBacksterosControlApiKey(): string {
  const fromEnv = process.env.BACKSTEROS_API_KEY?.trim() || "";
  if (fromEnv) return fromEnv;
  return readCliEnvValue("BACKSTEROS_API_KEY");
}

export function parseBacksterosDisplayId(
  ref: string,
): { readonly projectKey: string; readonly number: number } | null {
  const match = DISPLAY_ID_RE.exec(ref.trim());
  if (!match) return null;
  return { projectKey: match[1]!.toUpperCase(), number: Number(match[2]) };
}

async function backsterosFetchJson<T>(pathname: string): Promise<T> {
  const origin = resolveBacksterosControlApiOrigin();
  const apiKey = resolveBacksterosControlApiKey();
  if (!apiKey) {
    throw new Error(
      "BacksterOS API key missing (BACKSTEROS_API_KEY or ~/.config/backsteros/cli.env)",
    );
  }
  let response: Response;
  try {
    response = await fetch(`${origin}${pathname}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(BACKSTEROS_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (isAbortTimeoutError(error)) {
      throw new BacksterosTimeoutError(pathname, error);
    }
    throw error;
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `BacksterOS ${pathname} failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ""}`,
    );
  }
  return (await response.json()) as T;
}

function mapProjectRow(project: {
  id: string;
  key?: string | null;
  name: string;
  localWorkingDirectory?: string | null;
  developmentLocation?: string | null;
  productionLocation?: string | null;
  localLocation?: string | null;
}): BacksterosControlProject {
  return {
    id: project.id,
    key: project.key ?? null,
    name: project.name,
    localWorkingDirectory: project.localWorkingDirectory ?? null,
    developmentLocation: project.developmentLocation ?? null,
    productionLocation: project.productionLocation ?? null,
    localLocation: project.localLocation ?? null,
  };
}

function mapTaskRow(task: {
  id: string;
  number: number;
  title: string;
  status: string;
  projectId?: string | null;
  description?: string | null;
  executionLocation?: string | null;
  executionLocationLockedAt?: string | null;
}): BacksterosControlTask {
  return {
    id: task.id,
    number: task.number,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    projectId: task.projectId ?? null,
    executionLocation: task.executionLocation ?? null,
    executionLocationLockedAt: task.executionLocationLockedAt ?? null,
  };
}

export async function fetchBacksterosControlProject(
  projectId: string,
): Promise<BacksterosControlProject> {
  const detailPath = `/api/v1/projects/${encodeURIComponent(projectId)}`;
  try {
    const project = await backsterosFetchJson<{
      id: string;
      key?: string | null;
      name: string;
      localWorkingDirectory?: string | null;
      developmentLocation?: string | null;
      productionLocation?: string | null;
      localLocation?: string | null;
    }>(detailPath);
    return mapProjectRow(project);
  } catch (error) {
    // Detail GET has hung on local-core (vault ensure). List answers in ms.
    const projects = await listBacksterosControlProjects();
    const match = projects.find((project) => project.id === projectId);
    if (match) return match;
    throw error;
  }
}

async function listBacksterosControlProjects(): Promise<ReadonlyArray<BacksterosControlProject>> {
  const payload = await backsterosFetchJson<{
    projects?: ReadonlyArray<{
      id: string;
      key?: string | null;
      name: string;
      localWorkingDirectory?: string | null;
      developmentLocation?: string | null;
      productionLocation?: string | null;
      localLocation?: string | null;
    }>;
  }>("/api/v1/projects?type=codebase");
  return (payload.projects ?? []).map(mapProjectRow);
}

export async function resolveBacksterosControlProjectByKey(
  projectKey: string,
): Promise<BacksterosControlProject> {
  const key = projectKey.trim().toUpperCase();
  const projects = await listBacksterosControlProjects();
  const match = projects.find((project) => (project.key ?? "").toUpperCase() === key);
  if (!match) {
    throw new Error(`BacksterOS project not found: ${projectKey}`);
  }
  return match;
}

export async function resolveBacksterosControlTask(taskRefOrId: string): Promise<{
  readonly task: BacksterosControlTask;
  readonly project: BacksterosControlProject | null;
}> {
  const trimmed = taskRefOrId.trim();
  if (!trimmed) {
    throw new Error("taskId or taskRef is required");
  }

  const display = parseBacksterosDisplayId(trimmed);
  if (display) {
    const project = await resolveBacksterosControlProjectByKey(display.projectKey);
    const payload = await backsterosFetchJson<{
      tasks?: ReadonlyArray<{
        id: string;
        number: number;
        title: string;
        status: string;
        projectId?: string | null;
        description?: string | null;
      }>;
    }>(`/api/v1/tasks?projectId=${encodeURIComponent(project.id)}`);
    const listed = (payload.tasks ?? []).find((entry) => entry.number === display.number);
    if (!listed) {
      throw new Error(`BacksterOS task not found: ${display.projectKey}-${display.number}`);
    }
    // List rows may omit description — fetch detail when present.
    const detail = await backsterosFetchJson<{
      id: string;
      number: number;
      title: string;
      status: string;
      projectId?: string | null;
      description?: string | null;
      executionLocation?: string | null;
      executionLocationLockedAt?: string | null;
    }>(`/api/v1/tasks/${encodeURIComponent(listed.id)}`);
    return {
      task: mapTaskRow({ ...detail, projectId: detail.projectId ?? project.id }),
      project,
    };
  }

  const detail = await backsterosFetchJson<{
    id: string;
    number: number;
    title: string;
    status: string;
    projectId?: string | null;
    description?: string | null;
    executionLocation?: string | null;
    executionLocationLockedAt?: string | null;
  }>(`/api/v1/tasks/${encodeURIComponent(trimmed)}`);
  const project = detail.projectId ? await fetchBacksterosControlProject(detail.projectId) : null;
  return {
    task: mapTaskRow(detail),
    project,
  };
}

/** Freeze the task's execution location once a coding thread starts (OS-106). */
export async function lockBacksterosControlExecutionLocation(taskId: string): Promise<boolean> {
  const origin = resolveBacksterosControlApiOrigin();
  const apiKey = resolveBacksterosControlApiKey();
  if (!apiKey) return false;
  try {
    const response = await fetch(`${origin}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lockExecutionLocation: true, activityActor: "agent" }),
      cache: "no-store",
      signal: AbortSignal.timeout(BACKSTEROS_FETCH_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Best-effort BacksterOS status write for control-API sessions. Failures are
 * swallowed — the web lifecycle hook is still the primary path when the UI is open.
 *
 * Re-reads the task first so completed/canceled/duplicated stay closed.
 * `in_review` only applies when the live status is already `in_progress`
 * (never yank backlog / ready_to_start / on_hold back to review).
 */
export async function patchBacksterosControlTaskStatus(
  taskId: string,
  status: "in_progress" | "in_review",
): Promise<boolean> {
  const origin = resolveBacksterosControlApiOrigin();
  const apiKey = resolveBacksterosControlApiKey();
  if (!apiKey) return false;
  try {
    const current = await backsterosFetchJson<{ status: string }>(
      `/api/v1/tasks/${encodeURIComponent(taskId)}`,
    );
    if (!canAutoPromoteBacksterosTaskStatus(current.status)) {
      return false;
    }
    if (status === "in_review" && current.status !== "in_progress") {
      return false;
    }
    const response = await fetch(`${origin}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status, activityActor: "agent" }),
      cache: "no-store",
      signal: AbortSignal.timeout(BACKSTEROS_FETCH_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function buildControlKickoffPrompt(input: {
  readonly task: BacksterosControlTask;
  readonly projectKey: string | null;
  readonly workingDirectory: string | null;
}): string {
  const displayId =
    input.projectKey && input.task.number > 0
      ? `${input.projectKey}-${input.task.number}`
      : input.task.id;
  const description = input.task.description?.trim() || "(none)";
  const workingDirectory = input.workingDirectory?.trim() || "~";
  return [
    "Implement this Backsteros task. Start working now.",
    "",
    `Task ID: ${displayId}`,
    `Title: ${input.task.title.trim() || "Untitled"}`,
    `Working directory: ${workingDirectory}`,
    workingDirectory === "~"
      ? "(No project folder is set — stay in the linked workspace unless the task requires otherwise.)"
      : "(Your shell should already be in this directory — stay here unless the task requires otherwise.)",
    "",
    "Description:",
    description,
    "",
    "BacksterOS workflow:",
    "- Use the `backsteros` CLI for task/comment updates (auth: ~/.config/backsteros/cli.env).",
    '- Examples: `backsteros comment create DOT-1 -m "…"` · `backsteros task get DOT-1`',
    "- BacksterDEV auto-moves status to In Progress while you work and In Review when you go idle — do not fight that.",
    "- When you finish, leave a short `backsteros comment` on this task explaining what changed.",
    "- Only change status yourself when the user asks (e.g. completed) or you are blocked (`on_hold`).",
    "- If the user sends `/done`, that is an explicit finish request: review/update the description (problem framing, grammar, formatting), commit, push, link commit SHAs, comment with the resolution, and mark completed.",
  ].join("\n");
}
