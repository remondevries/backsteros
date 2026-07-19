import * as SecureStore from "expo-secure-store";

const KEY = "backsteros:mobile-powersync-device-id";

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  await SecureStore.setItemAsync(KEY, created);
  return created;
}
