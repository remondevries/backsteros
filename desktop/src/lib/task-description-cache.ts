import type { BacksterosApiClient } from "@backsteros/api-client";
import type { Task as ApiTask } from "@backsteros/contracts";

import { createSessionLruCache } from "./session-lru-cache";

/** Bounded warm cache for task descriptions after PowerSync/detail load. Not a body store. */
const descriptionCache = createSessionLruCache<string>(48);

const inflight = new Map<string, Promise<string | null>>();

export function peekTaskDescriptionCache(taskId: string): string | null {
  return descriptionCache.peek(taskId);
}

export function writeTaskDescriptionCache(
  taskId: string,
  description: string,
): void {
  descriptionCache.set(taskId, description);
}

export function discardTaskDescriptionCache(taskId: string): void {
  descriptionCache.delete(taskId);
  inflight.delete(taskId);
}

/**
 * Fetch a single task's description via GET /api/v1/tasks/:id.
 * Cold empty-DB fallback only — prefer PowerSync via useDesktopTaskDescription.
 */
export function fetchTaskDescription(
  client: BacksterosApiClient,
  taskId: string,
): Promise<string | null> {
  const id = taskId.trim();
  if (!id) return Promise.resolve(null);

  const cached = descriptionCache.peek(id);
  if (cached != null) return Promise.resolve(cached);

  const pending = inflight.get(id);
  if (pending) return pending;

  const request = client
    .requestJson<ApiTask>(`/api/v1/tasks/${encodeURIComponent(id)}`)
    .then((task) => {
      const description =
        typeof task.description === "string" ? task.description : "";
      descriptionCache.set(id, description);
      return description;
    })
    .catch((error) => {
      console.warn(
        `[task-description] failed to fetch ${id}:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    })
    .finally(() => {
      inflight.delete(id);
    });

  inflight.set(id, request);
  return request;
}
