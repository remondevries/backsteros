const DEFAULT_ASSIGNEE_STORAGE_KEY = "backsteros.settings.default-assignee-id";

export function getDefaultAssigneeId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(DEFAULT_ASSIGNEE_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setDefaultAssigneeId(assigneeId: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (assigneeId) {
      window.localStorage.setItem(DEFAULT_ASSIGNEE_STORAGE_KEY, assigneeId);
    } else {
      window.localStorage.removeItem(DEFAULT_ASSIGNEE_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors (private browsing, quota, etc.)
  }
}
