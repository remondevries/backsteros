import * as SecureStore from "expo-secure-store";

const DEFAULT_ASSIGNEE_STORAGE_KEY = "backsteros.settings.default-assignee-id";

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
