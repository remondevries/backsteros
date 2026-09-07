import { DEFAULT_BACKSTEROS_API_URL, readBacksterosConnectionSettings } from "./settingsStore";
import type {
  BacksterosCodebaseProject,
  BacksterosContact,
  BacksterosCreateTaskActivityInput,
  BacksterosCreateTaskInput,
  BacksterosOrganization,
  BacksterosProjectsResponse,
  BacksterosTask,
  BacksterosTaskActivitiesResponse,
  BacksterosTaskActivity,
  BacksterosTaskAgentPresence,
  BacksterosTaskComment,
  BacksterosTaskCommentsResponse,
  BacksterosTaskDetail,
  BacksterosTasksResponse,
  BacksterosTaskUpdatePatch,
} from "./types";

function normalizeApiUrl(apiUrl: string): string {
  return apiUrl.trim().replace(/\/$/, "") || DEFAULT_BACKSTEROS_API_URL;
}

function isLocalBacksterosUrl(apiUrl: string): boolean {
  try {
    const url = new URL(apiUrl);
    return (
      (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
      (url.port === "8788" || url.port === "")
    );
  } catch {
    return false;
  }
}

/**
 * Local default URL goes through `/backsteros-api` (Vite `server.proxy` in web
 * dev; Electron protocol + T3 server proxy in packaged desktop). Custom URLs
 * call BacksterOS directly with the key from settings.
 */
function resolveBacksterosRequest(pathWithQuery: string): {
  readonly url: string;
  readonly headers: Record<string, string>;
} {
  const settings = readBacksterosConnectionSettings();
  const apiUrl = normalizeApiUrl(settings.apiUrl);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (settings.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }

  const normalizedPath = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;

  if (isLocalBacksterosUrl(apiUrl)) {
    return { url: `/backsteros-api${normalizedPath}`, headers };
  }

  if (!settings.apiKey) {
    throw new Error("Add a BacksterOS API key in Settings → Integrations.");
  }

  return { url: `${apiUrl}${normalizedPath}`, headers };
}

async function readBacksterosJsonBody<T>(response: Response): Promise<T> {
  const raw = await response.text();
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined as T;
  }
  if (trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
    throw new Error(
      "BacksterOS returned a web page instead of JSON. Check the API URL in Settings → Integrations (use the API host, e.g. http://127.0.0.1:8788).",
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      "BacksterOS returned a non-JSON response. Check the API URL and key in Settings → Integrations.",
    );
  }
}

async function backsterosFetchJson<T>(
  pathWithQuery: string,
  init?: {
    readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    readonly body?: unknown;
    readonly signal?: AbortSignal;
  },
): Promise<T> {
  const request = resolveBacksterosRequest(pathWithQuery);
  const method = init?.method ?? "GET";
  const headers: Record<string, string> = { ...request.headers };
  if (init?.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(request.url, {
    method,
    headers,
    cache: "no-store",
    ...(init?.signal ? { signal: init.signal } : {}),
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

  if (!response.ok) {
    const body = await readBacksterosJsonBody<{ error?: unknown } | null>(response).catch(
      () => null,
    );
    const message =
      typeof body?.error === "string"
        ? body.error
        : response.status === 401 || response.status === 403
          ? "BacksterOS rejected the API key. Check Settings → Integrations."
          : `BacksterOS request failed (${response.status})`;
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return readBacksterosJsonBody<T>(response);
}

async function backsterosFetchBlob(pathWithQuery: string, signal?: AbortSignal): Promise<Blob> {
  const request = resolveBacksterosRequest(pathWithQuery);
  const response = await fetch(request.url, {
    method: "GET",
    headers: request.headers,
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new Error(`BacksterOS avatar request failed (${response.status})`);
  }
  return response.blob();
}

function optionalSignalInit(signal?: AbortSignal): { readonly signal?: AbortSignal } {
  return signal ? { signal } : {};
}

export async function fetchBacksterosCodebaseProjects(
  signal?: AbortSignal,
): Promise<readonly BacksterosCodebaseProject[]> {
  const payload = await backsterosFetchJson<BacksterosProjectsResponse>(
    "/api/v1/projects?type=codebase",
    optionalSignalInit(signal),
  );
  return (payload.projects ?? []).filter((project) => project.type === "codebase");
}

export async function fetchBacksterosProjectTasks(
  projectId: string,
  signal?: AbortSignal,
): Promise<readonly BacksterosTask[]> {
  const params = new URLSearchParams({ projectId });
  const payload = await backsterosFetchJson<BacksterosTasksResponse>(
    `/api/v1/tasks?${params.toString()}`,
    optionalSignalInit(signal),
  );
  return payload.tasks ?? [];
}

/** Statuses surfaced in the BacksterOS rail Inbox (attention queue). */
export const BACKSTEROS_INBOX_ATTENTION_STATUSES = [
  "triage",
  "in_review",
  "in_progress",
  "on_hold",
] as const;

/**
 * Cross-project attention tasks: Triage, In Review, and On Hold.
 * Fetches each status in parallel (core list API filters one status at a time).
 */
export async function fetchBacksterosInboxAttentionTasks(
  signal?: AbortSignal,
): Promise<readonly BacksterosTask[]> {
  const payloads = await Promise.all(
    BACKSTEROS_INBOX_ATTENTION_STATUSES.map(async (status) => {
      const params = new URLSearchParams({ status });
      return backsterosFetchJson<BacksterosTasksResponse>(
        `/api/v1/tasks?${params.toString()}`,
        optionalSignalInit(signal),
      );
    }),
  );
  const byId = new Map<string, BacksterosTask>();
  for (const payload of payloads) {
    for (const task of payload.tasks ?? []) {
      byId.set(task.id, task);
    }
  }
  return [...byId.values()];
}

export async function fetchBacksterosTask(
  taskId: string,
  signal?: AbortSignal,
): Promise<BacksterosTaskDetail> {
  return backsterosFetchJson<BacksterosTaskDetail>(
    `/api/v1/tasks/${encodeURIComponent(taskId)}`,
    optionalSignalInit(signal),
  );
}

export async function fetchBacksterosTaskComments(
  taskId: string,
  signal?: AbortSignal,
): Promise<readonly BacksterosTaskComment[]> {
  const payload = await backsterosFetchJson<BacksterosTaskCommentsResponse>(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/comments`,
    optionalSignalInit(signal),
  );
  return payload.comments ?? [];
}

export async function fetchBacksterosTaskActivities(
  taskId: string,
  signal?: AbortSignal,
): Promise<readonly BacksterosTaskActivity[]> {
  const payload = await backsterosFetchJson<BacksterosTaskActivitiesResponse>(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/activities`,
    optionalSignalInit(signal),
  );
  return payload.activities ?? [];
}

export async function createBacksterosTaskComment(
  taskId: string,
  body: string,
  parentCommentId?: string | null,
): Promise<BacksterosTaskComment> {
  return backsterosFetchJson<BacksterosTaskComment>(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/comments`,
    {
      method: "POST",
      body: {
        body,
        ...(parentCommentId ? { parentCommentId } : {}),
      },
    },
  );
}

export async function updateBacksterosTaskComment(
  taskId: string,
  commentId: string,
  patch: { readonly body?: string; readonly resolvedAt?: string | null },
): Promise<BacksterosTaskComment> {
  return backsterosFetchJson<BacksterosTaskComment>(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`,
    {
      method: "PATCH",
      body: patch,
    },
  );
}

export async function deleteBacksterosTaskComment(
  taskId: string,
  commentId: string,
): Promise<void> {
  await backsterosFetchJson<undefined>(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`,
    { method: "DELETE" },
  );
}

export async function createBacksterosTask(
  input: BacksterosCreateTaskInput,
): Promise<BacksterosTaskDetail> {
  return backsterosFetchJson<BacksterosTaskDetail>("/api/v1/tasks", {
    method: "POST",
    body: input,
  });
}

export async function updateBacksterosTask(
  taskId: string,
  patch: BacksterosTaskUpdatePatch,
): Promise<BacksterosTaskDetail> {
  return backsterosFetchJson<BacksterosTaskDetail>(`/api/v1/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    body: patch,
  });
}

export async function createBacksterosTaskActivity(
  taskId: string,
  body: BacksterosCreateTaskActivityInput,
): Promise<BacksterosTaskActivity> {
  return backsterosFetchJson<BacksterosTaskActivity>(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/activities`,
    {
      method: "POST",
      body,
    },
  );
}

export async function fetchBacksterosAgentPresence(options?: {
  readonly projectId?: string | null;
  readonly signal?: AbortSignal;
}): Promise<readonly BacksterosTaskAgentPresence[]> {
  const params = new URLSearchParams();
  if (options?.projectId?.trim()) {
    params.set("projectId", options.projectId.trim());
  }
  const query = params.toString();
  const payload = await backsterosFetchJson<{
    presence?: readonly BacksterosTaskAgentPresence[];
  }>(`/api/v1/agent-presence${query ? `?${query}` : ""}`, {
    ...(options?.signal ? { signal: options.signal } : {}),
  });
  return payload.presence ?? [];
}

export async function upsertBacksterosTaskAgentPresence(
  taskId: string,
  body?: {
    readonly source?: string;
    readonly sessionId?: string | null;
  },
): Promise<BacksterosTaskAgentPresence> {
  return backsterosFetchJson<BacksterosTaskAgentPresence>(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/agent-presence`,
    {
      method: "PUT",
      body: body ?? { source: "t3" },
    },
  );
}

export async function clearBacksterosTaskAgentPresence(taskId: string): Promise<void> {
  await backsterosFetchJson<undefined>(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/agent-presence`,
    { method: "DELETE" },
  );
}

/**
 * Open the live agent-presence SSE stream. Caller owns AbortSignal + reader loop.
 */
export async function openBacksterosAgentPresenceEvents(signal: AbortSignal): Promise<Response> {
  const request = resolveBacksterosRequest("/api/v1/agent-presence/events");
  const response = await fetch(request.url, {
    method: "GET",
    headers: {
      ...request.headers,
      Accept: "text/event-stream",
    },
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(`BacksterOS agent presence events failed (${response.status})`);
  }
  return response;
}

export async function fetchBacksterosContacts(
  signal?: AbortSignal,
): Promise<readonly BacksterosContact[]> {
  const payload = await backsterosFetchJson<{ contacts?: readonly BacksterosContact[] }>(
    "/api/v1/contacts",
    optionalSignalInit(signal),
  );
  return payload.contacts ?? [];
}

export async function fetchBacksterosContact(
  contactId: string,
  signal?: AbortSignal,
): Promise<BacksterosContact | null> {
  try {
    return await backsterosFetchJson<BacksterosContact>(
      `/api/v1/contacts/${encodeURIComponent(contactId)}`,
      optionalSignalInit(signal),
    );
  } catch {
    return null;
  }
}

/** Download a contact/org avatar blob (`GET /api/v1/avatars/:entityType/:entityId`). */
export async function fetchBacksterosAvatar(
  entityType: "contact" | "organization" | "bank_account",
  entityId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  return backsterosFetchBlob(
    `/api/v1/avatars/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
    signal,
  );
}

export async function fetchBacksterosOrganizations(
  signal?: AbortSignal,
): Promise<readonly BacksterosOrganization[]> {
  const payload = await backsterosFetchJson<{
    organizations?: readonly BacksterosOrganization[];
  }>("/api/v1/organizations", optionalSignalInit(signal));
  return payload.organizations ?? [];
}
