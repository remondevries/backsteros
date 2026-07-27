import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

// SecureStore allows only alphanumeric, ".", "-", "_" (no ":").
const KEY = "backsteros.mobile-powersync-device-id";

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY);
  if (existing) return existing;
  const created =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : Crypto.randomUUID();
  await SecureStore.setItemAsync(KEY, created);
  return created;
}
