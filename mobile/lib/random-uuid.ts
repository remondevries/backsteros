import * as ExpoCrypto from "expo-crypto";

/**
 * UUID v4 for React Native. Hermes does not expose `globalThis.crypto`, so
 * bare `crypto.randomUUID()` throws ("Property 'crypto' doesn't exist").
 */
export function randomUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return ExpoCrypto.randomUUID();
}

/** UUID without hyphens — PowerSync / SQLite row ids. */
export function randomUuidCompact(): string {
  return randomUuid().replace(/-/g, "");
}
