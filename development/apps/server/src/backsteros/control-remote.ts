/**
 * Dispatch control-API sessions against a paired remote T3 environment via its
 * orchestration HTTP API (stock `t3 serve` has no Backster control routes).
 */
import {
  ProviderInstanceId,
  type ModelSelection,
  type OrchestrationProjectShell,
  type OrchestrationThreadShell,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { normalizeProjectPathForComparison } from "@t3tools/shared/path";

function matchRemoteT3Project<T extends { readonly id: string; readonly workspaceRoot: string }>(
  projects: ReadonlyArray<T>,
  input: {
    readonly workspaceRoot: string;
    readonly projectIdOverride: string | null;
  },
):
  | { readonly kind: "found"; readonly project: T }
  | { readonly kind: "missing_id"; readonly projectId: string }
  | { readonly kind: "unlinked" } {
  if (input.projectIdOverride) {
    const byId = projects.find((project) => project.id === input.projectIdOverride);
    if (!byId) return { kind: "missing_id", projectId: input.projectIdOverride };
    return { kind: "found", project: byId };
  }
  const normalized = normalizeProjectPathForComparison(input.workspaceRoot);
  if (normalized.length === 0) return { kind: "unlinked" };
  const match = projects.find(
    (project) => normalizeProjectPathForComparison(project.workspaceRoot) === normalized,
  );
  return match ? { kind: "found", project: match } : { kind: "unlinked" };
}

const REMOTE_FETCH_TIMEOUT_MS = 30_000;

export type ControlRemoteHttpError = {
  readonly status: number;
  readonly error: string;
  readonly code: string;
};

function joinUrl(baseUrl: string, pathname: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

async function remoteFetchJson(input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
  readonly method: "GET" | "POST";
  readonly pathname: string;
  readonly body?: unknown;
}): Promise<{ readonly status: number; readonly json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: "application/json",
    };
    if (input.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(joinUrl(input.httpBaseUrl, input.pathname), {
      method: input.method,
      headers,
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
      signal: controller.signal,
    });
    const text = await response.text();
    let json: unknown = null;
    if (text.length > 0) {
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        json = { raw: text.slice(0, 240) };
      }
    }
    return { status: response.status, json };
  } catch (cause) {
    const message =
      cause instanceof Error && cause.name === "AbortError"
        ? `Remote environment timed out after ${REMOTE_FETCH_TIMEOUT_MS}ms`
        : cause instanceof Error
          ? cause.message
          : "Remote environment request failed";
    throw {
      status: 504,
      error: message,
      code: "remote_timeout",
    } satisfies ControlRemoteHttpError;
  } finally {
    clearTimeout(timer);
  }
}

function failRemote(status: number, error: string, code: string): ControlRemoteHttpError {
  return { status, error, code };
}

export async function fetchRemoteShellSnapshot(input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
}): Promise<{
  readonly projects: OrchestrationProjectShell[];
  readonly threads: OrchestrationThreadShell[];
}> {
  // Full snapshot includes soft-deleted filtering the shell endpoint may omit.
  const { status, json } = await remoteFetchJson({
    ...input,
    method: "GET",
    pathname: "/api/orchestration/snapshot",
  });
  if (status === 401 || status === 403) {
    throw failRemote(
      status,
      "Remote environment rejected the stored access token",
      "remote_unauthorized",
    );
  }
  if (status < 200 || status >= 300 || !json || typeof json !== "object") {
    throw failRemote(
      status >= 400 ? status : 502,
      `Failed to read remote orchestration snapshot (HTTP ${status})`,
      "remote_snapshot_failed",
    );
  }
  const body = json as {
    projects?: OrchestrationProjectShell[];
    threads?: OrchestrationThreadShell[];
  };
  return {
    projects: Array.isArray(body.projects) ? body.projects : [],
    threads: Array.isArray(body.threads) ? body.threads : [],
  };
}

export async function fetchRemoteThreadShell(input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
  readonly threadId: string;
}): Promise<OrchestrationThreadShell | null> {
  const { status, json } = await remoteFetchJson({
    httpBaseUrl: input.httpBaseUrl,
    accessToken: input.accessToken,
    method: "GET",
    pathname: `/api/orchestration/threads/${encodeURIComponent(input.threadId)}`,
  });
  if (status === 404) return null;
  if (status === 401 || status === 403) {
    throw failRemote(
      status,
      "Remote environment rejected the stored access token",
      "remote_unauthorized",
    );
  }
  if (status < 200 || status >= 300 || !json || typeof json !== "object") {
    throw failRemote(
      status >= 400 ? status : 502,
      `Failed to read remote thread (HTTP ${status})`,
      "remote_thread_failed",
    );
  }
  const thread = (json as { thread?: OrchestrationThreadShell }).thread;
  return thread ?? null;
}

export async function dispatchRemoteOrchestrationCommand(input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
  readonly command: Record<string, unknown>;
}): Promise<void> {
  const { status, json } = await remoteFetchJson({
    httpBaseUrl: input.httpBaseUrl,
    accessToken: input.accessToken,
    method: "POST",
    pathname: "/api/orchestration/dispatch",
    body: input.command,
  });
  if (status === 401 || status === 403) {
    throw failRemote(
      status,
      "Remote environment rejected the stored access token",
      "remote_unauthorized",
    );
  }
  if (status < 200 || status >= 300) {
    const detail =
      json && typeof json === "object" && "reason" in json
        ? String((json as { reason?: unknown }).reason ?? "")
        : "";
    throw failRemote(
      status >= 400 && status < 600 ? status : 502,
      detail
        ? `Remote orchestration dispatch failed: ${detail}`
        : `Remote orchestration dispatch failed (HTTP ${status})`,
      "remote_dispatch_failed",
    );
  }
}

export async function resolveOrCreateRemoteT3Project(input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
  readonly workspaceRoot: string;
  readonly projectIdOverride: string | null;
  readonly preferredTitle: string | null | undefined;
  readonly newIds: () => { readonly projectId: string; readonly commandId: string };
  readonly nowIso: string;
}): Promise<OrchestrationProjectShell> {
  const shell = await fetchRemoteShellSnapshot(input);
  const matched = matchRemoteT3Project(shell.projects, {
    workspaceRoot: input.workspaceRoot,
    projectIdOverride: input.projectIdOverride,
  });
  if (matched.kind === "found") return matched.project;
  if (matched.kind === "missing_id") {
    throw failRemote(
      404,
      `T3 project not found on remote: ${matched.projectId}`,
      "project_not_found",
    );
  }

  const ids = input.newIds();
  const basename =
    input.workspaceRoot
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop()
      ?.trim() || "project";
  const title = input.preferredTitle?.trim() || basename;

  // Omit createWorkspaceRootIfMissing — older remotes reject an explicit false,
  // and a true value fails when another project already owns the path.
  await dispatchRemoteOrchestrationCommand({
    httpBaseUrl: input.httpBaseUrl,
    accessToken: input.accessToken,
    command: {
      type: "project.create",
      commandId: ids.commandId,
      projectId: ids.projectId,
      title,
      workspaceRoot: input.workspaceRoot,
      createdAt: input.nowIso,
    },
  });

  const after = await fetchRemoteShellSnapshot(input);
  const created = after.projects.find((project) => project.id === ids.projectId);
  if (created) return created;

  const rematch = matchRemoteT3Project(after.projects, {
    workspaceRoot: input.workspaceRoot,
    projectIdOverride: null,
  });
  if (rematch.kind === "found") return rematch.project;

  throw failRemote(
    500,
    `Created remote T3 project ${ids.projectId} but it is not visible yet`,
    "project_create_failed",
  );
}

export function resolveRemoteModelSelection(input: {
  readonly preferred: ModelSelection | null;
  readonly projectDefault: ModelSelection | null | undefined;
}): ModelSelection {
  if (input.preferred) return input.preferred;
  if (input.projectDefault) return input.projectDefault;
  // Remotes often lack a provider catalog over HTTP; cursor/default matches the
  // common paired-server setup used by BacksterDEV.
  return createModelSelection(ProviderInstanceId.make("cursor"), "default");
}

export function remoteWorkspaceExistsInProjects(
  projects: ReadonlyArray<{ readonly workspaceRoot: string }>,
  workspaceRoot: string,
): boolean {
  const normalized = normalizeProjectPathForComparison(workspaceRoot);
  if (!normalized) return false;
  return projects.some(
    (project) => normalizeProjectPathForComparison(project.workspaceRoot) === normalized,
  );
}
