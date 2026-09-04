import * as SecureStore from "expo-secure-store";

import { randomUuid } from "./random-uuid";

// SecureStore allows only alphanumeric, ".", "-", "_" (no ":").
const KEY = "backsteros.mobile-powersync-device-id";

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY);
  if (existing) return existing;
  const created = randomUuid();
  await SecureStore.setItemAsync(KEY, created);
  return created;
}
