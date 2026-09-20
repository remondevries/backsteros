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

function controlAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json" };
  const { apiKey } = readBacksterosConnectionSettings();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

export async function fetchControlBindings(signal?: AbortSignal): Promise<{
  readonly ok: boolean;
  readonly bindings: ReadonlyArray<ControlSessionBinding>;
}> {
  const response = await fetch("/api/backsteros/control/bindings", {
    method: "GET",
    credentials: "include",
    headers: controlAuthHeaders(),
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    return { ok: false, bindings: [] };
  }
  const payload = (await response.json()) as {
    ok?: boolean;
    bindings?: ReadonlyArray<ControlSessionBinding>;
  };
  return {
    ok: payload.ok === true,
    bindings: Array.isArray(payload.bindings) ? payload.bindings : [],
  };
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
    const response = await fetch("/api/backsteros/control/bindings", {
      method: "PUT",
      credentials: "include",
      headers: {
        ...controlAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(binding),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function syncControlBindingsFromServer(signal?: AbortSignal): Promise<number> {
  const result = await fetchControlBindings(signal);
  if (!result.ok) return 0;
  return mergeControlBindingsIntoTaskChatStore(result.bindings);
}
