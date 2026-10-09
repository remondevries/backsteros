/**
 * Client helpers for the BacksterDEV localhost control API.
 * Syncs server-side task↔thread bindings into the local task chat store.
 */
import type { BacksterosTaskChatBinding } from "./taskChatStore";
import { useBacksterosTaskChatStore } from "./taskChatStore";
import { readBacksterosConnectionSettings } from "./settingsStore";

export type ControlSessionBinding = {
  readonly taskId: string;
  readonly kind: "thread";
  readonly threadId: string;
  readonly environmentId: string;
  readonly t3ProjectId: string;
  readonly backsterosProjectId: string;
  readonly projectTitle: string;
  readonly title: string;
  readonly displayId: string | null;
  readonly updatedAt?: string;
};

function toLocalBinding(entry: ControlSessionBinding): BacksterosTaskChatBinding {
  return {
    kind: "thread",
    threadId: entry.threadId,
    environmentId: entry.environmentId,
    t3ProjectId: entry.t3ProjectId,
    backsterosProjectId: entry.backsterosProjectId,
    projectTitle: entry.projectTitle,
    title: entry.title,
    displayId: entry.displayId,
  };
}

/**
 * Merge server bindings into the local store. A server thread binding replaces
 * a local kickoff draft for the same task (the draft is only the pre-start
 * gate; a live control thread is authoritative). Keep a draft only when there
 * is no server thread binding for that task.
 */
export function mergeControlBindingsIntoTaskChatStore(
  bindings: ReadonlyArray<ControlSessionBinding>,
): number {
  const store = useBacksterosTaskChatStore.getState();
  let applied = 0;
  for (const entry of bindings) {
    const existing = store.getBinding(entry.taskId);
    if (
      existing?.kind === "thread" &&
      existing.threadId === entry.threadId &&
      existing.environmentId === entry.environmentId
    ) {
      continue;
    }
    store.setBinding(entry.taskId, toLocalBinding(entry));
    applied += 1;
  }
  return applied;
}

function controlAuthHeaders(includeApiKey: boolean): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (!includeApiKey) return headers;
  const { apiKey } = readBacksterosConnectionSettings();
  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }
  return headers;
}

async function readControlBindingsResponse(response: Response): Promise<{
  readonly ok: boolean;
  readonly bindings: ReadonlyArray<ControlSessionBinding>;
}> {
  if (!response.ok) {
    return { ok: false, bindings: [] };
  }
  const payload = (await response.json()) as {
    ok?: boolean;
    bindings?: ReadonlyArray<ControlSessionBinding>;
  };
  const bindings = Array.isArray(payload.bindings) ? payload.bindings : [];
  // Accept either an explicit ok:true or a well-formed bindings list — the
  // rail must still hydrate when a proxy strips the ok flag.
  return {
    ok: payload.ok === true || bindings.length > 0,
    bindings,
  };
}

export async function fetchControlBindings(signal?: AbortSignal): Promise<{
  readonly ok: boolean;
  readonly bindings: ReadonlyArray<ControlSessionBinding>;
}> {
  const init = {
    method: "GET" as const,
    credentials: "include" as const,
    ...(signal ? { signal } : {}),
    cache: "no-store" as const,
  };
  // Prefer pairing-session cookies. Only send the BacksterOS API key when the
  // cookie-authenticated request is rejected — a mismatched Bearer key was
  // previously treated as a pairing token and 401'd the whole Inbox open path.
  const cookieResponse = await fetch("/api/backsteros/control/bindings", {
    ...init,
    headers: controlAuthHeaders(false),
  });
  if (cookieResponse.ok || cookieResponse.status !== 401) {
    return readControlBindingsResponse(cookieResponse);
  }
  const { apiKey } = readBacksterosConnectionSettings();
  if (!apiKey.trim()) {
    return { ok: false, bindings: [] };
  }
  const apiKeyResponse = await fetch("/api/backsteros/control/bindings", {
    ...init,
    headers: controlAuthHeaders(true),
  });
  return readControlBindingsResponse(apiKeyResponse);
}

export async function pushControlBinding(binding: {
  readonly taskId: string;
  readonly threadId: string;
  readonly environmentId: string;
  readonly t3ProjectId: string;
  readonly backsterosProjectId: string;
  readonly projectTitle: string;
  readonly title: string;
  readonly displayId: string | null;
}): Promise<boolean> {
  try {
    const body = JSON.stringify(binding);
    const cookieResponse = await fetch("/api/backsteros/control/bindings", {
      method: "PUT",
      credentials: "include",
      headers: {
        ...controlAuthHeaders(false),
        "Content-Type": "application/json",
      },
      body,
      cache: "no-store",
    });
    if (cookieResponse.ok || cookieResponse.status !== 401) {
      return cookieResponse.ok;
    }
    const { apiKey } = readBacksterosConnectionSettings();
    if (!apiKey.trim()) return false;
    const apiKeyResponse = await fetch("/api/backsteros/control/bindings", {
      method: "PUT",
      credentials: "include",
      headers: {
        ...controlAuthHeaders(true),
        "Content-Type": "application/json",
      },
      body,
      cache: "no-store",
    });
    return apiKeyResponse.ok;
  } catch {
    return false;
  }
}

export async function syncControlBindingsFromServer(signal?: AbortSignal): Promise<number> {
  const result = await fetchControlBindings(signal);
  if (!result.ok) return 0;
  return mergeControlBindingsIntoTaskChatStore(result.bindings);
}
