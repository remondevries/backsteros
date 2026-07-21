import * as SecureStore from "expo-secure-store";

const DEFAULT_ASSIGNEE_STORAGE_KEY = "backsteros.settings.default-assignee-id";

/** Workspace settings JSON key (PATCH /api/v1/settings). */
export const DEFAULT_ASSIGNEE_SETTINGS_KEY = "defaultAssigneeId";

export async function getDefaultAssigneeId(): Promise<string | null> {
  try {
    return (await SecureStore.getItemAsync(DEFAULT_ASSIGNEE_STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

export async function setDefaultAssigneeId(
  assigneeId: string | null,
): Promise<void> {
  try {
    if (assigneeId) {
      await SecureStore.setItemAsync(DEFAULT_ASSIGNEE_STORAGE_KEY, assigneeId);
    } else {
      await SecureStore.deleteItemAsync(DEFAULT_ASSIGNEE_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

/**
 * `undefined` = key absent on server (may still have a local-only value).
 * `null` = explicitly cleared. string = contact id.
 */
export function parseDefaultAssigneeIdFromSettings(
  settings: Record<string, unknown>,
): string | null | undefined {
  if (!(DEFAULT_ASSIGNEE_SETTINGS_KEY in settings)) {
    return undefined;
  }
  const value = settings[DEFAULT_ASSIGNEE_SETTINGS_KEY];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
}

/** Apply server settings to the local cache; return the effective value. */
export async function syncDefaultAssigneeIdFromSettings(
  settings: Record<string, unknown>,
): Promise<string | null> {
  const parsed = parseDefaultAssigneeIdFromSettings(settings);
  if (parsed === undefined) {
    return getDefaultAssigneeId();
  }
  await setDefaultAssigneeId(parsed);
  return parsed;
}
