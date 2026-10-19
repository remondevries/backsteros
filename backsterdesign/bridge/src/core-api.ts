export type CoreConfig = {
  baseUrl: string;
  apiKey: string;
};

export type ApiProject = {
  id: string;
  key: string;
  name: string;
  status?: string | null;
  icon?: string | null;
  type?: string | null;
  penpotProjectId?: string | null;
};

export type ApiContact = {
  id: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  avatarStorageKey?: string | null;
  avatarUpdatedAt?: number | string | null;
};

export type ApiOrganization = {
  id: string;
  name: string;
  key?: string | null;
  avatarStorageKey?: string | null;
  avatarUpdatedAt?: number | string | null;
};

export type ApiTaskLink = {
  id: string;
  url: string;
  createdAt: string;
};

export type ApiTask = {
  id: string;
  key?: string | null;
  number?: number | string | null;
  title: string;
  description?: string | null;
  status: string;
  priority?: number | null;
  dueDate?: string | number | null;
  dueEndDate?: string | number | null;
  projectId?: string | null;
  contactId?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  relatedContactIds?: string[] | null;
  relatedOrganizationIds?: string[] | null;
  linkedEmailIds?: string[] | null;
  labelIds?: string[] | null;
  links?: ApiTaskLink[] | null;
  sortOrder?: number | null;
  updatedAt?: string | number | null;
  agentChatId?: string | null;
  agentWorkingContactId?: string | null;
  agentWorkingStartedAt?: string | number | null;
  agentWorkingLabel?: string | null;
  agentWorkingKind?: string | null;
  agentWorkingContactName?: string | null;
  linkedCommitShas?: string[] | null;
  habitId?: string | null;
  agentCreatedAt?: string | number | null;
  agentInboxApprovedAt?: string | number | null;
  trackedMinutes?: number | null;
  trackedDurationSeconds?: number | null;
  inboxUpdatedAt?: string | number | null;
  support?: boolean | null;
  notification?: boolean | null;
  inbox?: boolean | null;
};

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function readCoreConfig(): CoreConfig | null {
  const cfg = (window as Window & { backsterosCore?: { baseUrl?: string; apiKey?: string } })
    .backsterosCore;
  if (!cfg?.baseUrl) return null;
  return {
    baseUrl: trimSlash(cfg.baseUrl),
    apiKey: cfg.apiKey || "local",
  };
}

export async function apiJson<T>(
  config: CoreConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${body || res.statusText}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/** TaskActivityPanel-compatible JSON helper bound to core config. */
export function createCoreRequestJson(config: CoreConfig) {
  return function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    return apiJson<T>(config, path, init);
  };
}

export async function resolveProjectByPenpotId(
  config: CoreConfig,
  penpotProjectId: string,
): Promise<ApiProject | null> {
  const data = await apiJson<{
    items?: ApiProject[];
    projects?: ApiProject[];
  }>(config, "/api/v1/projects?paginated=true&limit=200");
  const items = data.items ?? data.projects ?? [];
  const needle = penpotProjectId.toLowerCase();
  return (
    items.find(
      (p) => (p.penpotProjectId ?? "").toLowerCase() === needle,
    ) ?? null
  );
}

export async function fetchProjectTasks(
  config: CoreConfig,
  projectId: string,
): Promise<ApiTask[]> {
  // status=all requires paginated=true (returns `items`); plain list omits
  // the all-status expansion and may return a different shape.
  const qs = new URLSearchParams({
    projectId,
    status: "all",
    paginated: "true",
    limit: "200",
  });
  const data = await apiJson<{
    tasks?: ApiTask[];
    items?: ApiTask[];
  }>(config, `/api/v1/tasks?${qs.toString()}`);
  return data.items ?? data.tasks ?? [];
}

export async function fetchTask(
  config: CoreConfig,
  taskId: string,
): Promise<ApiTask> {
  return apiJson<ApiTask>(
    config,
    `/api/v1/tasks/${encodeURIComponent(taskId)}`,
  );
}

export async function patchTask(
  config: CoreConfig,
  taskId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await apiJson(config, `/api/v1/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function createTask(
  config: CoreConfig,
  input: { projectId: string; title: string; status: string },
): Promise<{ id: string }> {
  const created = await apiJson<{ id: string }>(config, "/api/v1/tasks", {
    method: "POST",
    body: JSON.stringify({
      projectId: input.projectId,
      title: input.title,
      status: input.status,
    }),
  });
  return { id: created.id };
}

/** Soft-delete a task (`DELETE /api/v1/tasks/:id` → 204). */
export async function deleteTask(
  config: CoreConfig,
  taskId: string,
): Promise<void> {
  await apiJson(config, `/api/v1/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
  });
}

/** Best-effort timer activity so chrome / other clients see running timers. */
export async function postTaskTimerActivity(
  config: CoreConfig,
  taskId: string,
  action: "start" | "pause",
  sessionSeconds?: number | null,
): Promise<void> {
  const body =
    action === "start"
      ? { type: "timer_started" as const }
      : {
          type: "timer_stopped" as const,
          data: {
            durationSeconds: Math.max(0, Math.round(sessionSeconds ?? 0)),
          },
        };
  await apiJson(
    config,
    `/api/v1/tasks/${encodeURIComponent(taskId)}/activities`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export async function fetchContacts(
  config: CoreConfig,
): Promise<ApiContact[]> {
  const data = await apiJson<{
    contacts?: ApiContact[];
    items?: ApiContact[];
  }>(config, "/api/v1/contacts");
  return data.contacts ?? data.items ?? [];
}

export async function fetchOrganizations(
  config: CoreConfig,
): Promise<ApiOrganization[]> {
  const data = await apiJson<{
    organizations?: ApiOrganization[];
    items?: ApiOrganization[];
  }>(config, "/api/v1/organizations");
  return data.organizations ?? data.items ?? [];
}

export async function fetchProjects(
  config: CoreConfig,
): Promise<ApiProject[]> {
  const data = await apiJson<{
    items?: ApiProject[];
    projects?: ApiProject[];
  }>(config, "/api/v1/projects?paginated=true&limit=200");
  return data.items ?? data.projects ?? [];
}

/** Download a contact/org avatar blob (`GET /api/v1/avatars/:entityType/:entityId`). */
export async function fetchAvatar(
  config: CoreConfig,
  entityType: "contact" | "organization",
  entityId: string,
): Promise<Blob> {
  const res = await fetch(
    `${config.baseUrl}/api/v1/avatars/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "image/*,application/octet-stream",
      },
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${body || res.statusText}`);
  }
  return res.blob();
}
